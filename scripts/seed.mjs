#!/usr/bin/env node
/** Seeds demo users/posts/comments through the public API: BASE_URL=http://localhost:8080 node scripts/seed.mjs */
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';

async function api(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const USERS = [
  { username: 'mchen', displayName: 'Maya Chen', school: 'UC Berkeley', targetRoles: ['SWE intern'], password: 'password123' },
  { username: 'dpatel', displayName: 'Dev Patel', school: 'Georgia Tech', targetRoles: ['ML engineer', 'SWE intern'], password: 'password123' },
  { username: 'slee', displayName: 'Sarah Lee', school: 'UW', targetRoles: ['PM intern'], password: 'password123' },
];

const POSTS = [
  { by: 0, title: 'My Google SWE intern interview notes (2026)', description: 'Phone screen + onsite breakdown, with the exact LeetCode list I used.', tags: ['swe intern', 'google', 'coding'] },
  { by: 1, title: 'System design primer for interns', description: 'You do NOT need to know Paxos. Here is what they actually ask.', tags: ['system design', 'swe intern'] },
  { by: 1, title: 'Meta ML engineer loop — full debrief', description: 'ML depth round was 80% of the decision. Prep accordingly.', tags: ['ml engineer', 'meta', 'behavioral'] },
  { by: 2, title: 'Behavioral answers that actually worked', description: 'My STAR bank for "tell me about a conflict" and friends.', tags: ['behavioral'] },
];

async function main() {
  const tokens = [];
  for (const u of USERS) {
    let t;
    try {
      t = await api('/api/auth/register', { method: 'POST', body: { ...u, email: `${u.username}@example.com` } });
      console.log(`registered @${u.username}`);
    } catch {
      t = await api('/api/auth/login', { method: 'POST', body: { email: `${u.username}@example.com`, password: u.password } });
      console.log(`logged in @${u.username}`);
    }
    tokens.push(t);
  }

  // follow graph: everyone follows Maya, Maya follows Dev
  await api(`/api/users/${tokens[0].user.id}/follow`, { method: 'POST', token: tokens[1].accessToken, body: {} });
  await api(`/api/users/${tokens[0].user.id}/follow`, { method: 'POST', token: tokens[2].accessToken, body: {} });
  await api(`/api/users/${tokens[1].user.id}/follow`, { method: 'POST', token: tokens[0].accessToken, body: {} });

  const created = [];
  for (const p of POSTS) {
    const post = await api('/api/posts', { method: 'POST', token: tokens[p.by].accessToken, body: p });
    created.push(post);
    console.log(`post: ${post.title}`);
  }

  await api(`/api/posts/${created[0].id}/upvote`, { method: 'PUT', token: tokens[1].accessToken });
  await api(`/api/posts/${created[0].id}/upvote`, { method: 'PUT', token: tokens[2].accessToken });
  await api(`/api/posts/${created[1].id}/upvote`, { method: 'PUT', token: tokens[0].accessToken });

  const c = await api(`/api/comments/post/${created[0].id}`, {
    method: 'POST',
    token: tokens[1].accessToken,
    body: { body: 'Which round was the hardest?' },
  });
  await api(`/api/comments/post/${created[0].id}`, {
    method: 'POST',
    token: tokens[0].accessToken,
    body: { body: 'The onsite coding round — two mediums in 45 min.', parentId: c.id },
  });

  console.log('\nSeed complete. Log in as mchen@example.com / password123');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
