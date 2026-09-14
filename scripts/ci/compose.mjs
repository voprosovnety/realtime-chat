import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { smoke } from './smoke.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scenario = process.argv[2];
const cleanupOnly = process.argv[3] === '--cleanup';
if (!['backend', 'default', 'custom', 'cleanup-failure'].includes(scenario)
    || process.argv.length > (cleanupOnly ? 4 : 3)) {
  console.error('Usage: node scripts/ci/compose.mjs backend|default|custom|cleanup-failure [--cleanup]');
  process.exit(1);
}
const artifacts = `${root}.playwright-mcp/ci-separation/${scenario}`;
mkdirSync(artifacts, { recursive: true });
const leasePath = `${artifacts}/project.json`;
const report = message => {
  console.log(message);
  appendFileSync(`${artifacts}/summary.log`, `${message}\n`);
};
const abort = new AbortController();
const activeChildren = new Set();
let cleaning = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (cleaning) return;
    abort.abort();
    for (const child of activeChildren) child.kill('SIGTERM');
  });
}

// Inherit only host CLI plumbing. Never load root .env or pass host app/AI secrets.
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_HOST']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]),
);
Object.assign(env, {
  APP_ENV: 'prod', APP_DEBUG: '0', ANTHROPIC_API_KEY: '',
  NGINX_PORT: '127.0.0.1:0',
  MERCURE_PUBLIC_URL: 'http://127.0.0.1/.well-known/mercure',
  CORS_ORIGINS: 'http://127.0.0.1',
  BUILDX_BUILDER: 'default',
  MERCURE_JWT_SECRET: randomBytes(32).toString('hex'),
});
if (scenario === 'custom') {
  Object.assign(env, {
    POSTGRES_DB: 'ci_custom_chat', POSTGRES_USER: 'ci_custom_user',
    POSTGRES_PASSWORD: `${randomBytes(20).toString('hex')}@:/?#%$&+`,
  });
}
const redactedValues = [env.MERCURE_JWT_SECRET, env.POSTGRES_PASSWORD].filter(Boolean);
const redact = output => {
  for (const value of redactedValues) {
    output = output.replaceAll(value, '[REDACTED]').replaceAll(encodeURIComponent(value), '[REDACTED]');
  }
  return output.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]')
    .replace(/((?:authorization|cookie|set-cookie)\s*[:=])[^\r\n]*/gi, '$1 [REDACTED]');
};

