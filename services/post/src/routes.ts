import { Router } from 'express';
import { z } from 'zod';
import {
  HttpError,
  authedUser,
  clampLimit,
  decodeCursor,
  encodeCursor,
  optionalAuth,
  parseQuery,
  requireAuth,
  s2sClient,
  validateBody,
  param,
} from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';
import { enrichPosts } from './enrich';
import { feedQuerySchema, parseTagList, popularTags, queryFeed } from './feed';

const userService = s2sClient(config.userServiceUrl, config.internalToken);
const fileService = s2sClient(config.fileServiceUrl, config.internalToken);

const createPostSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(5000).optional().default(''),
  tags: z
    .array(z.string().min(1).max(60).transform((t) => t.trim().toLowerCase()))
    .max(8)
    .optional()
    .default([]),
  fileId: z.string().uuid().optional(), // legacy single-file clients
  fileIds: z.array(z.string().uuid()).max(8).optional().default([]),
});

interface FileMeta {
  id: string;
  ownerId: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

type Cursor = { afterId: string };

export const router: Router = Router();

router.post('/api/posts', requireAuth(config.jwtPublicKey), validateBody(createPostSchema), async (req, res) => {
  const user = authedUser(req);
  const { title, description, tags, fileId, fileIds } = req.body;

  const ids = [...new Set<string>([...fileIds, ...(fileId ? [fileId] : [])])];
  if (ids.length > 8) throw new HttpError(400, 'A post can have at most 8 attachments');
  const files = await Promise.all(ids.map((id) => fileService.get<FileMeta>(`/internal/files/${id}`)));
  if (files.some((f) => f.ownerId !== user.id)) {
    throw new HttpError(403, 'You can only attach files you uploaded');
  }

  const post = await prisma.post.create({
    data: {
      authorId: user.id,
      title,
      description,
      tags: [...new Set<string>(tags)],
      attachments: files.map((f) => ({ fileId: f.id, name: f.name, mime: f.mime, sizeBytes: f.sizeBytes })),
    },
  });
  res.status(201).json((await enrichPosts([post], user.id))[0]);
});

async function respondFeed(
  res: Parameters<Parameters<Router['get']>[1]>[1],
  rawQuery: unknown,
  viewerId: string | undefined,
  authorIds?: string[],
) {
  const q = parseQuery(feedQuerySchema, rawQuery);
  const limit = clampLimit(q.limit);
  const cursor = decodeCursor<Cursor>(q.cursor);
  // `tag` (single, from tag links) and `tags` (multi, from the filter bar) combine into one AND-list
  const tagList = [...new Set([...parseTagList(q.tags), ...(q.tag ? [q.tag.toLowerCase()] : [])])];
  const { page, nextAfterId } = await queryFeed({
    sort: q.sort,
    q: q.q,
    tagList,
    authorId: q.authorId,
    authorIds,
    afterId: cursor?.afterId,
    limit,
  });
  res.json({
    items: await enrichPosts(page, viewerId),
    nextCursor: nextAfterId ? encodeCursor({ afterId: nextAfterId }) : null,
  });
}

router.get('/api/posts/feed/explore', optionalAuth(config.jwtPublicKey), async (req, res) => {
  await respondFeed(res, req.query, req.user?.id);
});

router.get('/api/posts/feed/following', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const { ids } = await userService.get<{ ids: string[] }>(`/internal/users/${user.id}/following`);
  if (ids.length === 0) {
    res.json({ items: [], nextCursor: null });
    return;
  }
  await respondFeed(res, req.query, user.id, ids);
});

// registered before /api/posts/:id so "tags" isn't captured as a post id
router.get('/api/posts/tags/popular', async (_req, res) => {
  res.json({ tags: await popularTags() });
});

router.get('/api/posts/:id', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: param(req, 'id') } });
  if (!post) throw new HttpError(404, 'Post not found');
  res.json((await enrichPosts([post], req.user?.id))[0]);
});

router.delete('/api/posts/:id', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const post = await prisma.post.findUnique({ where: { id: param(req, 'id') } });
  if (!post) throw new HttpError(404, 'Post not found');
  if (post.authorId !== user.id) throw new HttpError(403, 'Only the author can delete a post');
  await prisma.post.delete({ where: { id: post.id } });
  res.status(204).end();
});

router.put('/api/posts/:id/upvote', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const postId = param(req, 'id');
  const updated = await prisma.$transaction(async (tx) => {
    const created = await tx.postReaction.createMany({
      data: [{ postId, userId: user.id }],
      skipDuplicates: true,
    });
    if (created.count === 0) return tx.post.findUnique({ where: { id: postId } });
    return tx.post.update({ where: { id: postId }, data: { upvoteCount: { increment: 1 } } });
  }).catch((err: { code?: string }) => {
    // FK violation → the post doesn't exist
    if (err?.code === 'P2003') throw new HttpError(404, 'Post not found');
    throw err;
  });
  if (!updated) throw new HttpError(404, 'Post not found');
  res.json({ upvoteCount: updated.upvoteCount, viewerHasUpvoted: true });
});

router.delete('/api/posts/:id/upvote', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const postId = param(req, 'id');
  const updated = await prisma.$transaction(async (tx) => {
    const deleted = await tx.postReaction.deleteMany({ where: { postId, userId: user.id } });
    if (deleted.count === 0) return tx.post.findUnique({ where: { id: postId } });
    return tx.post.update({ where: { id: postId }, data: { upvoteCount: { decrement: 1 } } });
  });
  if (!updated) throw new HttpError(404, 'Post not found');
  res.json({ upvoteCount: updated.upvoteCount, viewerHasUpvoted: false });
});
