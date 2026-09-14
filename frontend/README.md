# RealtimeChat frontend

Vue 3 SPA built with Vite. Install the locked dependency graph and start the hot-reload
server with:

```bash
npm ci
npm run dev
```

See the repository [README](../README.md) for the Docker backend, production build,
testing, CI and project architecture.

Browser tests: `npm run test:modeled` for controlled refresh failures and
`npm run test:browser -- --build` for an isolated real backend with desktop/mobile smoke.
Install Chromium with `npx playwright install --with-deps chromium` first, or use the
installed Chrome channel via `REGRESSION_BROWSER_CHANNEL=chrome`.
See [test coverage and cleanup](../scripts/frontend-regressions/README.md).
