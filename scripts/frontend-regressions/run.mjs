import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { chromium } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { runBrowser } from '../../frontend/tests/browser.mjs';
import { runModeled } from '../../frontend/tests/modeled.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = `${root}.playwright-mcp/frontend-regressions`;
const leasePath = `${artifacts}/project.json`;
const overridePath = `${artifacts}/compose.json`;
const scenario = process.argv.find(arg => arg.startsWith('--scenario='))?.split('=')[1];
if (scenario && scenario.split(',').some(key => !['ai', 'realtime', 'forwarding', 'reconnect', 'mobile'].includes(key))) throw new Error('Unknown scenario');
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--scenario='));
const modeledOnly = args.length === 1 && args[0] === '--modeled';
const cleanupOnly = args.length === 1 && args[0] === '--cleanup';
const build = args.length === 1 && args[0] === '--build';
const reuse = args.length === 3 && args[0] === '--images';
if (!cleanupOnly && !build && !reuse && !modeledOnly) {
  console.error('Usage: node scripts/frontend-regressions/run.mjs --build | --images PHP_IMAGE NGINX_IMAGE | --modeled | --cleanup [--scenario=ai|realtime|forwarding|reconnect|mobile]');
  process.exit(1);
}
mkdirSync(artifacts, { recursive: true });
const report = message => console.log(message);
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_HOST']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  APP_ENV: 'prod', APP_DEBUG: '0', ANTHROPIC_API_KEY: '',
  NGINX_PORT: '127.0.0.1:0', CORS_ORIGINS: 'http://127.0.0.1',
  MERCURE_PUBLIC_URL: 'http://127.0.0.1/.well-known/mercure',
  MERCURE_JWT_SECRET: randomBytes(32).toString('hex'),
  POSTGRES_DB: 'regression', POSTGRES_USER: 'regression',
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'), BUILDX_BUILDER: 'default',
});
let project, endpointDigest, owned = false, cleaning = false, browser, vite;
const controller = new AbortController();
const children = new Set();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (cleaning) return;
  controller.abort();
  for (const child of children) child.kill('SIGTERM');
  void browser?.close();
});
async function docker(args, label, timeout = 30000) {
  if (!cleaning && controller.signal.aborted) throw new Error('Interrupted');
  const result = await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let output = '';
    // Capture in memory only: Docker/API diagnostics can contain credentials.
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', () => { clearTimeout(timer); children.delete(child); reject(new Error(`Cannot start ${label}`)); });
    child.on('close', code => { clearTimeout(timer); children.delete(child); resolve({ code, output }); });
  });
  if (result.code !== 0) throw new Error(`${label} failed (output withheld)`);
  return result.output.trim();
}
const compose = (args, label, timeout) => docker(['compose', '--env-file', '/dev/null',
  '--project-name', project, '-f', `${root}docker-compose.yml`, '-f', overridePath, ...args], label, timeout);
