import { scenario } from './scenario.mjs';

// The outer page is a portfolio caption/frame, not a replacement application UI.
const sheet = (base, chatId, title, subtitle, number) => `<!doctype html><html lang="en"><meta charset="utf-8">
<style>
*{box-sizing:border-box}body{margin:0;background:#0f1117;color:#e6edf3;font-family:Arial,sans-serif}
header{position:absolute;left:64px;top:48px;right:64px}.eyebrow{font-size:18px;letter-spacing:3px;color:#91aff1}
h1{margin:18px 0 12px;font-size:46px;letter-spacing:-1.5px;font-weight:600}p{margin:0;color:#a9b4c5;font-size:23px}
.frame{position:absolute;left:64px;top:224px;width:1472px;height:872px;border:1px solid #344155;border-radius:18px;overflow:hidden;box-shadow:0 24px 70px #0006}
iframe{border:0;width:100%;height:100%;display:block}footer{position:absolute;left:64px;right:64px;top:1132px;display:flex;justify-content:space-between;font-size:19px;color:#a9b4c5}
</style><header><div class="eyebrow">REALTIMECHAT / PERSONAL PORTFOLIO</div><h1>${title}</h1><p>${subtitle}</p></header>
<div class="frame"><iframe title="Actual RealtimeChat interface" src="${base}/chats/${chatId}"></iframe></div>
<footer><span>Fictional workspace · Synthetic demo data · Actual application UI</span><span>${number} / 03</span></footer></html>`;

