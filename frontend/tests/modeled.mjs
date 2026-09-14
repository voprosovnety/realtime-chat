import { expect } from '@playwright/test';

// Real browser + actual api.js; ONLY HTTP responses/timing are modeled here.
export async function runModeled({ browser, base, report }) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/regression-empty') return route.fulfill({ contentType: 'text/html', body: '<title>Regression harness</title>' });
      return route.continue();
    });
    await page.goto(`${base}/regression-empty`);
    for (const mode of ['rotation', 'network-failure', 'rejected-refresh']) {
      report(`RUN modeled refresh: ${mode}`);
      let oldRequests = 0, refreshes = 0, retries = 0;
      let releaseOld, releaseRefresh;
      const bothOld = new Promise(resolve => { releaseOld = resolve; });
      const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
      await page.route('**/api/**', async route => {
        const req = route.request();
        if (new URL(req.url()).pathname === '/api/auth/refresh') {
          refreshes++;
          await refreshGate;
          if (mode === 'network-failure') return route.abort('failed');
          return route.fulfill({ status: mode === 'rotation' ? 200 : 401,
            json: mode === 'rotation' ? { access_token: 'synthetic-new', refresh_token: 'synthetic-rotated' } : { error: 'expired' } });
        }
        if (req.headers().authorization === 'Bearer synthetic-new') {
          retries++;
          return route.fulfill({ json: { username: 'regression_fixture' } });
        }
        oldRequests++;
        if (oldRequests === 2) releaseOld();
        await bothOld;
        return route.fulfill({ status: 401, json: { error: 'expired' } });
      });
      await page.evaluate(() => {
        localStorage.setItem('access_token', 'synthetic-old');
        localStorage.setItem('refresh_token', 'synthetic-refresh');
        window.refreshResponses = 0;
        const original = window.fetch;
        window.fetch = async (...args) => {
          const result = await original(...args);
          if (args[0] === '/api/me' && result.status === 401) window.refreshResponses++;
          return result;
        };
      });
      const resultPromise = page.evaluate(async mode => {
        const { api } = await import(`/src/api.js?scenario=${mode}`);
        const results = await Promise.allSettled([api.me(), api.me()]);
        return { statuses: results.map(r => r.status),
          access: localStorage.getItem('access_token'), refresh: localStorage.getItem('refresh_token'), path: location.pathname };
      }, mode);
      try {
        // Both callers have observed their 401 while the rotating refresh stays in flight.
        await expect.poll(() => page.evaluate(() => window.refreshResponses)).toBe(2);
        await expect.poll(() => refreshes).toBe(1);
      } finally { releaseRefresh(); }
      const result = await resultPromise;
      expect(oldRequests).toBe(2);
      expect(refreshes).toBe(1);
      expect(retries).toBe(mode === 'rotation' ? 2 : 0);
      expect(result.statuses).toEqual(mode === 'rotation' ? ['fulfilled', 'fulfilled'] : ['rejected', 'rejected']);
      expect(result.access).toBe(mode === 'rotation' ? 'synthetic-new' : mode === 'network-failure' ? 'synthetic-old' : null);
      expect(result.refresh).toBe(mode === 'rotation' ? 'synthetic-rotated' : mode === 'network-failure' ? 'synthetic-refresh' : null);
      expect(result.path).toBe('/regression-empty');
      await page.unroute('**/api/**');
      // Remove fetch instrumentation and module state between cases.
      await page.reload();
      report(`PASS modeled refresh: ${mode}`);
    }
  } finally { await context.close(); }
}
