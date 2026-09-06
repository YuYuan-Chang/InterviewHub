import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { timeAgo } from '../format';
import { Avatar } from './Avatar';
import { AttachmentGrid } from './AttachmentGrid';
import { InterviewDetails } from './InterviewDetails';
import type { Post } from '../types';

export { timeAgo }; // re-export: several pages import it from here

export function PostCard({ post, onChanged, expanded = false }: { post: Post; onChanged?: (p: Post) => void; expanded?: boolean }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggleUpvote() {
    if (!me) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api<{ upvoteCount: number; viewerHasUpvoted: boolean }>(
        `/api/posts/${post.id}/upvote`,
        { method: post.viewerHasUpvoted ? 'DELETE' : 'PUT' },
      );
      onChanged?.({ ...post, ...res });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['search-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['post', post.id] }),
      ]);
    } catch {
      setError('Your upvote couldn’t be updated. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setError('');
    try {
      await navigator.clipboard.writeText(`${location.origin}/posts/${post.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Couldn’t copy the link. Open the post and copy its address from your browser.');
    }
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
        {post.interviewExperience && <InterviewDetails experience={post.interviewExperience} expanded={expanded} />}
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
            aria-label={post.viewerHasUpvoted ? 'Remove upvote' : 'Upvote'}
            aria-pressed={post.viewerHasUpvoted}
            disabled={busy}
          >
            ▲ <span>{post.upvoteCount} <span className="action-label">Helpful</span></span>
          </button>
          <Link to={`/posts/${post.id}`} className="action" title="Comments">
            <span>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</span>
          </Link>
          <button className="action" onClick={copyLink} title="Copy link" aria-live="polite">
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </article>
  );
}
