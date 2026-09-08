#!/usr/bin/env node
/** Destructive fault injection ONLY against a disposable Compose project ending in -reliability.
 * BASE_URL=http://localhost:18080 FILE_URL=http://localhost:14004
 * RELIABILITY_PROJECT=interviewhub-reliability node scripts/reliability-test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const project = process.env.RELIABILITY_PROJECT;
if (!project?.endsWith('-reliability')) throw new Error('Use a disposable RELIABILITY_PROJECT ending in -reliability');
const base = process.env.BASE_URL ?? 'http://localhost:18080';
const fileUrl = process.env.FILE_URL ?? 'http://localhost:14004';
const container = (service) => `${project}-${service}-1`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sql = (db, statement) => docker('exec', container('postgres'), 'psql', '-U', 'postgres', '-d', `${db}_db`, '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const paused = new Set();
async function api(path, { token, body, method = 'GET', form } = {}) {
  const res = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(5000), headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}),
  }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
}
async function until(label, check, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) { console.log(`PASS ${label}`); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out: ${label}`);
}
function pause(service) { docker('pause', container(service)); paused.add(service); }
function resume(service) { docker('unpause', container(service)); paused.delete(service); }
const run = Date.now().toString(36);
async function register(name) {
  const email = `${name}_${run}@reliability.test`;
  const result = await api('/api/auth/register', { method: 'POST', body: { email, password: 'password123', username: `${name}_${run}`, displayName: name } });
  assert.equal(result.status, 201);
  const token = result.data.accessToken;
  const me = await api('/api/auth/me', { token });
  return { email, token, id: me.data.id };
}
async function upload(token) {
  const form = new FormData(); form.append('file', new Blob(['reliability test'], { type: 'text/plain' }), 'reliability.txt');
  const result = await api('/api/files', { method: 'POST', token, form });
  assert.equal(result.status, 201); return result.data.id;
}
try {
  sql('auth', 'DELETE FROM rate_limits');
  const a = await register('reliable_a'); const b = await register('reliable_b');
  const fileId = await upload(b.token);
  const post = await api('/api/posts', { token: b.token, method: 'POST', body: { title: 'Reliability test', description: 'Fault injection', fileIds: [fileId], tags: [] } });
  assert.equal(post.status, 201); const postId = post.data.id;
  pause('kafka');
  assert.equal((await api(`/api/users/${b.id}/follow`, { method: 'POST', token: a.token })).status, 201);
  assert.equal((await api(`/api/comments/post/${postId}`, { method: 'POST', token: a.token, body: { body: 'Survives broker outage' } })).status, 201);
  const payload = sql('user', `SELECT payload FROM outbox WHERE payload->>'actorId' = ${quote(a.id)} LIMIT 1`);
  assert.ok(payload); assert.equal(sql('comment', `SELECT count(*) FROM outbox WHERE payload->>'postId' = ${quote(postId)}`), '1');
  docker('restart', container('user-service'));
  assert.ok(sql('user', `SELECT payload FROM outbox WHERE id = ${quote(JSON.parse(payload).eventId)}`));
  console.log('PASS writes and outbox events survive Kafka outage and producer restart');
  resume('kafka');
  await until('Kafka recovery drains outboxes and delivers both notifications', () => sql('notification', `SELECT count(*) FROM notifications WHERE recipient_id = ${quote(b.id)}`) === '2');
  const event = JSON.parse(payload);
  sql('notification', `UPDATE notifications SET read = true WHERE event_id = ${quote(event.eventId)}`);
  sql('user', `INSERT INTO outbox (id, payload) VALUES (${quote(event.eventId)}, ${quote(payload)}::jsonb) ON CONFLICT DO NOTHING`);
  await until('replayed event is acknowledged', () => sql('user', `SELECT count(*) FROM outbox WHERE id = ${quote(event.eventId)}`) === '0');
  assert.equal(sql('notification', `SELECT count(*) FROM notifications WHERE event_id = ${quote(event.eventId)} AND read = true`), '1');
  console.log('PASS duplicate delivery preserves one notification and its read state');
  sql('post', `UPDATE posts SET upvote_count = 999, comment_count = 999 WHERE id = ${quote(postId)}`);
  await until('post counters reconcile to source rows', () => sql('post', `SELECT upvote_count || ':' || comment_count FROM posts WHERE id = ${quote(postId)}`) === '0:1');
  const collection = await api('/api/collections', { method: 'POST', token: a.token, body: { name: 'Reliability collection' } });
  assert.equal(collection.status, 201);
  assert.equal((await api(`/api/collections/${collection.data.id}/posts`, { method: 'POST', token: a.token, body: { postId } })).status, 201);
  sql('post', `UPDATE collections SET item_count = 999 WHERE id = ${quote(collection.data.id)}`);
  await until('collection counters reconcile', () => sql('post', `SELECT item_count FROM collections WHERE id = ${quote(collection.data.id)}`) === '1');
  sql('comment', `UPDATE comments SET upvote_count = 999 WHERE post_id = ${quote(postId)}`);
  await until('comment counters reconcile', () => sql('comment', `SELECT upvote_count FROM comments WHERE post_id = ${quote(postId)}`) === '0');
  sql('file', `UPDATE files SET created_at = now() - interval '3 days' WHERE id = ${quote(fileId)}`);
  const orphan = await upload(b.token);
  sql('file', `UPDATE files SET created_at = now() - interval '3 days' WHERE id = ${quote(orphan)}`);
  await until('unused uploads enter quarantine', () => sql('file', `SELECT gc_marked_at IS NOT NULL FROM files WHERE id = ${quote(orphan)}`) === 't');
  assert.equal(sql('file', `SELECT gc_marked_at IS NULL FROM files WHERE id = ${quote(fileId)}`), 't');
  sql('file', `UPDATE files SET gc_marked_at = now() - interval '3 days' WHERE id = ${quote(orphan)}`);
  await until('quarantined orphan metadata and object are removed', async () => sql('file', `SELECT count(*) FROM files WHERE id = ${quote(orphan)}`) === '0' && (await api(`/api/files/${orphan}/content`)).status === 404);
  assert.equal((await api(`/api/posts/${postId}`, { method: 'DELETE', token: b.token })).status, 204);
  await until('deleted-post comments are collected', () => sql('comment', `SELECT count(*) FROM comments WHERE post_id = ${quote(postId)}`) === '0');
  await until('deleted-post attachment enters quarantine', () => sql('file', `SELECT gc_marked_at IS NOT NULL FROM files WHERE id = ${quote(fileId)}`) === 't');
  pause('minio');
  const started = Date.now();
  const ready = await fetch(`${fileUrl}/healthz`, { signal: AbortSignal.timeout(4000) });
  assert.equal(ready.status, 503); assert.ok(Date.now() - started < 3500);
  assert.equal((await fetch(`${fileUrl}/livez`)).status, 200);
  resume('minio');
  await until('MinIO recovery restores readiness', async () => (await fetch(`${fileUrl}/healthz`)).status === 200);
  for (let i = 0; i < 10; i++) assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong' } })).status, 401);
  const limited = await api('/api/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong' } });
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  console.log('PASS login rate limiting returns 429 with Retry-After');
  sql('auth', 'DELETE FROM rate_limits');
  for (let i = 0; i < 5; i++) assert.equal((await api('/api/auth/register', { method: 'POST', body: {} })).status, 400);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: {} })).status, 429);
  console.log('PASS registration attempts are rate limited before validation or hashing');
} finally {
  for (const service of paused) resume(service);
}
