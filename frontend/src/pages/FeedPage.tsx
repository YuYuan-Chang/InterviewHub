import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { PostCard } from '../components/PostCard';
import { FilterBar } from '../components/FilterBar';
import type { Page, Post } from '../types';

export function FeedPage({ mode }: { mode: 'explore' | 'following' }) {
  const { me } = useAuth();
  const [params] = useSearchParams();
  const sort = params.get('sort') === 'popular' ? 'popular' : 'recent';
  const tags = params.get('tags') ?? '';

  const query = useInfiniteQuery({
    queryKey: ['feed', mode, sort, tags],
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ sort });
      if (tags) qs.set('tags', tags);
      if (pageParam) qs.set('cursor', pageParam);
      return api<Page<Post>>(`/api/posts/feed/${mode}?${qs}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="feed">
      <nav className="feed-tabs">
        <NavLink to={{ pathname: '/', search: params.toString() }} end>
          Explore
        </NavLink>
        <NavLink to={{ pathname: me ? '/following' : '/login', search: me ? params.toString() : '' }}>
          Following
        </NavLink>
      </nav>
      <FilterBar />

      {query.isLoading && <p className="page-note">Loading feed…</p>}
      {query.isError && <p className="error">Could not load the feed. Are the services up?</p>}
      {!query.isLoading && posts.length === 0 && (
        <p className="page-note empty-feed">
          {mode === 'following' ? (
            'Nothing here yet — follow some students to fill this feed.'
          ) : (
            <>
              No posts match. <Link to="/posts/new">Share something</Link> or clear the filters.
            </>
          )}
        </p>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {query.hasNextPage && (
        <button
          className="btn btn-ghost load-more"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}
