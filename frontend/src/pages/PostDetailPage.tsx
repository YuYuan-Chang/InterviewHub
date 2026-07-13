import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { PostCard } from '../components/PostCard';
import { CommentForm, CommentThread } from '../components/CommentThread';
import { useAuth } from '../auth';
import type { CommentNode, Post } from '../types';

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: () => api<Post>(`/api/posts/${id}`),
    enabled: !!id,
  });
  const commentsQuery = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api<{ items: CommentNode[]; total: number }>(`/api/comments/post/${id}`),
    enabled: !!id,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['comments', id] });
    void queryClient.invalidateQueries({ queryKey: ['post', id] });
  }

  if (postQuery.isLoading) return <p className="page-note">Loading…</p>;
  if (postQuery.isError || !postQuery.data) return <p className="error">Post not found.</p>;

  const total = commentsQuery.data?.total ?? 0;

  return (
    <div>
      <PostCard
        post={postQuery.data}
        onChanged={(p) => queryClient.setQueryData(['post', id], p)}
      />
      <section className="card">
        <h3>
          {total} comment{total === 1 ? '' : 's'}
        </h3>
        {me ? (
          <CommentForm postId={postQuery.data.id} onDone={refresh} />
        ) : (
          <p className="page-note">Log in to join the discussion.</p>
        )}
        {commentsQuery.data && (
          <CommentThread comments={commentsQuery.data.items} postId={postQuery.data.id} onRefresh={refresh} />
        )}
      </section>
    </div>
  );
}
