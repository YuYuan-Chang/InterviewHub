import { Router } from 'express';
import { z } from 'zod';
import {
  HttpError,
  authedUser,
  fireAndForget,
  optionalAuth,
  requireAuth,
  s2sClient,
  validateBody,
  param,
} from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';
import { buildTree } from './tree';
import { logger } from './logger';
import { notifications } from './events';

const postService = s2sClient(config.postServiceUrl, config.internalToken);
const userService = s2sClient(config.userServiceUrl, config.internalToken);

const createSchema = z.object({
  body: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
});

interface AuthorSummary {
  userId: string;
  username: string;
  displayName: string;
  avatarFileId: string | null;
}

export const router: Router = Router();

router.post(
  '/api/comments/post/:postId',
  requireAuth(config.jwtPublicKey),
  validateBody(createSchema),
  async (req, res) => {
    const user = authedUser(req);
    const postId = param(req, 'postId');
    const { body, parentId } = req.body;

    // The post must exist; we also need its author for the notification.
    const post = await postService.get<{ id: string; authorId: string; title: string }>(
      `/internal/posts/${postId}`,
    );

    let parent: { id: string; postId: string; authorId: string } | null = null;
    if (parentId) {
      parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, authorId: true },
      });
      if (!parent || parent.postId !== postId) {
        throw new HttpError(400, 'Parent comment does not belong to this post');
      }
    }

    const comment = await prisma.comment.create({
      data: { postId, authorId: user.id, parentId: parentId ?? null, body },
    });

    fireAndForget(
      postService.post(`/internal/posts/${postId}/comment-count`, { delta: 1 }),
      'bump comment count',
      logger,
    );
    // Replies notify the parent-comment author; top-level comments notify the
    // post author. Published to Kafka: durable if notification-service is down,
    // fail-open if the broker is down (publish never throws).
    const recipientId = parent ? parent.authorId : post.authorId;
    const type = parent ? ('new_reply' as const) : ('new_comment' as const);
    void notifications.publish({
      type,
      recipientId,
      actorId: user.id,
      postId,
      commentId: comment.id,
    });

    res.status(201).json({ ...comment, viewerHasUpvoted: false, replies: [] });
  },
);

router.get('/api/comments/post/:postId', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const postId = param(req, 'postId');
  const comments = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const [profilesRes, reactions] = await Promise.all([
    authorIds.length
      ? userService
          .post<{ profiles: AuthorSummary[] }>('/internal/profiles/batch', { ids: authorIds })
          .catch(() => ({ profiles: [] as AuthorSummary[] }))
      : Promise.resolve({ profiles: [] as AuthorSummary[] }),
    req.user
      ? prisma.commentReaction.findMany({
          where: { userId: req.user.id, commentId: { in: comments.map((c) => c.id) } },
          select: { commentId: true },
        })
      : Promise.resolve([]),
  ]);
  const authorsById = new Map(profilesRes.profiles.map((p) => [p.userId, p]));
  const upvoted = new Set(reactions.map((r) => r.commentId));

  const flat = comments.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    author: authorsById.get(c.authorId) ?? null,
    viewerHasUpvoted: upvoted.has(c.id),
  }));
  res.json({ items: buildTree(flat), total: comments.length });
});

router.put('/api/comments/:id/upvote', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const commentId = param(req, 'id');
  const updated = await prisma.$transaction(async (tx) => {
    const created = await tx.commentReaction.createMany({
      data: [{ commentId, userId: user.id }],
      skipDuplicates: true,
    });
    if (created.count === 0) return tx.comment.findUnique({ where: { id: commentId } });
    return tx.comment.update({ where: { id: commentId }, data: { upvoteCount: { increment: 1 } } });
  }).catch((err: { code?: string }) => {
    if (err?.code === 'P2003') throw new HttpError(404, 'Comment not found');
    throw err;
  });
  if (!updated) throw new HttpError(404, 'Comment not found');
  res.json({ upvoteCount: updated.upvoteCount, viewerHasUpvoted: true });
});

router.delete('/api/comments/:id/upvote', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const commentId = param(req, 'id');
  const updated = await prisma.$transaction(async (tx) => {
    const deleted = await tx.commentReaction.deleteMany({ where: { commentId, userId: user.id } });
    if (deleted.count === 0) return tx.comment.findUnique({ where: { id: commentId } });
    return tx.comment.update({ where: { id: commentId }, data: { upvoteCount: { decrement: 1 } } });
  });
  if (!updated) throw new HttpError(404, 'Comment not found');
  res.json({ upvoteCount: updated.upvoteCount, viewerHasUpvoted: false });
});
