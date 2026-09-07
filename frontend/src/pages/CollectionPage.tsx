import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { PostCard } from '../components/PostCard';
import { Feedback, FeedLoading } from '../components/Feedback';
import type { Collection, Page, Post } from '../types';

/** One collection: its posts, plus rename/visibility/delete controls for the owner. */
export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const collectionQuery = useQuery({
    queryKey: ['collections', id],
    queryFn: () => api<Collection>(`/api/collections/${id}`),
    enabled: !!id,
  });
  const collection = collectionQuery.data;

  const postsQuery = useInfiniteQuery({
    queryKey: ['collection-posts', id],
    queryFn: ({ pageParam }) =>
      api<Page<Post>>(`/api/collections/${id}/posts${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!collection,
  });

  if (collectionQuery.isLoading) return <p className="page-note">Loading…</p>;
  if (collectionQuery.isError || !collection) {
    return (
      <Feedback title="Collection not found" error>
        <p>It may have been deleted, or it’s private.</p>
        <Link className="btn btn-ghost" to="/saved">Back to saved</Link>
      </Feedback>
    );
  }

  // bound after the guard above so the async handlers below (hoisted) see a defined value
  const current = collection;
  const isOwner = me?.userId === current.ownerId;
  const posts = postsQuery.data?.pages.flatMap((p) => p.items) ?? [];

  async function mutate(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That change didn’t go through.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await mutate(async () => {
      await api(`/api/collections/${current.id}`, {
        method: 'PATCH',
        body: { name: draft.name, description: draft.description },
      });
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    });
  }

  async function toggleVisibility() {
    await mutate(async () => {
      await api(`/api/collections/${current.id}`, {
        method: 'PATCH',
        body: { isPrivate: !current.isPrivate },
      });
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    });
  }

  async function remove() {
    if (!confirm(`Delete “${current.name}”? The posts stay saved.`)) return;
    await mutate(async () => {
      await api(`/api/collections/${current.id}`, { method: 'DELETE' });
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      navigate('/saved');
    });
  }

  return (
    <div>
      <section className="card collection-header">
        {editing ? (
          <div className="form collection-edit">
            <label htmlFor="collection-name">Name</label>
            <input
              id="collection-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={80}
            />
            <label htmlFor="collection-description">Description</label>
            <textarea
              id="collection-description"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={300}
              rows={2}
            />
            <div className="collection-actions">
              <button className="btn btn-primary" onClick={save} disabled={busy || !draft.name.trim()}>
                Save
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2>{collection.name}</h2>
            {collection.description && <p>{collection.description}</p>}
            <p className="page-note">
              {collection.itemCount} {collection.itemCount === 1 ? 'post' : 'posts'} ·{' '}
              {collection.isPrivate ? 'Private' : 'Public'}
            </p>
            {isOwner && (
              <div className="collection-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDraft({ name: collection.name, description: collection.description });
                    setEditing(true);
                  }}
                >
                  Rename
                </button>
                <button className="btn btn-ghost" onClick={toggleVisibility} disabled={busy}>
                  {collection.isPrivate ? 'Make public' : 'Make private'}
                </button>
                <button className="btn btn-ghost" onClick={remove} disabled={busy}>
                  Delete
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {postsQuery.isLoading && <FeedLoading />}
      {postsQuery.isSuccess && posts.length === 0 && (
        <Feedback title="This collection is empty">
          <p>{isOwner ? 'Use ☆ Save on a resource and pick this collection.' : 'Nothing has been filed here yet.'}</p>
          {isOwner && <Link className="btn btn-primary" to="/">Explore resources</Link>}
        </Feedback>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {postsQuery.hasNextPage && (
        <button
          className="btn btn-ghost load-more"
          onClick={() => postsQuery.fetchNextPage()}
          disabled={postsQuery.isFetchingNextPage}
        >
          {postsQuery.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}
