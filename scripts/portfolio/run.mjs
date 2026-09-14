import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed } from './scenario.mjs';
import { capture } from './capture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = `${root}.playwright-mcp/portfolio-media`;
const leasePath = `${artifacts}/project.json`;
const overridePath = `${artifacts}/compose.json`;
const args = process.argv.slice(2);
const cleanupOnly = args.length === 1 && args[0] === '--cleanup';
const build = args.length === 1 && args[0] === '--build';
const reuse = args.length === 3 && args[0] === '--images';
if (!cleanupOnly && !build && !reuse) {
  console.error('Usage: node scripts/portfolio/run.mjs --build | --images PHP_IMAGE NGINX_IMAGE | --cleanup');
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
  POSTGRES_DB: 'portfolio', POSTGRES_USER: 'portfolio',
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'), BUILDX_BUILDER: 'default',
});
let project, endpointDigest, owned = false, cleaning = false, browser;
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
  report('PASS cleanup: no portfolio containers, networks or volumes remain');
}
try {
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
      if (!/^rt-portfolio-[0-9a-f]{16}$/.test(lease.project) || lease.endpointDigest !== endpointDigest)
        throw new Error('Invalid ownership record or different Docker engine');
      project = lease.project;
      await cleanup();
    }
  } else {
    if (existsSync(leasePath) && !JSON.parse(readFileSync(leasePath, 'utf8')).cleaned)
      throw new Error('Run --cleanup for the previous portfolio project first');
    // Optional external tooling, never a production/frontend dependency.
    const { chromium } = await import(process.env.PORTFOLIO_PLAYWRIGHT_MODULE || 'playwright');
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    project = `rt-portfolio-${randomBytes(8).toString('hex')}`;
    if ((await inventory()).some(Boolean)) throw new Error('Refusing existing resources');
    const services = Object.fromEntries(['php', 'nginx', 'postgres', 'mercure', 'scheduler']
      .map(name => [name, { restart: 'no' }]));
    if (reuse) {
      // Reuse only explicitly selected locally available images; never pull them.
      for (const image of args.slice(1)) await docker(['image', 'inspect', image, '--format', '{{.Id}}'], 'local image lookup');
      services.php.image = args[1]; services.scheduler.image = args[1]; services.nginx.image = args[2];
    }
    // Docker cannot publish ports from an internal-only network. Give only Nginx
    // an edge network; PHP/PostgreSQL/Mercure/scheduler retain no external route.
    services.nginx.networks = ['default', 'capture_edge'];
    writeFileSync(overridePath, JSON.stringify({ services,
      networks: { default: { internal: true }, capture_edge: {} } }));
    writeFileSync(leasePath, JSON.stringify({ project, endpointDigest, cleaned: false }));
    owned = true;
    if (build) await compose(['build'], 'portfolio image build', 600000);
    await compose(['up', '-d', '--no-build', '--pull', build ? 'missing' : 'never', '--wait', '--wait-timeout', '150'], 'portfolio startup', 180000);
    const binding = await compose(['port', 'nginx', '80'], 'loopback binding');
    if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error(`Expected an exclusive loopback binding; received ${JSON.stringify(binding)}`);
    const base = `http://${binding}`;
    const request = async (path, { method = 'GET', token, body, status = 200 } = {}) => {
      if (!path.startsWith('/api/') || /ai\/|link-preview/.test(path)) throw new Error('Forbidden portfolio API path');
      const response = await fetch(`${base}${path}`, { method, redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      if (response.status !== status) throw new Error(`${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}: expected ${status}, got ${response.status}`);
      return response.json();
    };
    const data = await seed(request, randomBytes(24).toString('hex'));
    report('PASS synthetic API seed: three users, group/direct chats, quote, poll, reactions and two readers');
    await capture({ browser, base, data, request, artifacts, report });
  }
} catch (error) {
  // Playwright exceptions may include DOM/API values: keep the saved report generic.
  console.error(`FAIL portfolio: ${error.message.split('\n')[0].replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]')}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (owned) try { await cleanup(); } catch { console.error('FAIL cleanup; run --cleanup on the original local Docker engine'); process.exitCode = 1; }
}
