import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { Feedback, FeedLoading } from '../components/Feedback';
import type { Page, Post, Profile } from '../types';

function PersonRow({ person }: { person: Profile }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState({ isFollowing: person.isFollowing, followerCount: person.followerCount });

  async function toggleFollow() {
    if (!me) {
      navigate('/login');
      return;
    }
    const res = await api<{ followerCount: number }>(`/api/users/${person.userId}/follow`, {
      method: state.isFollowing ? 'DELETE' : 'POST',
    });
    setState({ isFollowing: !state.isFollowing, followerCount: res.followerCount });
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }

  const isSelf = me?.userId === person.userId;
  return (
    <div className="person-row">
      <Link to={`/u/${person.username}`} className="post-avatar">
        <Avatar username={person.username} displayName={person.displayName} fileId={person.avatarFileId} />
      </Link>
      <div className="person-info">
        <Link to={`/u/${person.username}`} className="post-author">
          {person.displayName}
        </Link>
        <span className="post-meta-inline">
          @{person.username}
          {person.school ? ` · ${person.school}` : ''} · {state.followerCount} follower
          {state.followerCount === 1 ? '' : 's'}
        </span>
        {person.targetRoles.length > 0 && (
          <span className="tags">
            {person.targetRoles.map((r) => (
              <span key={r} className="tag">
                {r}
              </span>
            ))}
          </span>
        )}
      </div>
      {!isSelf && (
        <button className={`btn ${state.isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow}>
          {state.isFollowing ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  );
}

export function SearchPage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tab = params.get('tab') === 'people' ? 'people' : 'posts';

  const postsQuery = useQuery({
    queryKey: ['search-posts', q, me?.userId],
    queryFn: () => api<Page<Post>>(`/api/posts/feed/explore?q=${encodeURIComponent(q)}&limit=30`),
    enabled: !!q && tab === 'posts',
  });
  const peopleQuery = useQuery({
    queryKey: ['search-people', q],
    queryFn: () => api<{ items: Profile[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
    enabled: !!q && tab === 'people',
  });

  function setTab(next: 'posts' | 'people') {
    params.set('tab', next);
    setParams(params, { replace: true });
  }

  const activeQuery = tab === 'posts' ? postsQuery : peopleQuery;

  if (!q) return <Feedback title="Find your next resource"><p>Use the search bar to look for topics, companies, or people.</p><Link className="btn btn-ghost" to="/">Explore resources</Link></Feedback>;

  return (
    <div className="feed">
      <span className="eyebrow">SEARCH THE COMMUNITY</span>
      <h1 className="search-title">Results for “{q}”</h1>
      <nav className="feed-tabs search-tabs" aria-label="Result type">
        <button aria-pressed={tab === 'posts'} className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
          Posts
        </button>
        <button aria-pressed={tab === 'people'} className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          People
        </button>
      </nav>
      {activeQuery.isLoading && <FeedLoading />}
      {activeQuery.isError && <Feedback title="Search couldn’t finish" error><p>Please try again in a moment.</p><button className="btn btn-ghost" disabled={activeQuery.isFetching} onClick={() => void activeQuery.refetch()}>{activeQuery.isFetching ? 'Trying again…' : 'Try again'}</button></Feedback>}
      {activeQuery.isSuccess && activeQuery.data?.items.length === 0 && <Feedback title={`No ${tab} found`}><p>Try a broader topic, a different name, or check your spelling.</p><Link className="btn btn-ghost" to="/">Explore resources</Link></Feedback>}

      {tab === 'posts' && (
        <>
          {postsQuery.data?.items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </>
      )}
      {tab === 'people' && (
        <>
          {peopleQuery.data?.items.map((person) => (
            <PersonRow key={person.userId} person={person} />
          ))}
        </>
      )}
    </div>
  );
}
