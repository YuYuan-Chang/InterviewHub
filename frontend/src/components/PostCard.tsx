import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { timeAgo } from '../format';
import { Avatar } from './Avatar';
import { AttachmentGrid } from './AttachmentGrid';
import type { Post } from '../types';

export { timeAgo }; // re-export: several pages import it from here

export function PostCard({ post, onChanged }: { post: Post; onChanged?: (p: Post) => void }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  async function toggleUpvote() {
    if (!me) {
      navigate('/login');
      return;
    }
    const res = await api<{ upvoteCount: number; viewerHasUpvoted: boolean }>(
      `/api/posts/${post.id}/upvote`,
      { method: post.viewerHasUpvoted ? 'DELETE' : 'PUT' },
    );
    onChanged?.({ ...post, ...res });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}/posts/${post.id}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const username = post.author?.username;

  return (
    <article className="post">
      {username ? (
        <Link to={`/u/${username}`} className="post-avatar">
          <Avatar username={username} displayName={post.author?.displayName} fileId={post.author?.avatarFileId} />
        </Link>
      ) : (
        <span className="post-avatar">
          <Avatar username="?" />
        </span>
      )}
      <div className="post-main">
        <p className="post-header">
          {post.author ? (
            <>
              <Link to={`/u/${username}`} className="post-author">
                {post.author.displayName}
              </Link>
              <span className="post-meta-inline">
                @{username}
                {post.author.school ? ` · ${post.author.school}` : ''} · {timeAgo(post.createdAt)}
              </span>
            </>
          ) : (
            <span className="post-meta-inline">unknown · {timeAgo(post.createdAt)}</span>
          )}
        </p>
        <h3 className="post-title">
          <Link to={`/posts/${post.id}`}>{post.title}</Link>
        </h3>
        {post.description && <p className="post-desc">{post.description}</p>}
        <AttachmentGrid attachments={post.attachments ?? []} />
        {post.tags.length > 0 && (
          <p className="tags">
            {post.tags.map((t) => (
              <Link key={t} to={`/?tags=${encodeURIComponent(t)}`} className="tag">
                {t}
              </Link>
            ))}
          </p>
        )}
        <div className="action-bar">
          <button
            className={`action ${post.viewerHasUpvoted ? 'action-active' : ''}`}
            onClick={toggleUpvote}
            title={post.viewerHasUpvoted ? 'Remove upvote' : 'Upvote'}
          >
            ▲ <span>{post.upvoteCount}</span>
          </button>
          <Link to={`/posts/${post.id}`} className="action" title="Comments">
            💬 <span>{post.commentCount}</span>
          </Link>
          <button className="action" onClick={copyLink} title="Copy link">
            {copied ? '✓ copied' : '🔗'}
          </button>
        </div>
      </div>
    </article>
  );
}