async function command(args, label, { log = true, timeout = 30000 } = {}) {
  if (!cleaning && abort.signal.aborted) throw new Error('Interrupted');
  const result = await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    activeChildren.add(child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.setEncoding('utf8').on('data', text => { stdout += text; });
    child.stderr.setEncoding('utf8').on('data', text => { stderr += text; });
    child.on('error', () => { clearTimeout(timer); reject(new Error(`Cannot start Docker for ${label}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      activeChildren.delete(child);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
  if (log) writeFileSync(`${artifacts}/${label}.log`, redact(result.stdout + result.stderr));
  if (result.code !== 0) throw new Error(`${label} failed${result.timedOut ? ' (timeout)' : ''}; see sanitized log`);
  return result.stdout.trim();
}

let project;
let endpointDigest;
let owned = false;
const files = scenario === 'backend' ? ['-f', 'docker-compose.test.yml'] : ['-f', 'docker-compose.yml'];
const compose = (args, label, options) => command(
  ['compose', '--env-file', '/dev/null', '--project-name', project, ...files, ...args], label, options,
);
const resources = async () => {
  const filter = `label=com.docker.compose.project=${project}`;
  return Promise.all([
    command(['ps', '-aq', '--filter', filter], 'containers', { log: false }),
    command(['network', 'ls', '-q', '--filter', filter], 'networks', { log: false }),
    command(['volume', 'ls', '-q', '--filter', filter], 'volumes', { log: false }),
  ]);
};
const clean = async () => {
  cleaning = true;
  await compose(['down', '--volumes', '--remove-orphans', '--timeout', '10'], 'cleanup', { timeout: 60000 });
  if ((await resources()).some(Boolean)) throw new Error('Cleanup left Compose resources behind');
  writeFileSync(leasePath, JSON.stringify({ project, endpointDigest, cleaned: true }));
  report(`PASS cleanup: no containers/networks/volumes for ${project}`);
};

try {
  // Remote Docker contexts are outside the scope of this local/dev/test harness.
  const endpoint = env.DOCKER_CONTEXT || !env.DOCKER_HOST
    ? await command(
      ['context', 'inspect', ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []), '--format', '{{.Endpoints.docker.Host}}'],
      'docker-context', { log: false },
    ) : env.DOCKER_HOST;
  if (!endpoint.startsWith('unix://')) throw new Error('Only a local Unix-socket Docker engine is allowed');
  // Pin the verified endpoint; DOCKER_CONTEXT otherwise takes priority over DOCKER_HOST.
  delete env.DOCKER_CONTEXT;
  env.DOCKER_HOST = endpoint;
  endpointDigest = createHash('sha256').update(endpoint).digest('hex');
  const version = await command(['compose', 'version', '--short'], 'compose-version');
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  if (!(major > 2 || (major === 2 && minor >= 20))) throw new Error('Docker Compose >= 2.20 is required');

  if (cleanupOnly) {
    if (!existsSync(leasePath)) {
      report('No project was allocated; nothing to clean');
    } else {
      const lease = JSON.parse(readFileSync(leasePath, 'utf8'));
      if (!new RegExp(`^rt-ci-${scenario}-[0-9a-f]{16}$`).test(lease.project)) throw new Error('Invalid project ownership record');
      if (lease.endpointDigest !== endpointDigest) throw new Error('Cleanup requires the original local Docker endpoint');
      project = lease.project;
      await clean();
    }
  } else {
    if (existsSync(leasePath) && !JSON.parse(readFileSync(leasePath, 'utf8')).cleaned) {
      throw new Error('Previous project needs --cleanup before another run');
    }
    project = `rt-ci-${scenario}-${randomBytes(8).toString('hex')}`;
    if ((await resources()).some(Boolean)) throw new Error('Refusing to reuse existing Compose resources');
    writeFileSync(leasePath, JSON.stringify({ project, endpointDigest, cleaned: false }), { flag: 'w' });
    owned = true;
    report(`START ${scenario}: isolated project ${project}; Node ${process.version}; Compose ${version}`);
    await compose(['config', '--quiet'], 'compose-config');
    if (scenario === 'backend') {
      await compose(['build', 'test'], 'backend-build', { timeout: 600000 });
      // Run every independent check, even if another check has failed.
      let failed = false;
      for (const [label, args] of [
        ['backend-suite', ['php', 'bin/phpunit']],
        ['forwarding', ['php', 'bin/phpunit', '--filter', 'Forward']],
        ['composer-production-audit', ['composer', 'audit', '--locked', '--no-dev', '--format=json']],
        ['composer-full-audit', ['composer', 'audit', '--locked', '--format=json']],
      ]) {
        try {
          const output = await compose(['run', '--rm', '-T', 'test', ...args], label, { timeout: 120000 });
          const counts = output.match(/OK \(\d+ tests, \d+ assertions\)/)?.[0];
          report(`PASS ${label}${counts ? `: ${counts}` : ''}`);
        } catch (error) {
          failed = true;
          report(`FAIL ${error.message}`);
        }
      }
      if (failed) throw new Error('One or more backend checks failed');
    } else {
      await compose(['build'], 'production-build', { timeout: 600000 });
      await compose(['up', '-d', '--wait', '--wait-timeout', '150'], 'startup', { timeout: 180000 });
      report('PASS clean production Compose startup');
      if (scenario === 'cleanup-failure') {
        const error = new Error('Intentional failure after startup to exercise cleanup');
        error.exitCode = 42;
        throw error;
      }
      const binding = await compose(['port', 'nginx', '80'], 'http-port');
      if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Expected a single loopback HTTP port');
      const identity = await compose([
        'exec', '-T', 'postgres', 'sh', '-eu', '-c',
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT current_database(), current_user"',
      ], 'database-identity');
      const expected = scenario === 'custom' ? 'ci_custom_chat|ci_custom_user' : 'messenger|messenger';
      if (identity !== expected) throw new Error('PostgreSQL database/role mismatch');
      report(`PASS ${scenario} PostgreSQL database/role identity`);
      await smoke(`http://${binding}`, report, abort.signal);
    }
  }
} catch (error) {
  report(`FAIL ${redact(error.message)}`);
  process.exitCode = error.exitCode || 1;
} finally {
  if (owned) {
    try { await clean(); }
    catch (error) {
      report(`FAIL ${redact(error.message)}`);
      process.exitCode = 1;
    }
  }
}
