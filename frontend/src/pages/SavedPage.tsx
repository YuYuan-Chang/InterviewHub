import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { PostCard } from '../components/PostCard';
import { Feedback, FeedLoading } from '../components/Feedback';
import type { Collection, Page, Post } from '../types';

/** Everything the viewer saved, with their collections alongside. */
export function SavedPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const saved = useInfiniteQuery({
    queryKey: ['bookmarks'],
    queryFn: ({ pageParam }) =>
      api<Page<Post>>(`/api/bookmarks${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const collections = useQuery({
    queryKey: ['collections', 'mine'],
    queryFn: () => api<{ items: Collection[] }>('/api/collections'),
  });

  const posts = saved.data?.pages.flatMap((p) => p.items) ?? [];

  async function createCollection(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError('');
    try {
      await api<Collection>('/api/collections', { body: { name: trimmed } });
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The collection couldn’t be created.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="saved-layout">
      <div className="feed">
        <div className="feed-toolbar">
          <h2>Saved</h2>
          <span className="page-note">Only you can see this.</span>
        </div>

        {saved.isLoading && <FeedLoading />}
        {saved.isError && (
          <Feedback title="We couldn’t load your saved posts" error>
            <p>Please try again in a moment.</p>
            <button className="btn btn-ghost" onClick={() => void saved.refetch()} disabled={saved.isFetching}>
              {saved.isFetching ? 'Trying again…' : 'Try again'}
            </button>
          </Feedback>
        )}
        {saved.isSuccess && posts.length === 0 && (
          <Feedback title="Nothing saved yet">
            <p>Tap ☆ Save on any resource to keep it here, and file the ones you return to into collections.</p>
            <Link className="btn btn-primary" to="/">Explore resources</Link>
          </Feedback>
        )}
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {saved.hasNextPage && (
          <button
            className="btn btn-ghost load-more"
            onClick={() => saved.fetchNextPage()}
            disabled={saved.isFetchingNextPage}
          >
            {saved.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        )}
      </div>

      <aside className="saved-sidebar" aria-label="Your collections">
        <section className="card">
          <h3>Collections</h3>
          <p className="page-note">Group saved resources by topic, company, or whatever helps you prep.</p>
          <CollectionList items={collections.data?.items} loading={collections.isLoading} />
          <form className="save-new" onSubmit={createCollection}>
            <label className="sr-only" htmlFor="new-collection">New collection name</label>
            <input
              id="new-collection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New collection…"
              maxLength={80}
            />
            <button className="btn btn-primary" type="submit" disabled={creating || !name.trim()}>
              Create
            </button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </aside>
    </div>
  );
}

export function CollectionList({ items, loading }: { items?: Collection[]; loading?: boolean }) {
  if (loading) return <p className="page-note">Loading…</p>;
  if (!items || items.length === 0) return <p className="page-note">No collections yet.</p>;
  return (
    <ul className="collection-list">
      {items.map((c) => (
        <li key={c.id}>
          <Link to={`/collections/${c.id}`} className="collection-row">
            <span className="collection-name">{c.name}</span>
            <span className="page-note">
              {c.itemCount} {c.itemCount === 1 ? 'post' : 'posts'}
              {c.isPrivate ? ' · private' : ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
