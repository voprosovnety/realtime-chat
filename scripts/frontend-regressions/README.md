# Frontend regressions

Requires Node.js 24, Docker Compose 2.20+ and a local Unix-socket Docker engine.
The frontend uses its current source through Vite; these tests do not build or verify
production frontend assets. No root `.env`, existing stack, external AI or saved login
state is used. All account passwords, database passwords and Mercure keys are random.

```bash
cd frontend
npm ci
npx playwright install --with-deps chromium
npm run test:modeled
npm run test:browser -- --build
```

`--build` builds only the PHP production target and uses stock Nginx with the current
repository proxy config. It does not run PHPUnit, npm build or dependency audits.
On a machine with Chrome already installed, prefix the test commands with
`REGRESSION_BROWSER_CHANNEL=chrome` to avoid downloading Chromium.

For an unchanged backend, explicitly selected local images can be reused without pulls:

```bash
npm run test:browser -- --images PHP_IMAGE NGINX_IMAGE
npm run test:browser -- --images PHP_IMAGE NGINX_IMAGE --scenario=reconnect,mobile
```

Use images built from the current backend source/dependencies. Vite always serves the
current frontend. The current Nginx config is mounted read-only even in image reuse mode.
Available scenarios: `ai`, `realtime`, `forwarding`, `reconnect`, `mobile`; omitted means all.
A fresh API seed/login is required even for selected scenarios.

## Coverage and boundaries

- **Real browser/API/PostgreSQL/Mercure:** browser login, membership-filtered chat list,
  normal typing, desktop send/mobile receive, persisted message and read receipt.
  Chromium's protocol observer confirms native SSE frames; events are never fabricated.
  Restarting only the owned Mercure container exercises a real connection failure,
  browser reconnect and subsequent live delivery without a page reload.
- **Real authorization:** nonmember message/subscription denial, inaccessible forwarding
  source rejection with no destination write, and allowed forwarding. Source denial is
  intentionally the existing generic HTTP 400, indistinguishable from a missing source.
- **Modeled browser failures:** actual `api.js` with controlled HTTP responses and a
  barrier holding two 401 callers during refresh. Covers one rotating refresh/two retries,
  transient network failure preserving tokens, and rejected refresh clearing tokens.
  This does not establish server rotation behavior or cross-tab coordination.
  The forwarding UI separately receives a modeled 400 and must show its error toast
  without navigating. Real permission checks above are independent of that mock.
- **AI typing regression:** real composer input, debounce wait and a network count of zero
  for `/api/chats/ai/typing`. No masking/no-op from portfolio capture is imported. Actual
  AI requests are blocked and counted as failures; no answer is sent or modeled.
- **Mobile smoke:** Chromium 390 × 844 touch viewport, composer bounds, no horizontal
  overflow, preservation of scrolled-up position on receive, scroll-to-bottom and reply.
  This does not cover a physical device, Safari, Android or a software keyboard.

These are focused regressions, not comprehensive UI coverage. Reconnect verifies delivery
**after** reconnection, not replay of messages published while disconnected. No production
bundle, load, real JWT expiry, upload or live AI test is claimed.

## Isolation, diagnostics and cleanup

Every real run allocates a random `rt-regressions-*` project, private volumes/networks,
random loopback Nginx/Vite ports and an empty AI key. Backend services have no external
network route; only Nginx joins an edge network for its loopback port. Browser requests
to other origins are blocked. Setup/build dependency downloads are separate from tests.
Vite env-file loading is disabled, and Compose uses `--env-file /dev/null` with a narrow
synthetic environment. Browser tokens/cookies remain in disposable memory only.

Normal completion, handled failures, SIGINT and SIGTERM close browsers/Vite and run
Compose down with volumes, then verify the owned resource inventory is empty. After a
machine/engine failure or SIGKILL, run on the original local engine:

```bash
node scripts/frontend-regressions/run.mjs --cleanup
```

Only the ownership record and nonsecret Compose override are retained under
`.playwright-mcp/frontend-regressions/`; no screenshots, traces, HAR, API bodies, raw server
logs, persistent profiles or storageState are created. Failures print scenario names and
safe assertion metadata, withholding raw Playwright diagnostics which can include input
credentials. Generated build images and browser dependency caches are not deleted.
Concurrent real runs in the same checkout are unsupported; the ownership record prevents
starting over an unfinished run. CI invokes both sets in its own standalone job with
read-only repository permission, no deployment environments/secrets or artifact upload.
The GitHub run must be verified separately after an explicitly authorized push.
