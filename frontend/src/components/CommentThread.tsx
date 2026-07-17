import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';
import { timeAgo } from './PostCard';
import type { CommentNode } from '../types';

function CommentItem({
  comment,
  postId,
  onRefresh,
}: {
  comment: CommentNode;
  postId: string;
  onRefresh: () => void;
}) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [replying, setReplying] = useState(false);
  const [voted, setVoted] = useState(comment.viewerHasUpvoted);
  const [count, setCount] = useState(comment.upvoteCount);

  async function toggleUpvote() {
    if (!me) {
      navigate('/login');
      return;
    }
    const res = await api<{ upvoteCount: number; viewerHasUpvoted: boolean }>(
      `/api/comments/${comment.id}/upvote`,
      { method: voted ? 'DELETE' : 'PUT' },
    );
    setVoted(res.viewerHasUpvoted);
    setCount(res.upvoteCount);
  }

  const username = comment.author?.username;

  return (
    <div className="comment">
      <div className="comment-rail">
        {username ? (
          <Link to={`/u/${username}`}>
            <Avatar username={username} displayName={comment.author?.displayName} fileId={comment.author?.avatarFileId} size="sm" />
          </Link>
        ) : (
          <Avatar username="?" size="sm" />
        )}
        {comment.replies.length > 0 && <span className="thread-line" aria-hidden />}
      </div>
      <div className="comment-main">
        <p className="post-header">
          {comment.author ? (
            <>
              <Link to={`/u/${username}`} className="post-author">
                {comment.author.displayName}
              </Link>
              <span className="post-meta-inline">
                @{username} · {timeAgo(comment.createdAt)}
              </span>
            </>
          ) : (
            <span className="post-meta-inline">unknown · {timeAgo(comment.createdAt)}</span>
          )}
        </p>
        <p className="comment-body">{comment.body}</p>
        <div className="action-bar">
          <button className={`action ${voted ? 'action-active' : ''}`} onClick={toggleUpvote}>
            ▲ <span>{count}</span>
          </button>
          {me && (
            <button className="action" onClick={() => setReplying(!replying)}>
              {replying ? 'Cancel' : 'Reply'}
            </button>
          )}
        </div>
        {replying && (
          <CommentForm
            postId={postId}
            parentId={comment.id}
            onDone={() => {
              setReplying(false);
              onRefresh();
            }}
          />
        )}
        {comment.replies.length > 0 && (
          <div className="replies">
            {comment.replies.map((r) => (
              <CommentItem key={r.id} comment={r} postId={postId} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentForm({
  postId,
  parentId,
  onDone,
}: {
  postId: string;
  parentId?: string;
  onDone: () => void;
}) {
  const { me } = useAuth();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/comments/post/${postId}`, { body: { body, parentId } });
      setBody('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to comment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="comment-form">
      {me && !parentId && <Avatar username={me.username} displayName={me.displayName} fileId={me.avatarFileId} size="sm" />}
      <div className="comment-form-main">
        <textarea
          rows={parentId ? 2 : 3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={parentId ? 'Write a reply…' : 'Ask a question or leave feedback…'}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !body.trim()}>
          {parentId ? 'Reply' : 'Comment'}
        </button>
      </div>
    </form>
  );
}

export function CommentThread({
  comments,
  postId,
  onRefresh,
}: {
  comments: CommentNode[];
  postId: string;
  onRefresh: () => void;
}) {
  return (
    <div className="comment-thread">
      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} postId={postId} onRefresh={onRefresh} />
      ))}
    </div>
  );
}
