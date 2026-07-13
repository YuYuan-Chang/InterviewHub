import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { timeAgo } from '../components/PostCard';
import type { AppNotification } from '../types';

const LABELS: Record<AppNotification['type'], string> = {
  new_follower: 'started following you',
  new_comment: 'commented on your post',
  new_reply: 'replied to your comment',
};

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api<{ items: AppNotification[]; unreadCount: number }>('/api/notifications?limit=50'),
  });

  async function markAllRead() {
    await api('/api/notifications/read-all', { method: 'POST', body: {} });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function markRead(n: AppNotification) {
    if (n.read) return;
    await api(`/api/notifications/${n.id}/read`, { method: 'POST', body: {} });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <div>
      <div className="feed-toolbar">
        <h2>Notifications</h2>
        {(data?.unreadCount ?? 0) > 0 && (
          <button className="btn btn-ghost" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>
      {isLoading && <p className="page-note">Loading…</p>}
      {data?.items.length === 0 && <p className="page-note">No notifications yet.</p>}
      {data?.items.map((n) => (
        <div key={n.id} className={`card notification ${n.read ? '' : 'unread'}`} onClick={() => markRead(n)}>
          <p>
            {n.actor ? <Link to={`/u/${n.actor.username}`}>@{n.actor.username}</Link> : 'Someone'}{' '}
            {LABELS[n.type]}
            {n.postId && (
              <>
                {' — '}
                <Link to={`/posts/${n.postId}`}>view post</Link>
              </>
            )}
          </p>
          <span className="post-meta">{timeAgo(n.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