export async function capture({ browser, base, data, request, artifacts, report }) {
  const [lead, design] = data.users;
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-GB', timezoneId: 'UTC', serviceWorkers: 'block' });
  let aiFixtures = 0, externalBlocked = 0, errors = 0;
  await context.addInitScript(({ origin, token, refresh }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('theme', 'dark');
  }, { origin: base, token: lead.token, refresh: lead.refresh });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      externalBlocked++;
      // App's optional remote font is replaced by its existing system-font fallback.
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort();
    }
    if (url.pathname === '/api/ai/chat') {
      const payload = route.request().postDataJSON();
      if (payload?.messages?.length !== 1 || payload.messages[0].content !== scenario.question)
        return route.abort();
      aiFixtures++;
      return route.fulfill({ json: { reply: scenario.answer } });
    }
    // The current composer also emits typing for the virtual "ai" chat. That
    // backend path expects a UUID and returns 500. Keep the presentation local;
    // this no-op is not a fix or a claim about live AI typing support.
    if (url.pathname === '/api/chats/ai/typing') return route.fulfill({ json: { ok: true } });
    if (url.pathname.startsWith('/api/ai/') || url.pathname === '/api/link-preview') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', () => { errors++; report('Browser diagnostic: uncaught page error'); });
  page.on('console', message => {
    if (message.type() === 'error') {
      errors++;
      // Only generic resource status, never arbitrary application console payloads.
      report(`Browser diagnostic: ${message.text().match(/(?:status of \d+|net::[A-Z_]+)/)?.[0] || 'application console error'}`);
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) report(`HTTP diagnostic: ${response.status()} ${new URL(response.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id')}`);
  });
  page.setDefaultTimeout(15000);
  let currentSheet;
  await context.route(`${base}/__portfolio__`, route => route.fulfill({ contentType: 'text/html', body: currentSheet }));
  const openSheet = async (id, title, subtitle, number) => {
    currentSheet = sheet(base, id, title, subtitle, number);
    await page.goto(`${base}/__portfolio__`, { waitUntil: 'domcontentloaded' });
    const frame = page.frameLocator('iframe');
    await frame.locator('.chat-header-name').waitFor();
    // Hide only optional account email/version metadata in the capture context.
    const app = page.frames().find(frame => frame.url().includes('/chats/'));
    await app.addStyleTag({ content: '.sidebar-footer-status,.sidebar-version{visibility:hidden}' });
    return frame;
  };
  const aiConversation = async frame => {
    await frame.locator('.chat-item-name').filter({ hasText: design.username }).waitFor({ state: 'attached' });
    await frame.locator('textarea').fill(scenario.question);
    try { await frame.locator('.composer-send').click(); }
    catch {
      await page.screenshot({ path: `${artifacts}/ai-interaction-failure.png` });
      const state = await frame.locator('.composer-send').evaluate(el => ({
        disabled: el.disabled, rect: el.getBoundingClientRect().toJSON(),
        viewport: [innerWidth, innerHeight], inputLength: document.querySelector('textarea').value.length,
      }));
      throw new Error(`AI send interaction failed: ${JSON.stringify(state)}`);
    }
    await frame.getByText(scenario.answer, { exact: true }).waitFor();
  };
  const screenshot = async name => {
    await page.mouse.move(1590, 1190);
    await page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
  };
  let frame = await openSheet('ai', 'A workspace for conversations and decisions',
    'Private & group messaging · Realtime updates · Built-in AI assistant', '01');
  await aiConversation(frame);
  await screenshot('01-cover');
  // The real sidebar toggle produces the close-up, preserving the entire chat area.
  await frame.locator('.sidebar-toggle').click();
  await page.locator('iframe').evaluate(el => {
    el.style.width = '1130.76923077px'; el.style.height = '669.23076923px';
    el.style.transform = 'scale(1.3)'; el.style.transformOrigin = 'top left';
  });
  await page.locator('h1').evaluate(el => { el.textContent = 'From a business question to a clear next step'; });
  await page.locator('header p').evaluate(el => { el.textContent = 'AI Assistant · Local, hand-written example · No live model call'; });
  await page.locator('footer span').last().evaluate(el => { el.textContent = '02 / 03'; });
  await screenshot('02-ai-assistant');
  report('PASS AI presentation: exact local fixture rendered; no backend AI request');

  for (const user of data.users) await request('/api/me/ping', { method: 'POST', token: user.token });
  frame = await openSheet(data.chat.id, 'Keep the whole team in the conversation',
    'Live presence & typing · Polls · Reactions · Quoted replies · Read receipts', '03');
  await frame.locator('.poll-card').waitFor();
  await frame.locator('.chat-header-online').filter({ hasText: '3 online' }).waitFor();
  await frame.locator('.message-ticks.read').first().waitFor();
  await frame.getByText('👍 2', { exact: true }).waitFor();
  // Verify the native receipt details, then close it for the uncluttered group frame.
  await frame.locator('.message-ticks.read').last().click();
  await frame.locator('.read-by-item').nth(1).waitFor();
  await frame.getByRole('dialog', { name: 'Read receipts' }).getByRole('button', { name: 'Close', exact: true }).click();
  const allMessagesVisible = await frame.locator('.messages-area').evaluate(el => {
    const area = el.getBoundingClientRect();
    return [...el.querySelectorAll('.message-row')].every(row => {
      const r = row.getBoundingClientRect(); return r.top >= area.top && r.bottom <= area.bottom;
    });
  });
  if (!allMessagesVisible) throw new Error('Group frame clips a message or reaction');
  // A fresh event after subscription proves browser delivery; no fake online/typing state.
  await request(`${data.path}/typing`, { method: 'POST', token: design.token });
  await frame.locator('.typing-indicator-content').waitFor();
  await screenshot('03-group-chat');
  report('PASS desktop group: persisted poll/quote/reactions/receipts and real Mercure typing event');

  // Scope-limited mobile smoke of these two presentation screens, not an E2E test layer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/chats/${data.chat.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.poll-card').waitFor();
  await page.locator('textarea').fill('Synthetic mobile draft');
  const inViewport = await page.locator('textarea').evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      && document.documentElement.scrollWidth <= innerWidth;
  });
  if (!inViewport) throw new Error('Mobile composer overflows viewport');
  await page.locator('textarea').fill('');
  await page.screenshot({ path: `${artifacts}/mobile-group.png`, animations: 'disabled' });
  await page.goto(`${base}/chats/ai`, { waitUntil: 'domcontentloaded' });
  await aiConversation(page);
  if (!await page.locator('.composer-send').isVisible()) throw new Error('Mobile AI composer missing');
  await page.screenshot({ path: `${artifacts}/mobile-ai.png`, animations: 'disabled' });
  if (aiFixtures !== 2 || errors !== 0) throw new Error(`Capture errors: fixture count ${aiFixtures}, browser errors ${errors}`);
  report(`PASS mobile 390×844: group draft/composer and AI fixture; browser errors ${errors}; remote resource attempts blocked ${externalBlocked}`);
  await context.close();
}
