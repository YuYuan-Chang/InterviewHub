import { useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { More, QueryState, SaveError, useSave } from './Preparation';
import type { Collection, Page, Post, PreparationPlan } from '../types';

export function WorkspaceResources({ plan }: { plan: PreparationPlan }) {
  const { me } = useAuth();
  const collections = useQuery({
    queryKey: ['preparation-collections', me?.userId],
    queryFn: () => api<{ items: Collection[] }>('/api/collections'),
  });
  const [selected, setSelected] = useState(plan.collectionId ?? '');
  const { save, busy, error } = useSave();
  return (
    <section>
      <h2>Study resources</h2>
      <p>
        Resources belong to the linked collection. Adding or removing posts here
        also changes that collection. Unlinking leaves its posts intact.
      </p>
      <QueryState query={collections}>
        <form
          className="prep-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(`/plans/${plan.id}`, 'PATCH', {
              collectionId: selected || null,
            });
          }}
        >
          <label>
            Study collection
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">No collection</option>
              {selected &&
                !collections.data?.items.some((c) => c.id === selected) && (
                  <option value={selected}>Unavailable collection</option>
                )}
              {collections.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isPrivate ? '' : ' (public)'}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            Save collection link
          </button>
        </form>
        {!collections.data?.items.length && (
          <p>
            <Link to="/saved">Create a collection in Saved</Link> to organize
            your resources.
          </p>
        )}
      </QueryState>
      {plan.collectionId && (
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            if (
              await save(`/plans/${plan.id}`, 'PATCH', { collectionId: null })
            )
              setSelected('');
          }}
        >
          Unlink collection
        </button>
      )}
      <SaveError error={error} />
      {plan.collectionId ? (
        <CollectionResources key={plan.collectionId} id={plan.collectionId} />
      ) : (
        <p>No study collection linked yet.</p>
      )}
    </section>
  );
}

function CollectionResources({ id }: { id: string }) {
  const { me } = useAuth();
  const cache = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const posts = useInfiniteQuery({
    queryKey: ['collection-posts', id, me?.userId],
    queryFn: ({ pageParam }) =>
      api<Page<Post>>(
        `/api/collections/${id}/posts?cursor=${encodeURIComponent(pageParam)}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const bookmarks = useInfiniteQuery({
    queryKey: ['workspace-bookmarks', me?.userId],
    queryFn: ({ pageParam }) =>
      api<Page<Post>>(`/api/bookmarks?cursor=${encodeURIComponent(pageParam)}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: adding,
  });
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  async function change(postId: string, remove: boolean) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/collections/${id}/posts${remove ? `/${postId}` : ''}`, {
        method: remove ? 'DELETE' : 'POST',
        ...(remove ? {} : { body: { postId } }),
      });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['collection-posts', id] }),
        cache.invalidateQueries({ queryKey: ['collections'] }),
        cache.invalidateQueries({ queryKey: ['preparation-collections'] }),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update collection.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p>
        <Link to={`/collections/${id}`}>Open collection</Link>
      </p>
      <QueryState query={posts}>
        {!items.length && <p>No resources in this collection yet.</p>}
        {items.map((post) => (
          <article className="workspace-question" key={post.id}>
            <h3>
              <Link to={`/posts/${post.id}`}>{post.title}</Link>
            </h3>
            <p className="prep-notes">{post.description}</p>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void change(post.id, true)}
            >
              Remove from collection
            </button>
          </article>
        ))}
        <More query={posts} />
        <button className="btn btn-ghost" onClick={() => setAdding(!adding)}>
          {adding ? 'Close saved posts' : 'Add bookmarked posts'}
        </button>
      </QueryState>
      <SaveError error={error} />
      {adding && (
        <section>
          <h3>Your bookmarked posts</h3>
          <QueryState query={bookmarks}>
            {!bookmarks.data?.pages[0]?.items.length && (
              <p>Bookmark posts from the community to add them here.</p>
            )}
            {bookmarks.data?.pages
              .flatMap((page) => page.items)
              .map((post) => (
                <div className="workspace-resource" key={post.id}>
                  <Link to={`/posts/${post.id}`}>{post.title}</Link>
                  <button
                    className="btn btn-ghost"
                    disabled={busy || items.some((item) => item.id === post.id)}
                    onClick={() => void change(post.id, false)}
                  >
                    {items.some((item) => item.id === post.id)
                      ? 'Added'
                      : 'Add to collection'}
                  </button>
                </div>
              ))}
            <More query={bookmarks} />
          </QueryState>
        </section>
      )}
    </div>
  );
}
