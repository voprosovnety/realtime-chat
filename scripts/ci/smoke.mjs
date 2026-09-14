import { setTimeout as delay } from 'node:timers/promises';

function check(condition, label) {
  if (!condition) throw new Error(label);
}

// HTTP bodies, JWTs and subscription cookies stay in memory, including on failure.
export async function smoke(base, report, signal) {
  check(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), 'Smoke requires a loopback URL');
  const streams = [];
  const request = async (path, { method = 'GET', token, body, status = 200 } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method, redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    check(response.status === status, `${method} API request: expected ${status}, got ${response.status}`);
    const json = await response.json().catch(() => { throw new Error('Expected JSON API response'); });
    return { json, headers: response.headers };
  };
  const subscribe = async (token, chatId) => {
    const { json, headers } = await request(`/api/chats/${chatId}/mercure-subscribe`, { method: 'POST', token });
    check(json.topic === `/chats/${chatId}/messages`, 'Subscription topic mismatch');
    const cookie = headers.getSetCookie().find(value => value.startsWith('mercureAuthorization='))?.split(';')[0];
    check(cookie, 'Missing Mercure subscription cookie');
    const controller = new AbortController();
    const events = [];
    const stream = { controller, events, failed: false };
    streams.push(stream);
    const response = await fetch(`${base}/.well-known/mercure?${new URLSearchParams({ topic: json.topic })}`, {
      headers: { Accept: 'text/event-stream', Cookie: cookie },
      redirect: 'error',
      signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(30000)]),
    });
    check(response.status === 200, 'Mercure subscription failed');
    check(response.headers.get('content-type')?.startsWith('text/event-stream'), 'Expected SSE media type');
    stream.pump = (async () => {
      let buffer = '';
      for await (const text of response.body.pipeThrough(new TextDecoderStream())) {
        buffer += text;
        check(buffer.length < 65536, 'SSE frame exceeded smoke limit');
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).replace(/^ /, '')).join('\n');
          if (data) events.push(JSON.parse(data));
        }
      }
      if (!controller.signal.aborted) stream.failed = true;
    })().catch(() => { if (!controller.signal.aborted) stream.failed = true; });
    return stream;
  };
  const event = async (stream, type, predicate) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      check(!stream.failed, 'SSE stream closed or sent invalid data');
      const found = stream.events.find(item => item.type === type && predicate(item.data));
      if (found) return found.data;
      await delay(50, undefined, { signal });
    }
    throw new Error(`Timed out waiting for ${type} over SSE`);
  };

  try {
    const page = await fetch(base, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    check(page.status === 200 && (await page.text()).includes('id="app"'), 'Built SPA not served');
    await request('/api/me', { status: 401 });
    const users = [];
    for (const username of ['ci_sender', 'ci_reader', 'ci_outsider']) {
      const password = 'Synthetic-smoke-only-2026!';
      const { json: registered } = await request('/api/auth/register', {
        method: 'POST', status: 201, body: { username, email: `${username}@example.invalid`, password },
      });
      const { json: login } = await request('/api/auth/login', {
        method: 'POST', body: { identifier: username, password },
      });
      check(typeof login.access_token === 'string' && login.access_token.length > 0, 'Missing access token');
      const { json: me } = await request('/api/me', { token: login.access_token });
      check(me.id === registered.id && me.username === username, 'Authenticated identity mismatch');
      users.push({ username, token: login.access_token });
    }
    report('PASS register/login/me for three synthetic users; anonymous API denied');
    const [sender, reader, outsider] = users;
    const { json: chat } = await request('/api/chats', {
      method: 'POST', token: sender.token, status: 201,
      body: { is_group: false, participants: [reader.username] },
    });
    const chatPath = `/api/chats/${chat.id}`;
    const readerStream = await subscribe(reader.token, chat.id);
    const senderStream = await subscribe(sender.token, chat.id);
    await request(`${chatPath}/mercure-subscribe`, { method: 'POST', token: outsider.token, status: 403 });
    await request(`${chatPath}/messages`, { token: outsider.token, status: 403 });
    const anonymous = await fetch(`${base}/.well-known/mercure?${new URLSearchParams({ topic: `/chats/${chat.id}/messages` })}`, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    check(anonymous.status === 401, 'Anonymous Mercure subscription was not denied');
    await anonymous.body?.cancel();
    report('PASS private subscriptions through Nginx; nonmember and anonymous access denied');

    const content = 'Synthetic CI realtime message';
    const { json: message } = await request(`${chatPath}/messages`, {
      method: 'POST', token: sender.token, status: 201, body: { content },
    });
    const delivered = await event(readerStream, 'message.created', data => data.id === message.id);
    check(delivered.chat_id === chat.id && delivered.content === content && delivered.sender === sender.username, 'Realtime message mismatch');
    const { json: history } = await request(`${chatPath}/messages`, { token: reader.token });
    check(history.items.some(item => item.id === message.id && item.content === content), 'Message was not persisted');
    report('PASS message persisted in PostgreSQL and received by peer over real Mercure/SSE');

    const verifyList = async unread => {
      const { json: list } = await request('/api/chats', { token: reader.token });
      check(list.items.length === 1, 'Unexpected chat list membership');
      const row = list.items[0];
      check(row.id === chat.id && row.peer_username === sender.username && row.is_group === false, 'LATERAL peer mismatch');
      check(row.last_message?.id === message.id && row.last_message?.content === content, 'LATERAL last message mismatch');
      check(row.unread_count === unread, 'LATERAL unread count mismatch');
    };
    await verifyList(1);
    const { json: before } = await request(`${chatPath}/messages/${message.id}/read-by`, { token: sender.token });
    check(before.length === 0, 'Unexpected reader before mark-read');
    await request(`${chatPath}/read`, {
      method: 'POST', token: outsider.token, status: 403, body: { last_read_message_id: message.id },
    });
    await request(`${chatPath}/read`, {
      method: 'POST', token: reader.token, body: { last_read_message_id: message.id },
    });
    const receipt = await event(senderStream, 'chat.read', data => data.last_read_message_id === message.id);
    check(receipt.chat_id === chat.id && receipt.user === reader.username && Number.isFinite(Date.parse(receipt.at)), 'Read receipt mismatch');
    const { json: after } = await request(`${chatPath}/messages/${message.id}/read-by`, { token: sender.token });
    check(after.length === 1 && after[0].username === reader.username, 'Read receipt was not persisted');
    await verifyList(0);
    const { json: foreignList } = await request('/api/chats', { token: outsider.token });
    check(foreignList.items.length === 0, 'Chat list leaked another user chat');
    await request(`${chatPath}/messages/${message.id}/read-by`, { token: outsider.token, status: 403 });
    report('PASS mark-read, sender SSE receipt, persisted read-by and LATERAL unread 1 -> 0; foreign access denied');
  } finally {
    for (const stream of streams) stream.controller.abort();
    await Promise.all(streams.map(stream => stream.pump));
  }
}
