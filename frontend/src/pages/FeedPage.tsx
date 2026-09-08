import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { PostCard } from '../components/PostCard';
import { FilterBar } from '../components/FilterBar';
import { Feedback, FeedLoading } from '../components/Feedback';
import type { Page, Post } from '../types';

export function FeedPage({ mode }: { mode: 'explore' | 'following' }) {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') === 'popular' ? 'popular' : 'recent';
  const tags = params.get('tags') ?? '';

  const query = useInfiniteQuery({
    queryKey: ['feed', mode, sort, tags, me?.userId],
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
    <div className="discovery-layout">
      <div className="feed">
        <section className="feed-intro">
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>{mode === 'following' ? 'Your prep circle.' : 'Prepare better. Together.'}</h1>
          <p>{mode === 'following'
            ? 'The latest notes, resources, and ideas from people you follow.'
            : 'Discover interview notes, share what you know, and learn from people on the same journey.'}</p>
          <Link className="btn btn-primary" to={me ? '/posts/new' : '/register'}>
            {me ? '＋ Share a resource' : 'Join the community'}
          </Link>
          <span className="intro-caption">A little shared knowledge goes a long way.</span>
        </section>
        <div className="feed-heading"><h2>{mode === 'following' ? 'From your community' : 'Community resources'}</h2><span>Learn. Share. Grow.</span></div>
        <nav className="feed-tabs" aria-label="Resource feeds">
          <NavLink to={{ pathname: '/', search: params.toString() }} end>
            Explore
          </NavLink>
          <NavLink to={{ pathname: me ? '/following' : '/login', search: me ? params.toString() : '' }}>
            Following
          </NavLink>
        </nav>
        <FilterBar />

        {query.isLoading && <FeedLoading />}
        {query.isError && (
          <Feedback title="We couldn’t load these resources" error>
            <p>Please try again in a moment. Your filters are saved.</p>
            <button className="btn btn-ghost" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? 'Trying again…' : 'Try again'}
            </button>
          </Feedback>
        )}
        {query.isSuccess && posts.length === 0 && (
          <Feedback title={tags ? 'No resources match these topics' : mode === 'following' ? 'Build your prep circle' : 'Be the first to share'}>
            <p>{tags ? 'Try fewer topics to discover more resources.' : mode === 'following'
              ? 'Explore resources and follow their authors to see new posts here.'
              : 'Your notes or interview experience could help someone take their next step.'}</p>
            {tags ? <button className="btn btn-ghost" onClick={() => {
              params.delete('tags');
              setParams(params, { replace: true });
            }}>Clear filters</button> : <Link className="btn btn-primary" to={mode === 'following' ? '/' : me ? '/posts/new' : '/register'}>
              {mode === 'following' ? 'Explore resources' : 'Share a resource'}
            </Link>}
          </Feedback>
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
      <aside className="discovery-sidebar" aria-label="Community guide">
        <section className="card guide-card">
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h2>A place to get ready.</h2>
          <p>Big goals feel a little closer when you prepare with others.</p>
          <ol className="guide-steps">
            <li><div><strong>Find your focus</strong><p>Filter by topic or search for a role, company, or interview question.</p></div></li>
            <li><div><strong>Learn from your peers</strong><p>Explore real experiences and join the conversation.</p></div></li>
            <li><div><strong>Pass it forward</strong><p>Share notes, useful resources, or a lesson you learned.</p></div></li>
          </ol>
        </section>
        <section className="sidebar-note">
          <span aria-hidden="true">✦</span>
          <h3>Your experience matters</h3>
          <p>You don’t need to have it all figured out to help someone else.</p>
          <Link to={me ? '/posts/new' : '/register'}>Share what you’ve learned <span aria-hidden="true">→</span></Link>
        </section>
        <p className="sidebar-footer">InterviewHub · Built for your next step.</p>
      </aside>
    </div>
  );
}
