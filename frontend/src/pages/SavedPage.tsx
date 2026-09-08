import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { refreshSavedQueries } from '../saved';
import { Dialog } from '../components/Dialog';
import { Feedback, FeedLoading } from '../components/Feedback';
import { PostCard } from '../components/PostCard';
import type { Collection, Page, SavedResource } from '../types';

function CollectionForm({ collection, onClose, onCreated }: {
  collection?: Collection;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(collection?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<Collection>(collection ? `/api/posts/collections/${collection.id}` : '/api/posts/collections', {
        method: collection ? 'PATCH' : 'POST', body: { name: name.trim() },
      });
      await client.invalidateQueries({ queryKey: ['collections'] });
      if (!collection) onCreated(result.id);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save collection.'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog title={collection ? 'Rename collection' : 'Create a collection'} onClose={onClose} busy={busy}>
      <p className="page-note">Group resources by a role, company, or topic. Only you can see this collection.</p>
      <form className="form" onSubmit={submit}>
        <label>Collection name<input autoFocus required maxLength={80} value={name} disabled={busy}
          placeholder="e.g. SWE interview prep" onChange={(event) => setName(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : collection ? 'Save name' : 'Create collection'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function SavedEntry({ resource, collections }: { resource: SavedResource; collections: Collection[] }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggleReviewed() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/posts/${resource.post.id}/save`, { method: 'PUT', body: { reviewed: !resource.reviewed } });
      await refreshSavedQueries(client);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update review status.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="saved-entry">
      <PostCard post={resource.post} />
      <div className="saved-entry-details">
        <div className="saved-entry-meta">
          <label className="check-row"><input type="checkbox" checked={resource.reviewed} disabled={busy}
            onChange={() => void toggleReviewed()} />{resource.reviewed ? 'Reviewed' : 'Mark as reviewed'}</label>
          <span className="page-note">Saved {new Date(resource.savedAt).toLocaleDateString()}</span>
        </div>
        {resource.notes && <div className="saved-notes"><span className="eyebrow">PRIVATE NOTES</span><p>{resource.notes}</p></div>}
        {resource.collectionIds.length > 0 && <div className="tags">
          {collections.filter((collection) => resource.collectionIds.includes(collection.id)).map((collection) => (
            <Link className="tag" key={collection.id} to={`/saved?collectionId=${collection.id}`}>{collection.name}</Link>
          ))}
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export function SavedPage() {
  const { me } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const collectionId = params.get('collectionId') ?? '';
  const reviewed = ['true', 'false'].includes(params.get('reviewed') ?? '') ? params.get('reviewed')! : '';
  const [edit, setEdit] = useState<Collection | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const collectionsQuery = useQuery({ queryKey: ['collections', me?.userId],
    queryFn: () => api<{ items: Collection[] }>('/api/posts/collections'), enabled: !!me });
  const collections = collectionsQuery.data?.items ?? [];
  const selected = collections.find((collection) => collection.id === collectionId);
  const saved = useInfiniteQuery({
    queryKey: ['saved', me?.userId, collectionId, reviewed],
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      if (collectionId) query.set('collectionId', collectionId);
      if (reviewed) query.set('reviewed', reviewed);
      if (pageParam) query.set('cursor', pageParam);
      return api<Page<SavedResource>>(`/api/posts/saved?${query}`);
    },
    initialPageParam: '', getNextPageParam: (last) => last.nextCursor ?? undefined, enabled: !!me,
  });
  const resources = saved.data?.pages.flatMap((page) => page.items) ?? [];

  function selectCollection(id: string) {
    const next = new URLSearchParams(params);
    if (id) next.set('collectionId', id); else next.delete('collectionId');
    setParams(next);
  }

  async function deleteCollection() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await api(`/api/posts/collections/${deleting.id}`, { method: 'DELETE' });
      if (collectionId === deleting.id) selectCollection('');
      setDeleting(null);
      await refreshSavedQueries(client);
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'Could not delete collection.'); }
    finally { setDeleteBusy(false); }
  }

  return (
    <div className="library-page">
      <header className="library-intro">
        <div><span className="eyebrow">YOUR PERSONAL PREP LIBRARY</span><h1>Saved resources.</h1>
          <p>Keep useful ideas close. Organize your next step.</p></div>
        <span className="privacy-label">Only visible to you</span>
      </header>
      <div className="library-layout">
        <aside className="card library-sidebar" aria-label="Your collections">
          <div className="library-section-heading"><h2>Collections</h2>
            <button className="btn btn-ghost" onClick={() => setEdit('new')} aria-label="Create collection">＋ New</button></div>
          <nav className="collection-nav" aria-label="Filter saved resources by collection">
            <button className={!collectionId ? 'selected' : ''} aria-current={!collectionId ? 'page' : undefined}
              onClick={() => selectCollection('')}>All saved resources</button>
            {collections.map((collection) => (
              <button key={collection.id} className={collection.id === collectionId ? 'selected' : ''}
                aria-current={collection.id === collectionId ? 'page' : undefined} onClick={() => selectCollection(collection.id)}>
                <span>{collection.name}</span><span className="collection-count">{collection.resourceCount}</span>
              </button>
            ))}
          </nav>
          {collectionsQuery.isLoading && <p className="page-note" role="status">Loading collections…</p>}
          {collectionsQuery.isError && <div role="alert"><p>Could not load collections.</p><button className="btn btn-ghost"
            onClick={() => void collectionsQuery.refetch()}>Try again</button></div>}
          {collectionsQuery.isSuccess && collections.length === 0 && <p className="page-note">A collection for each goal. Try “System design” or “Resume ideas.”</p>}
          <p className="library-tip">Use <strong>Saved</strong> on any resource to organize it or add a private note.</p>
        </aside>
        <section className="library-results" aria-label="Saved resources">
          <div className="library-results-heading">
            <h2>{selected?.name ?? (collectionId ? 'Collection' : 'All saved resources')}</h2>
            <label className="review-filter"><span className="sr-only">Review status</span>
              <select value={reviewed} onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.value) next.set('reviewed', event.target.value); else next.delete('reviewed');
                setParams(next);
              }}><option value="">All statuses</option><option value="false">Not reviewed</option><option value="true">Reviewed</option></select>
            </label>
          </div>
          {selected && <div className="collection-actions">
            <button className="btn-link" onClick={() => setEdit(selected)}>Rename collection</button>
            <button className="btn-link danger-text" onClick={() => { setDeleteError(''); setDeleting(selected); }}>Delete collection</button>
          </div>}
          {saved.isLoading && <FeedLoading />}
          {saved.isError && <Feedback title="We couldn’t load your saved resources" error>
            <p>{saved.error.message}</p><button className="btn btn-ghost" disabled={saved.isFetching} onClick={() => void saved.refetch()}>Try again</button>
            {collectionId && <button className="btn btn-ghost" onClick={() => selectCollection('')}>View all saved</button>}
          </Feedback>}
          {saved.isSuccess && resources.length === 0 && <Feedback title={reviewed ? 'No resources with this status' : collectionId ? 'Make room for your next goal' : 'Your next great find belongs here'}>
            <p>{reviewed ? 'Change the review filter to see more of your library.' : collectionId
              ? 'Save resources from the community, then select this collection to keep them together.'
              : 'Tap Save on a resource to keep it here, add private notes, and track what you’ve reviewed.'}</p>
            {reviewed ? <button className="btn btn-ghost" onClick={() => { const next = new URLSearchParams(params); next.delete('reviewed'); setParams(next); }}>Show all statuses</button>
              : <Link className="btn btn-primary" to="/">Explore resources</Link>}
          </Feedback>}
          {resources.map((resource) => <SavedEntry key={resource.post.id} resource={resource} collections={collections} />)}
          {saved.hasNextPage && <button className="btn btn-ghost load-more" disabled={saved.isFetchingNextPage}
            onClick={() => void saved.fetchNextPage()}>{saved.isFetchingNextPage ? 'Loading…' : 'Show more'}</button>}
        </section>
      </div>
      {edit && <CollectionForm collection={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onCreated={selectCollection} />}
      {deleting && <Dialog title="Delete collection?" onClose={() => setDeleting(null)} busy={deleteBusy}>
        <p>Delete “{deleting.name}”? Your resources, private notes, and review status will stay in All saved resources.</p>
        {deleteError && <p className="error" role="alert">{deleteError}</p>}
        <div className="dialog-actions"><button className="btn btn-ghost" disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={deleteBusy} onClick={() => void deleteCollection()}>{deleteBusy ? 'Deleting…' : 'Delete collection'}</button></div>
      </Dialog>}
    </div>
  );
}
