// Hand-written fictional content. Never import account exports or real conversations.
export const scenario = {
  users: ['Demo Lead', 'Demo Design', 'Demo Ops'],
  title: 'Launch room',
  decision: 'Keep onboarding simple: one welcome message and a clear next step.',
  reply: 'Agreed. I’ll prepare the welcome checklist for the team.',
  poll: 'What should we prioritise for launch?',
  options: ['Customer onboarding', 'Help centre', 'Weekly reporting'],
  ready: 'The onboarding checklist is ready for review.',
  question: 'For a fictional design studio, outline a one-day workflow to qualify enquiries, assign an owner and follow up.',
  answer: 'SYNTHETIC EXAMPLE · Hand-written fixture, not a live Claude response.\n\n1. Qualify the enquiry\nCollect the goal, scope, budget range and timeline.\n\n2. Assign an owner\nChoose one team member and agree the next step.\n\n3. Follow up\nAcknowledge within one business day and set a reminder.\n\nStages: New → Qualifying → Proposal → Follow-up.',
};

// The runner supplies a request function bound to its newly allocated stack only.
// Reproduction means a fresh database per run; no destructive reset of an existing DB.
export async function seed(request, randomPassword) {
  const users = [];
  for (const [index, username] of scenario.users.entries()) {
    await request('/api/auth/register', { method: 'POST', status: 201,
      body: { username, email: `portfolio-${index + 1}@example.invalid`, password: randomPassword } });
    const login = await request('/api/auth/login', { method: 'POST',
      body: { identifier: username, password: randomPassword } });
    const me = await request('/api/me', { token: login.access_token });
    if (me.username !== username) throw new Error('Synthetic identity mismatch');
    users.push({ username, token: login.access_token, refresh: login.refresh_token });
  }
  const [lead, design, ops] = users;
  const chat = await request('/api/chats', { method: 'POST', status: 201, token: lead.token,
    body: { is_group: true, title: scenario.title, participants: [design.username, ops.username] } });
  const path = `/api/chats/${chat.id}`;
  const message = (user, content, extra = {}) => request(`${path}/messages`, {
    method: 'POST', status: 201, token: user.token, body: { content, ...extra },
  });
  const decision = await message(design, scenario.decision);
  await message(ops, scenario.reply, { reply_to_id: decision.id });
  const poll = await request(`${path}/messages/poll`, { method: 'POST', status: 201,
    token: lead.token, body: { question: scenario.poll, options: scenario.options } });
  for (const [index, user] of users.entries()) {
    await request(`${path}/messages/${poll.id}/poll/vote`, { method: 'POST',
      token: user.token, body: { options: [index === 2 ? 1 : 0] } });
  }
  const ready = await message(lead, scenario.ready);
  for (const user of [design, ops]) {
    await request(`${path}/messages/${ready.id}/reactions`, { method: 'POST',
      token: user.token, body: { emoji: '👍' } });
    await request(`${path}/delivered`, { method: 'POST', token: user.token,
      body: { last_delivered_message_id: ready.id } });
    await request(`${path}/read`, { method: 'POST', token: user.token,
      body: { last_read_message_id: ready.id } });
  }
  await request(`${path}/read`, { method: 'POST', token: lead.token,
    body: { last_read_message_id: ready.id } });
  const direct = await request('/api/chats', { method: 'POST', status: 201, token: lead.token,
    body: { is_group: false, participants: [design.username] } });
  await request(`/api/chats/${direct.id}/messages`, { method: 'POST', status: 201,
    token: design.token, body: { content: 'The welcome flow is ready to discuss.' } });
  for (const user of users) await request('/api/me/ping', { method: 'POST', token: user.token });
  const history = await request(`${path}/messages`, { token: lead.token });
  const receipts = await request(`${path}/messages/${ready.id}/read-by`, { token: lead.token });
  const savedPoll = history.items.find(item => item.id === poll.id)?.poll;
  if (history.items.length !== 4 || receipts.length !== 2 || savedPoll?.total_votes !== 3
      || !history.items.some(item => item.reply_to?.id === decision.id)
      || history.items.find(item => item.id === ready.id)?.reactions[0]?.count !== 2) {
    throw new Error('Synthetic seed persistence mismatch');
  }
  return { users, chat, ready, path };
}
