import { randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';

export async function runBrowser({ browser, base, request, report, restartHub, scenario }) {
  const contexts = [];
  const errors = [];
  let forbiddenAi = 0;
  const password = randomBytes(24).toString('hex');
  const users = ['regression_sender', 'regression_reader', 'regression_outsider'];
  const tokens = [];
  const check = async (key, name, fn) => {
    if (scenario && !scenario.split(',').includes(key)) return;
    report(`RUN ${name}`);
    try { await fn(); } catch (error) {
      const result = error.matcherResult;
      report(`FAIL ${name}: ${result?.name || error.name}`);
      if (typeof result?.actual === 'number' && typeof result?.expected === 'number')
        report(`Expected ${result.expected}; received ${result.actual}`);
      throw error;
    }
    report(`PASS ${name}`);
  };
  async function client(username, mobile = false) {
    report(`RUN real browser login: ${mobile ? 'mobile' : 'desktop'}`);
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}), serviceWorkers: 'block' });
    contexts.push(context);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/api/ai/')) { forbiddenAi++; return route.abort(); }
      // Deliberately no handler/no-op for /api/chats/ai/typing.
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', () => errors.push('pageerror'));
    const events = [], connections = [];
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', e => { if (e.type === 'EventSource' && e.response.status === 200) connections.push(e.requestId); });
    cdp.on('Network.eventSourceMessageReceived', e => {
      try { const payload = JSON.parse(e.data); events.push({ type: payload.type, id: payload.data?.id, chat: payload.data?.chat_id }); } catch { errors.push('invalid-sse'); }
    });
    await page.goto(`${base}/login`);
    await page.locator('[autocomplete=username]').fill(username);
    await page.locator('[autocomplete=current-password]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`${base}/chats/ai`);
    // Mobile intentionally hides the sidebar; wait for its loaded data in the DOM.
    await expect(page.locator('.chat-item-name', { hasText: username === users[0] ? users[1] : users[0] })).toHaveCount(1);
    return { page, context, events, connections };
  }
  const open = async (client, id) => {
    const before = client.connections.length;
    await client.page.goto(`${base}/chats/${id}`);
    await expect(client.page.getByPlaceholder('Type a message…')).toBeVisible();
    await expect(client.page.locator('.chat-load-error')).toHaveCount(0);
    await expect.poll(() => client.connections.length).toBeGreaterThan(before);
  };
  try {
    report('RUN real API seed (fresh synthetic identities)');
    for (const username of users) {
      await request('/api/auth/register', { method: 'POST', status: 201, body: { username, email: `${username}@example.invalid`, password } });
      const login = await request('/api/auth/login', { method: 'POST', body: { identifier: username, password } });
      tokens.push(login.access_token);
    }
    const chat = await request('/api/chats', { method: 'POST', status: 201, token: tokens[0], body: { is_group: false, participants: [users[1]] } });
    const target = await request('/api/chats', { method: 'POST', status: 201, token: tokens[0], body: { is_group: true, title: 'Regression target', participants: [users[1]] } });
    const secret = await request('/api/chats', { method: 'POST', status: 201, token: tokens[2], body: { is_group: true, title: 'Regression private', participants: [users[1]] } });
    const hidden = await request(`/api/chats/${secret.id}/messages`, { method: 'POST', status: 201, token: tokens[2], body: { content: 'Synthetic private source' } });
    const alice = await client(users[0]);
    await check('realtime', 'real login and PostgreSQL chat list', async () => {
      await expect(alice.page.locator('.chat-item-name', { hasText: 'Regression target' })).toBeVisible();
      await expect(alice.page.locator('.chat-item-name', { hasText: 'Regression private' })).toHaveCount(0);
      await expect.poll(() => alice.connections.length).toBeGreaterThan(0);
    });
    await check('ai', 'AI composer emits zero virtual-chat typing requests', async () => {
      let invalid = 0;
      const statuses = [];
      alice.page.on('response', res => { if (new URL(res.url()).pathname === '/api/chats/ai/typing') statuses.push(res.status()); });
      alice.page.on('request', req => { if (new URL(req.url()).pathname === '/api/chats/ai/typing') invalid++; });
      await alice.page.getByPlaceholder('Type a message…').fill('Synthetic AI draft');
      // Negative request assertion must span the actual 400ms debounce.
      await alice.page.waitForTimeout(750);
      report(`AI typing requests: ${invalid}; HTTP statuses: ${statuses.join(',') || 'none'}`);
      expect(invalid).toBe(0);
      await alice.page.getByPlaceholder('Type a message…').fill('');
    });
    if (scenario === 'ai') {
      expect(errors.length).toBe(0);
      expect(forbiddenAi).toBe(0);
      return;
    }
    const bob = await client(users[1], true);
    await open(alice, chat.id);
    await open(bob, chat.id);
    let sent = await request(`/api/chats/${chat.id}/messages`, { method: 'POST', status: 201, token: tokens[0], body: { content: 'Synthetic desktop message' } });
    await check('realtime', 'real typing, desktop send, mobile receive and read receipt via Mercure', async () => {
      const typing = alice.page.waitForResponse(r => r.url().endsWith(`/api/chats/${chat.id}/typing`) && r.status() === 200);
      await alice.page.getByPlaceholder('Type a message…').fill('Synthetic desktop message');
      await typing;
      await expect(bob.page.locator('.typing-indicator')).toContainText(users[0]);
      const posted = alice.page.waitForResponse(r => r.url().endsWith(`/api/chats/${chat.id}/messages`) && r.request().method() === 'POST');
      await alice.page.getByRole('button', { name: 'Send message', exact: true }).click();
      const response = await posted;
      expect(response.status()).toBe(201);
      sent = await response.json();
      await expect(bob.page.locator(`#msg-${sent.id}`)).toContainText('Synthetic desktop message');
      await expect.poll(() => bob.events.some(e => e.type === 'message.created' && e.id === sent.id)).toBe(true);
      await expect(alice.page.locator(`#msg-${sent.id} .message-ticks`)).toHaveClass(/read/);
      await expect.poll(() => alice.events.some(e => e.type === 'chat.read' && e.chat === chat.id)).toBe(true);
      const history = await request(`/api/chats/${chat.id}/messages`, { token: tokens[1] });
      expect(history.items.some(m => m.id === sent.id && m.content === 'Synthetic desktop message')).toBe(true);
    });
    await check('forwarding', 'real private API/Mercure boundaries and forwarding authorization', async () => {
      await request(`/api/chats/${chat.id}/mercure-subscribe`, { method: 'POST', token: tokens[2], status: 403 });
      await request(`/api/chats/${secret.id}/messages`, { token: tokens[0], status: 403 });
      const before = await request(`/api/chats/${target.id}/messages`, { token: tokens[0] });
      // Source denial is intentionally the same 400 for inaccessible and missing IDs.
      const denied = await alice.page.evaluate(async ({ target, source }) => {
        const { api } = await import('/src/api.js');
        try { await api.sendForwardedMessage(target, source); return 'unexpected-success'; }
        catch (e) { return e.message; }
      }, { target: target.id, source: hidden.id });
      expect(denied).toBe('invalid forwarded_from_id');
      const after = await request(`/api/chats/${target.id}/messages`, { token: tokens[0] });
      expect(after.items.length).toBe(before.items.length);
      const forwarded = await request(`/api/chats/${target.id}/messages`, { method: 'POST', status: 201, token: tokens[0], body: { forwarded_from_id: sent.id } });
      expect(forwarded.content).toBe('Synthetic desktop message');
    });
    await check('forwarding', 'modeled forwarding denial shown by real UI', async () => {
      let attempts = 0;
      const pattern = `**/api/chats/${target.id}/messages`;
      await alice.page.route(pattern, route => {
        if (route.request().method() !== 'POST') return route.continue();
        attempts++;
        return route.fulfill({ status: 400, json: { error: 'invalid forwarded_from_id' } });
      });
      try {
        await alice.page.locator(`#msg-${sent.id} .message-bubble-outer`).click({ button: 'right' });
        await alice.page.getByRole('button', { name: 'Forward', exact: true }).click();
        await alice.page.locator('.forward-chat-item', { hasText: 'Regression target' }).click();
        await expect(alice.page.locator('.toast--error')).toContainText('invalid forwarded_from_id');
        expect(attempts).toBe(1);
        await expect(alice.page).toHaveURL(`${base}/chats/${chat.id}`);
      } finally { await alice.page.unroute(pattern); }
    });
    await check('reconnect', 'real SSE reconnect after isolated Mercure restart', async () => {
      const count = bob.connections.length;
      // Observe the actual status transition before waiting for restart to finish.
      const reconnecting = expect(bob.page.locator('.sse-status-bar')).toContainText('Reconnecting', { timeout: 15000 });
      await Promise.all([restartHub(), reconnecting]);
      await expect.poll(() => bob.connections.length, { timeout: 20000 }).toBeGreaterThan(count);
      const message = await request(`/api/chats/${chat.id}/messages`, { method: 'POST', status: 201, token: tokens[0], body: { content: 'Synthetic after reconnect' } });
      await expect.poll(() => bob.events.some(e => e.type === 'message.created' && e.id === message.id)).toBe(true);
      await expect(bob.page.locator(`#msg-${message.id}`)).toHaveCount(1);
    });
    await check('mobile', 'mobile composer, scroll position and scroll-to-bottom', async () => {
      for (let i = 0; i < 24; i++) await request(`/api/chats/${chat.id}/messages`, { method: 'POST', status: 201, token: tokens[0], body: { content: `Synthetic scroll row ${i}: enough text to wrap on a narrow screen.` } });
      await expect(bob.page.locator('.message-row').last()).toContainText('Synthetic scroll row 23');
      const area = bob.page.locator('.messages-area');
      await expect.poll(() => area.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(30);
      await area.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
      await expect(bob.page.getByRole('button', { name: 'Scroll to bottom' })).not.toHaveClass(/hidden/);
      const message = await request(`/api/chats/${chat.id}/messages`, { method: 'POST', status: 201, token: tokens[0], body: { content: 'Synthetic while scrolled up' } });
      await expect(bob.page.locator(`#msg-${message.id}`)).toHaveCount(1);
      expect(await area.evaluate(el => el.scrollTop)).toBeLessThan(100);
      await bob.page.getByRole('button', { name: 'Scroll to bottom' }).click();
      await expect.poll(() => area.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(30);
      const composer = bob.page.getByPlaceholder('Type a message…');
      await composer.fill('Synthetic mobile reply');
      const bounds = await composer.boundingBox();
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
      expect(await bob.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await bob.page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(composer).toHaveValue('');
      await expect(alice.page.locator('.message-row').last()).toContainText('Synthetic mobile reply');
      await expect.poll(() => area.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(30);
    });
    expect(errors.length).toBe(0);
    expect(forbiddenAi).toBe(0);
    report('PASS browser errors: zero; paid AI attempts: zero');
  } finally { await Promise.all(contexts.map(context => context.close())); }
}