async function inventory() {
  const filter = `label=com.docker.compose.project=${project}`;
  return Promise.all([
    docker(['ps', '-aq', '--filter', filter], 'container inventory'),
    docker(['network', 'ls', '-q', '--filter', filter], 'network inventory'),
    docker(['volume', 'ls', '-q', '--filter', filter], 'volume inventory'),
  ]);
}
async function cleanup() {
  cleaning = true;
  await compose(['down', '--volumes', '--remove-orphans', '--timeout', '10'], 'cleanup', 60000);
  if ((await inventory()).some(Boolean)) throw new Error('Temporary resources remain');
  writeFileSync(leasePath, JSON.stringify({ project, endpointDigest, cleaned: true }));
  report('PASS cleanup: no regression containers, networks or volumes remain');
}
try {
  if (modeledOnly) {
    browser = await chromium.launch({ headless: true, ...(process.env.REGRESSION_BROWSER_CHANNEL ? { channel: process.env.REGRESSION_BROWSER_CHANNEL } : {}) });
    vite = await createServer({ root: `${root}frontend`, configFile: false, envFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
    await vite.listen();
    await runModeled({ browser, base: `http://127.0.0.1:${vite.httpServer.address().port}`, report });
  } else {
    const endpoint = env.DOCKER_CONTEXT || !env.DOCKER_HOST
      ? await docker(['context', 'inspect', ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []),
        '--format', '{{.Endpoints.docker.Host}}'], 'Docker context') : env.DOCKER_HOST;
    if (!endpoint.startsWith('unix://')) throw new Error('A local Unix-socket Docker engine is required');
    delete env.DOCKER_CONTEXT;
    env.DOCKER_HOST = endpoint;
    endpointDigest = createHash('sha256').update(endpoint).digest('hex');
    if (cleanupOnly) {
      if (existsSync(leasePath)) {
        const lease = JSON.parse(readFileSync(leasePath, 'utf8'));
        if (!/^rt-regressions-[0-9a-f]{16}$/.test(lease.project) || lease.endpointDigest !== endpointDigest)
          throw new Error('Invalid ownership record or different Docker engine');
        project = lease.project;
        await cleanup();
      }
    } else {
      if (existsSync(leasePath) && !JSON.parse(readFileSync(leasePath, 'utf8')).cleaned)
        throw new Error('Run --cleanup for the previous regression project first');
      browser = await chromium.launch({ headless: true, ...(process.env.REGRESSION_BROWSER_CHANNEL ? { channel: process.env.REGRESSION_BROWSER_CHANNEL } : {}) });
      project = `rt-regressions-${randomBytes(8).toString('hex')}`;
      if ((await inventory()).some(Boolean)) throw new Error('Refusing existing resources');
      const services = Object.fromEntries(['php', 'nginx', 'postgres', 'mercure', 'scheduler']
        .map(name => [name, { restart: 'no' }]));
      if (reuse) {
        // Reuse only explicitly selected locally available images; never pull them.
        for (const image of args.slice(1)) await docker(['image', 'inspect', image, '--format', '{{.Id}}'], 'local image lookup');
        services.php.image = args[1]; services.scheduler.image = args[1]; services.nginx.image = args[2];
      }
      if (build) {
        services.php.image = `${project}-php`; services.scheduler.image = `${project}-php`;
        services.nginx.image = 'nginx:1.27-alpine';
      }
      // Use the current proxy configuration even when reusing local images. Vite serves source.
      services.nginx.volumes = [`${root}docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro`];
      // Docker cannot publish ports from an internal-only network. Give only Nginx
      // an edge network; PHP/PostgreSQL/Mercure/scheduler retain no external route.
      services.nginx.networks = ['default', 'capture_edge'];
      writeFileSync(overridePath, JSON.stringify({ services,
        networks: { default: { internal: true }, capture_edge: {} } }));
      writeFileSync(leasePath, JSON.stringify({ project, endpointDigest, cleaned: false }));
      owned = true;
      if (build) await compose(['build', 'php'], 'regression image build', 600000);
      await compose(['up', '-d', '--no-build', '--pull', build ? 'missing' : 'never', '--wait', '--wait-timeout', '150'], 'regression startup', 180000);
      const binding = await compose(['port', 'nginx', '80'], 'loopback binding');
      if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error(`Expected an exclusive loopback binding; received ${JSON.stringify(binding)}`);
      const base = `http://${binding}`;
      const request = async (path, { method = 'GET', token, body, status = 200 } = {}) => {
        if (!path.startsWith('/api/') || /ai\/|link-preview/.test(path)) throw new Error('Forbidden regression API path');
        const response = await fetch(`${base}${path}`, { method, redirect: 'error',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (response.status !== status) throw new Error(`${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}: expected ${status}, got ${response.status}`);
        return response.json();
      };
      vite = await createServer({ root: `${root}frontend`, envFile: false, logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/api', '/.well-known/mercure', '/uploads']
          .map(path => [path, { target: base, changeOrigin: true }])) } });
      await vite.listen();
      const browserBase = `http://127.0.0.1:${vite.httpServer.address().port}`;
      await runBrowser({ browser, base: browserBase, request, report, scenario,
        restartHub: () => compose(['restart', '--timeout', '1', 'mercure'], 'restart isolated Mercure') });
    }
  }
} catch (error) {
  // Playwright exceptions may include DOM/API values: keep the saved report generic.
  console.error('FAIL frontend regressions (raw diagnostics withheld; see last scenario label)');
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await vite?.close().catch(() => {});
  if (owned) try { await cleanup(); } catch { console.error('FAIL cleanup; run --cleanup on the original local Docker engine'); process.exitCode = 1; }
}
