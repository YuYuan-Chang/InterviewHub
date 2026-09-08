/** Exercised by the main smoke test against real services and databases. */
export async function testSavedResources({ api, check, alice, bob, post, post2 }) {
  const owner = { token: alice.accessToken };
  const other = { token: bob.accessToken };
  const savePath = `/api/posts/${post.id}/save`;
  const secondPath = `/api/posts/${post2.id}/save`;
  const missingId = '11111111-1111-4111-8111-111111111111';
  console.log('— saved resources & collections');
  check('saved library requires authentication', (await api('/api/posts/saved')).status === 401);
  check('collections require authentication', (await api('/api/posts/collections')).status === 401);
  check('saving requires authentication', (await api(savePath, { method: 'PUT', body: {} })).status === 401);

  const create = (name, who = owner) => api('/api/posts/collections', { ...who, method: 'POST', body: { name } });
  const c1 = await create('  SWE prep  ');
  const c2 = await create('Resume ideas');
  check('creates named private collections', c1.status === 201 && c1.data.name === 'SWE prep' && c1.data.resourceCount === 0 && c2.status === 201);
  if (!c1.data?.id || !c2.data?.id) throw new Error('Saved collections could not be created');
  check('duplicate collection names rejected', (await create('SWE prep')).status === 409);
  check('blank collection names rejected', (await create('   ')).status === 400);
  check('collection names can be reused by another account', (await create('SWE prep', other)).status === 201);

  const first = await api(savePath, { ...owner, method: 'PUT', body: {
    notes: 'Private: practice these questions.', reviewed: true, collectionIds: [c1.data.id, c2.data.id, c1.data.id],
  } });
  check('saves notes and review status in multiple collections', first.status === 200 && first.data.reviewed === true
    && first.data.collectionIds.length === 2 && first.data.post.viewerHasSaved === true);
  const repeated = await api(savePath, { ...owner, method: 'PUT', body: {} });
  check('repeated saves preserve original date, notes and collections', repeated.status === 200
    && repeated.data.savedAt === first.data.savedAt && repeated.data.notes === first.data.notes && repeated.data.collectionIds.length === 2);
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => api(secondPath, { ...owner, method: 'PUT', body: {} })));
  check('concurrent first saves are idempotent', concurrent.every((res) => res.status === 200)
    && new Set(concurrent.map((res) => res.data.savedAt)).size === 1);

  const ownCollections = await api('/api/posts/collections', owner);
  check('collection counts reflect saved memberships', ownCollections.data.items.every((c) => c.resourceCount === 1));
  check('another user cannot read private notes', (await api(savePath, other)).status === 404);
  check('another user has a separate saved library', (await api('/api/posts/saved', other)).data.items.length === 0);
  check('another user cannot browse a private collection', (await api(`/api/posts/saved?collectionId=${c1.data.id}`, other)).status === 404);
  check('another user cannot rename a collection', (await api(`/api/posts/collections/${c1.data.id}`, {
    ...other, method: 'PATCH', body: { name: 'Stolen' },
  })).status === 404);
  check('another user cannot delete a collection', (await api(`/api/posts/collections/${c1.data.id}`, { ...other, method: 'DELETE' })).status === 404);
  check('another user cannot add resources to a private collection', (await api(savePath, {
    ...other, method: 'PUT', body: { collectionIds: [c1.data.id] },
  })).status === 404);
  check('failed foreign save leaves no saved resource', (await api(savePath, other)).status === 404);
  await api(savePath, { ...other, method: 'DELETE' });
  check('another user cannot remove owner bookmark', (await api(savePath, owner)).status === 200);

  const invalidUpdate = await api(savePath, { ...owner, method: 'PUT', body: {
    notes: 'Must not persist', collectionIds: [c1.data.id, missingId],
  } });
  check('invalid membership update is atomic', invalidUpdate.status === 404 && (await api(savePath, owner)).data.notes === first.data.notes);
  check('saving a nonexistent post returns 404', (await api(`/api/posts/${missingId}/save`, { ...owner, method: 'PUT', body: {} })).status === 404);
  check('oversized private notes rejected', (await api(savePath, { ...owner, method: 'PUT', body: { notes: 'x'.repeat(5001) } })).status === 400);
  const publicPost = await api(`/api/posts/${post.id}`);
  const otherPost = await api(`/api/posts/${post.id}`, other);
  check('public post responses do not expose saved details', publicPost.data.viewerHasSaved === false
    && otherPost.data.viewerHasSaved === false && !('notes' in publicPost.data) && !('collectionIds' in publicPost.data));
  const feed = await api(`/api/posts/feed/explore?authorId=${post.authorId}`, owner);
  check('feeds include the viewer bookmark state', feed.data.items.find((item) => item.id === post.id)?.viewerHasSaved === true);

  const reviewed = await api('/api/posts/saved?reviewed=true', owner);
  const unreviewed = await api('/api/posts/saved?reviewed=false', owner);
  check('reviewed filter returns reviewed resources', reviewed.data.items.length === 1 && reviewed.data.items[0].post.id === post.id);
  check('false review filter returns only unreviewed resources', unreviewed.data.items.length === 1 && unreviewed.data.items[0].post.id === post2.id);
  check('invalid review filters rejected', (await api('/api/posts/saved?reviewed=no', owner)).status === 400);
  check('malformed saved cursors rejected', (await api('/api/posts/saved?cursor=e30', owner)).status === 400);
  const page1 = await api('/api/posts/saved?limit=1', owner);
  const page2 = await api(`/api/posts/saved?limit=1&cursor=${encodeURIComponent(page1.data.nextCursor)}`, owner);
  check('saved pagination visits each resource once', page1.data.items.length === 1 && page2.data.items.length === 1
    && page1.data.items[0].post.id !== page2.data.items[0].post.id && page2.data.nextCursor === null);
  await api(`/api/posts/${page1.data.items[0].post.id}/save`, { ...owner, method: 'DELETE' });
  const afterRemoval = await api(`/api/posts/saved?limit=1&cursor=${encodeURIComponent(page1.data.nextCursor)}`, owner);
  check('pagination works after cursor resource is unsaved', afterRemoval.data.items[0]?.post.id === page2.data.items[0].post.id);

  const clear = await api(savePath, { ...owner, method: 'PUT', body: { collectionIds: [] } });
  check('clearing collections preserves notes and review state', clear.data.collectionIds.length === 0
    && clear.data.notes === first.data.notes && clear.data.reviewed === true);
  await api(savePath, { ...owner, method: 'PUT', body: { collectionIds: [c1.data.id, c2.data.id] } });
  const renamed = await api(`/api/posts/collections/${c1.data.id}`, { ...owner, method: 'PATCH', body: { name: 'Interview plan' } });
  check('renaming preserves collection contents', renamed.data.name === 'Interview plan' && renamed.data.resourceCount === 1);
  await api(`/api/posts/collections/${c1.data.id}`, { ...owner, method: 'DELETE' });
  const retained = await api(savePath, owner);
  check('deleting collection preserves saves, notes and other memberships', retained.status === 200
    && retained.data.notes === first.data.notes && retained.data.collectionIds.length === 1 && retained.data.collectionIds[0] === c2.data.id);

  const disposable = await api('/api/posts', { ...owner, method: 'POST', body: { title: 'Disposable collection resource' } });
  await api(`/api/posts/${disposable.data.id}/save`, { ...owner, method: 'PUT', body: { collectionIds: [c2.data.id] } });
  await api(`/api/posts/${disposable.data.id}`, { ...owner, method: 'DELETE' });
  const afterDelete = await api('/api/posts/collections', owner);
  check('post deletion cascades saved entries and collection membership', (await api(`/api/posts/${disposable.data.id}/save`, owner)).status === 404
    && afterDelete.data.items.find((c) => c.id === c2.data.id).resourceCount === 1);
  check('unsaving works', (await api(savePath, { ...owner, method: 'DELETE' })).status === 204);
  check('unsaving is idempotent', (await api(savePath, { ...owner, method: 'DELETE' })).status === 204);
  check('unsaving does not delete the original post', (await api(`/api/posts/${post.id}`)).status === 200);
  check('unsaving clears collection counts', (await api('/api/posts/collections', owner)).data.items.every((c) => c.resourceCount === 0));
}
