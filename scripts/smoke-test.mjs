#!/usr/bin/env node
/**
 * End-to-end smoke test. Runs against the gateway (frontend nginx or k8s ingress):
 *   BASE_URL=http://localhost:8080 node scripts/smoke-test.mjs
 *
 * Flow: register 2 users → A follows B → B uploads a PDF and posts it →
 * A sees it in Following feed → A upvotes & comments → B replies →
 * notifications land → explore feed sorts/filters → oversized upload is rejected.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const run = Date.now().toString(36);

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON (204s, nginx error pages) */
  }
  return { status: res.status, data };
}

// A tiny but valid single-page PDF.
function makePdf(text) {
  const stream = `BT /F1 18 Tf 50 720 Td (${text}) Tj ET`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o + '\n';
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function register(username, displayName, school, targetRoles) {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: {
      email: `${username}@smoke.test`,
      password: 'password123',
      username,
      displayName,
      school,
      targetRoles,
    },
  });
  if (res.status !== 201) throw new Error(`register ${username} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

async function main() {
  console.log(`Smoke test against ${BASE} (run ${run})\n`);

  console.log('— health');
  for (const svc of ['auth', 'users', 'posts', 'files', 'comments', 'notifications']) {
    // healthz isn't routed through the gateway; a 401/404-free API root probe suffices per service
  }
  const health = await api('/api/posts/feed/explore?limit=1');
  check('gateway + post-service reachable', health.status === 200, `got ${health.status}`);

  console.log('— auth');
  const alice = await register(`alice_${run}`, 'Alice Chen', 'UC Berkeley', ['SWE intern']);
  const bob = await register(`bob_${run}`, 'Bob Park', 'Georgia Tech', ['ML engineer']);
  check('register returns tokens', !!alice.accessToken && !!bob.accessToken);

  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: `alice_${run}@smoke.test`, password: 'wrong-password' },
  });
  check('wrong password rejected with 401', badLogin.status === 401, `got ${badLogin.status}`);

  const dupUsername = await api('/api/auth/register', {
    method: 'POST',
    body: {
      email: `alice2_${run}@smoke.test`,
      password: 'password123',
      username: `alice_${run}`,
      displayName: 'Impostor',
    },
  });
  check('duplicate username rejected with 409 (saga rollback)', dupUsername.status === 409, `got ${dupUsername.status}`);

  const refreshed = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: alice.refreshToken } });
  check('refresh token rotates', refreshed.status === 200 && !!refreshed.data.accessToken, `got ${refreshed.status}`);
  alice.accessToken = refreshed.data.accessToken;
  alice.refreshToken = refreshed.data.refreshToken;

  console.log('— follow graph');
  const follow = await api(`/api/users/${bob.user.id}/follow`, { method: 'POST', token: alice.accessToken, body: {} });
  check('alice follows bob', follow.status === 201, `got ${follow.status}`);
  const followAgain = await api(`/api/users/${bob.user.id}/follow`, { method: 'POST', token: alice.accessToken, body: {} });
  check('re-follow is idempotent', followAgain.status === 200 && followAgain.data.followerCount === 1, JSON.stringify(followAgain.data));
  const selfFollow = await api(`/api/users/${alice.user.id}/follow`, { method: 'POST', token: alice.accessToken, body: {} });
  check('self-follow rejected', selfFollow.status === 400, `got ${selfFollow.status}`);
  const bobProfile = await api(`/api/users/by-username/bob_${run}`, { token: alice.accessToken });
  check('profile shows counts + isFollowing', bobProfile.data.followerCount === 1 && bobProfile.data.isFollowing === true, JSON.stringify(bobProfile.data));

  console.log('— files & posts');
  const pdf = makePdf('Bob interview notes');
  const fd = new FormData();
  fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'bob-notes.pdf');
  const upload = await api('/api/files', { method: 'POST', token: bob.accessToken, formData: fd });
  check('PDF upload succeeds', upload.status === 201 && !!upload.data.id, `got ${upload.status} ${JSON.stringify(upload.data)}`);

  const bigFd = new FormData();
  bigFd.append('file', new Blob([Buffer.alloc(11 * 1024 * 1024)], { type: 'application/pdf' }), 'too-big.pdf');
  const bigUpload = await api('/api/files', { method: 'POST', token: bob.accessToken, formData: bigFd });
  check('11MB upload rejected with 413', bigUpload.status === 413, `got ${bigUpload.status}`);

  const exeFd = new FormData();
  exeFd.append('file', new Blob([Buffer.from('MZ...')], { type: 'application/x-msdownload' }), 'virus.exe');
  const exeUpload = await api('/api/files', { method: 'POST', token: bob.accessToken, formData: exeFd });
  check('disallowed MIME rejected with 415', exeUpload.status === 415, `got ${exeUpload.status}`);

  const post = await api('/api/posts', {
    method: 'POST',
    token: bob.accessToken,
    body: {
      title: 'Google SWE intern prep notes',
      description: 'Everything I used for my phone screens.',
      tags: ['SWE intern', 'Google', 'system design'],
      fileId: upload.data.id,
    },
  });
  check('post created with file + tags', post.status === 201 && post.data.tags.includes('google'), `got ${post.status}`);

  const stealFile = await api('/api/posts', {
    method: 'POST',
    token: alice.accessToken,
    body: { title: 'Stealing bob file', tags: [], fileId: upload.data.id },
  });
  check("attaching someone else's file rejected with 403", stealFile.status === 403, `got ${stealFile.status}`);

  const post2 = await api('/api/posts', {
    method: 'POST',
    token: alice.accessToken,
    body: { title: 'Behavioral question bank', description: 'STAR answers.', tags: ['behavioral'] },
  });
  check('post without file works', post2.status === 201, `got ${post2.status}`);

  console.log('— feeds');
  const following = await api('/api/posts/feed/following', { token: alice.accessToken });
  check(
    "alice's Following feed contains bob's post",
    following.status === 200 && following.data.items.some((p) => p.id === post.data.id),
    JSON.stringify(following.data.items?.map((p) => p.title)),
  );
  check(
    "…and not alice's own post",
    !following.data.items.some((p) => p.id === post2.data.id),
  );
  const tagged = await api('/api/posts/feed/explore?tag=google');
  check('explore feed filters by tag', tagged.status === 200 && tagged.data.items.every((p) => p.tags.includes('google')) && tagged.data.items.some((p) => p.id === post.data.id));

  console.log('— rich attachments');
  // 1x1 transparent PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const pngFd = new FormData();
  pngFd.append('file', new Blob([png], { type: 'image/png' }), 'shot.png');
  const pngUpload = await api('/api/files', { method: 'POST', token: bob.accessToken, formData: pngFd });
  check('PNG upload accepted', pngUpload.status === 201, `got ${pngUpload.status} ${JSON.stringify(pngUpload.data)}`);

  const mediaPost = await api('/api/posts', {
    method: 'POST',
    token: bob.accessToken,
    body: {
      title: 'Resume screenshot + full PDF',
      description: 'Both attached.',
      tags: ['resume'],
      fileIds: [pngUpload.data.id, upload.data.id],
    },
  });
  check(
    'post with multiple attachments',
    mediaPost.status === 201 &&
      mediaPost.data.attachments?.length === 2 &&
      mediaPost.data.attachments.some((a) => a.mime === 'image/png') &&
      mediaPost.data.attachments.some((a) => a.mime === 'application/pdf'),
    JSON.stringify(mediaPost.data.attachments),
  );

  const legacyView = await api(`/api/posts/${post.data.id}`);
  check(
    'legacy single-file post synthesized into attachments',
    legacyView.data.attachments?.length === 1 && legacyView.data.attachments[0].mime === 'application/pdf',
    JSON.stringify(legacyView.data.attachments),
  );

  const contentRes = await fetch(`${BASE}/api/files/${pngUpload.data.id}/content`);
  const contentBytes = Buffer.from(await contentRes.arrayBuffer());
  check(
    'anonymous inline content endpoint serves media',
    contentRes.status === 200 &&
      contentRes.headers.get('content-type') === 'image/png' &&
      (contentRes.headers.get('content-disposition') ?? '').startsWith('inline') &&
      contentBytes.equals(png),
    `got ${contentRes.status} ${contentRes.headers.get('content-type')}`,
  );

  const nineIds = Array.from({ length: 9 }, () => crypto.randomUUID());
  const tooMany = await api('/api/posts', {
    method: 'POST',
    token: bob.accessToken,
    body: { title: 'Too many files', tags: [], fileIds: nineIds },
  });
  check('9 attachments rejected with 400', tooMany.status === 400, `got ${tooMany.status}`);

  console.log('— profile editing');
  const profilePatch = await api('/api/users/me', {
    method: 'PATCH',
    token: alice.accessToken,
    body: { displayName: 'Alice C.', bio: 'Prepping for SWE internships.', targetRoles: ['SWE intern', 'quant'] },
  });
  check(
    'PATCH profile updates fields',
    profilePatch.status === 200 && profilePatch.data.bio === 'Prepping for SWE internships.',
    JSON.stringify(profilePatch.data),
  );
  const alicePublic = await api(`/api/users/by-username/alice_${run}`);
  check(
    'public profile reflects edits',
    alicePublic.data.displayName === 'Alice C.' && alicePublic.data.targetRoles.includes('quant'),
    JSON.stringify([alicePublic.data.displayName, alicePublic.data.targetRoles]),
  );

  const avatarFd = new FormData();
  avatarFd.append('file', new Blob([png], { type: 'image/png' }), 'me.png');
  const avatarUpload = await api('/api/files', { method: 'POST', token: alice.accessToken, formData: avatarFd });
  const avatarPatch = await api('/api/users/me', {
    method: 'PATCH',
    token: alice.accessToken,
    body: { avatarFileId: avatarUpload.data.id },
  });
  check(
    'avatar set from own image upload',
    avatarPatch.status === 200 && avatarPatch.data.avatarFileId === avatarUpload.data.id,
    `got ${avatarPatch.status}`,
  );
  const feedWithAvatar = await api(`/api/posts/feed/explore?authorId=${alice.user.id}&limit=1`);
  check(
    'feed authors carry avatarFileId',
    feedWithAvatar.data.items[0]?.author?.avatarFileId === avatarUpload.data.id,
    JSON.stringify(feedWithAvatar.data.items[0]?.author),
  );
  const foreignAvatar = await api('/api/users/me', {
    method: 'PATCH',
    token: bob.accessToken,
    body: { avatarFileId: avatarUpload.data.id },
  });
  check("using someone else's file as avatar rejected 403", foreignAvatar.status === 403, `got ${foreignAvatar.status}`);
  const pdfAvatar = await api('/api/users/me', {
    method: 'PATCH',
    token: bob.accessToken,
    body: { avatarFileId: upload.data.id },
  });
  check('non-image avatar rejected 400', pdfAvatar.status === 400, `got ${pdfAvatar.status}`);

  console.log('— search & filters');
  const titleSearch = await api('/api/posts/feed/explore?q=prep%20notes');
  check(
    'post search matches title',
    titleSearch.status === 200 && titleSearch.data.items.some((p) => p.id === post.data.id),
    JSON.stringify(titleSearch.data.items?.map((p) => p.title)),
  );
  const noMatch = await api(`/api/posts/feed/explore?q=zzz_nothing_${run}`);
  check('post search returns nothing for garbage', noMatch.data.items.length === 0);
  const multiTag = await api(`/api/posts/feed/explore?tags=${encodeURIComponent('swe intern,google')}`);
  check(
    'multi-tag filter ANDs tags',
    multiTag.data.items.some((p) => p.id === post.data.id) &&
      multiTag.data.items.every((p) => p.tags.includes('swe intern') && p.tags.includes('google')),
    JSON.stringify(multiTag.data.items?.map((p) => p.tags)),
  );
  const popularTags = await api('/api/posts/tags/popular');
  check(
    'popular tags endpoint counts tags',
    popularTags.status === 200 && popularTags.data.tags.some((t) => t.tag === 'google' && t.count >= 1),
    JSON.stringify(popularTags.data.tags?.slice(0, 5)),
  );
  const peopleSearch = await api(`/api/users/search?q=alice_${run}`, { token: bob.accessToken });
  check(
    'people search finds user by username',
    peopleSearch.status === 200 && peopleSearch.data.items.some((u) => u.username === `alice_${run}`),
    JSON.stringify(peopleSearch.data.items?.map((u) => u.username)),
  );
  const schoolSearch = await api('/api/users/search?q=Georgia', { token: alice.accessToken });
  check(
    'people search finds user by school + isFollowing',
    schoolSearch.data.items.some((u) => u.username === `bob_${run}` && u.isFollowing === true),
    JSON.stringify(schoolSearch.data.items?.map((u) => [u.username, u.isFollowing])),
  );

  console.log('— reactions & comments');
  const upvote = await api(`/api/posts/${post.data.id}/upvote`, { method: 'PUT', token: alice.accessToken });
  const upvoteAgain = await api(`/api/posts/${post.data.id}/upvote`, { method: 'PUT', token: alice.accessToken });
  check('upvote is idempotent', upvote.data.upvoteCount === 1 && upvoteAgain.data.upvoteCount === 1, JSON.stringify([upvote.data, upvoteAgain.data]));

  const popular = await api('/api/posts/feed/explore?sort=popular&limit=5');
  check(
    'popular sort puts upvoted post first',
    popular.data.items.findIndex((p) => p.id === post.data.id) <
      (popular.data.items.findIndex((p) => p.id === post2.data.id) + 1 || Infinity),
  );

  const comment = await api(`/api/comments/post/${post.data.id}`, {
    method: 'POST',
    token: alice.accessToken,
    body: { body: 'Super helpful — how long did you prep for system design?' },
  });
  check('alice comments', comment.status === 201, `got ${comment.status}`);
  const reply = await api(`/api/comments/post/${post.data.id}`, {
    method: 'POST',
    token: bob.accessToken,
    body: { body: 'About 3 weeks, one mock a day.', parentId: comment.data.id },
  });
  check('bob replies in thread', reply.status === 201, `got ${reply.status}`);

  const thread = await api(`/api/comments/post/${post.data.id}`);
  const root = thread.data.items.find((c) => c.id === comment.data.id);
  check('comments come back threaded', !!root && root.replies.length === 1 && root.replies[0].id === reply.data.id);

  const cUpvote = await api(`/api/comments/${comment.data.id}/upvote`, { method: 'PUT', token: bob.accessToken });
  check('comment upvote works', cUpvote.status === 200 && cUpvote.data.upvoteCount === 1, `got ${cUpvote.status}`);

  const postAfter = await api(`/api/posts/${post.data.id}`);
  check('comment count denormalized onto post', postAfter.data.commentCount === 2, `got ${postAfter.data.commentCount}`);

  console.log('— notifications');
  // events flow through Kafka now — poll until the consumer has delivered them
  let bobNotifs;
  let aliceNotifsPoll;
  for (let attempt = 0; attempt < 30; attempt++) {
    [bobNotifs, aliceNotifsPoll] = await Promise.all([
      api('/api/notifications', { token: bob.accessToken }),
      api('/api/notifications', { token: alice.accessToken }),
    ]);
    const bobTypes = bobNotifs.data.items.map((n) => n.type);
    const aliceTypes = aliceNotifsPoll.data.items.map((n) => n.type);
    if (bobTypes.includes('new_follower') && bobTypes.includes('new_comment') && aliceTypes.includes('new_reply')) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const types = bobNotifs.data.items.map((n) => n.type).sort();
  check(
    'bob notified of follow + comment',
    types.includes('new_follower') && types.includes('new_comment'),
    JSON.stringify(types),
  );
  const aliceNotifs = aliceNotifsPoll;
  check(
    'alice notified of reply',
    aliceNotifs.data.items.some((n) => n.type === 'new_reply'),
    JSON.stringify(aliceNotifs.data.items.map((n) => n.type)),
  );
  const firstUnread = bobNotifs.data.items[0];
  await api(`/api/notifications/${firstUnread.id}/read`, { method: 'POST', token: bob.accessToken, body: {} });
  const bobNotifs2 = await api('/api/notifications', { token: bob.accessToken });
  check('mark-read decrements unread count', bobNotifs2.data.unreadCount === bobNotifs.data.unreadCount - 1);

  console.log('— download');
  const dl = await fetch(`${BASE}/api/files/${upload.data.id}/download`, {
    headers: { authorization: `Bearer ${alice.accessToken}` },
  });
  const bytes = Buffer.from(await dl.arrayBuffer());
  check('download round-trips the exact bytes', dl.status === 200 && bytes.equals(pdf), `got ${dl.status}, ${bytes.length}b vs ${pdf.length}b`);

  const anonDl = await fetch(`${BASE}/api/files/${upload.data.id}/download`);
  check('anonymous download rejected with 401', anonDl.status === 401, `got ${anonDl.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err);
  process.exit(1);
});
