import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
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
        <Avatar username={person.username} displayName={person.displayName} />
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
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tab = params.get('tab') === 'people' ? 'people' : 'posts';

  const postsQuery = useQuery({
    queryKey: ['search-posts', q],
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

  if (!q) return <p className="page-note">Type something in the search bar above.</p>;

  return (
    <div className="feed">
      <h2 className="search-title">Results for “{q}”</h2>
      <nav className="feed-tabs">
        <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
          Posts
        </button>
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          People
        </button>
      </nav>

      {tab === 'posts' && (
        <>
          {postsQuery.isLoading && <p className="page-note">Searching…</p>}
          {postsQuery.data?.items.length === 0 && <p className="page-note">No posts match “{q}”.</p>}
          {postsQuery.data?.items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </>
      )}
      {tab === 'people' && (
        <>
          {peopleQuery.isLoading && <p className="page-note">Searching…</p>}
          {peopleQuery.data?.items.length === 0 && <p className="page-note">No students match “{q}”.</p>}
          {peopleQuery.data?.items.map((person) => (
            <PersonRow key={person.userId} person={person} />
          ))}
        </>
      )}
    </div>
  );
}
