import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { PostCard } from '../components/PostCard';
import type { AuthorSummary, Page, Post, Profile } from '../types';

type ListKind = 'followers' | 'following' | null;

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openList, setOpenList] = useState<ListKind>(null);

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api<Profile>(`/api/users/by-username/${username}`),
    enabled: !!username,
  });
  const profile = profileQuery.data;

  const postsQuery = useQuery({
    queryKey: ['profile-posts', profile?.userId],
    queryFn: () => api<Page<Post>>(`/api/posts/feed/explore?authorId=${profile!.userId}&limit=50`),
    enabled: !!profile,
  });

  const listQuery = useQuery({
    queryKey: ['profile-list', profile?.userId, openList],
    queryFn: () => api<{ items: AuthorSummary[] }>(`/api/users/${profile!.userId}/${openList}`),
    enabled: !!profile && !!openList,
  });

  if (profileQuery.isLoading) return <p className="page-note">Loading…</p>;
  if (!profile) return <p className="error">User not found.</p>;

  const isSelf = me?.userId === profile.userId;

  async function toggleFollow() {
    if (!me) {
      navigate('/login');
      return;
    }
    await api(`/api/users/${profile!.userId}/follow`, {
      method: profile!.isFollowing ? 'DELETE' : 'POST',
    });
    void queryClient.invalidateQueries({ queryKey: ['profile', username] });
  }

  return (
    <div>
      <section className="card profile-header">
        <div>
          <h2>{profile.displayName}</h2>
          <p className="post-meta">@{profile.username}{profile.school ? ` · ${profile.school}` : ''}</p>
          {profile.targetRoles.length > 0 && (
            <p className="tags">
              {profile.targetRoles.map((r) => (
                <span key={r} className="tag">
                  {r}
                </span>
              ))}
            </p>
          )}
          {profile.bio && <p>{profile.bio}</p>}
          <p className="follow-counts">
            <button className="btn-link" onClick={() => setOpenList(openList === 'followers' ? null : 'followers')}>
              <strong>{profile.followerCount}</strong> followers
            </button>
            <button className="btn-link" onClick={() => setOpenList(openList === 'following' ? null : 'following')}>
              <strong>{profile.followingCount}</strong> following
            </button>
          </p>
        </div>
        {!isSelf && (
          <button className={`btn ${profile.isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow}>
            {profile.isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        )}
      </section>

      {openList && (
        <section className="card">
          <h3>{openList === 'followers' ? 'Followers' : 'Following'}</h3>
          {listQuery.data?.items.length === 0 && <p className="page-note">Nobody here yet.</p>}
          {listQuery.data?.items.map((u) => (
            <p key={u.userId}>
              <Link to={`/u/${u.username}`}>@{u.username}</Link> — {u.displayName}
              {u.school ? ` (${u.school})` : ''}
            </p>
          ))}
        </section>
      )}

      <h3 className="section-title">Shared materials</h3>
      {postsQuery.data?.items.length === 0 && <p className="page-note">No posts yet.</p>}
      {postsQuery.data?.items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
