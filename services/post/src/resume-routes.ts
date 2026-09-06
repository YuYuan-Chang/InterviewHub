import { Router } from 'express';
import { z } from 'zod';
import {
  HttpError, authedUser, clampLimit, decodeCursor, encodeCursor,
  param, parseQuery, requireAuth, s2sClient, validateBody,
} from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';
import { logger } from './logger';
import type { AuthorSummary } from './enrich';
import { prepareRevision, revisionSchema } from './resume';

export const resumeRouter: Router = Router();
const userService = s2sClient(config.userServiceUrl, config.internalToken);
const listSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().optional() });
const decisionSchema = z.object({ status: z.enum(['accepted', 'rejected']) });

resumeRouter.get('/api/posts/:id/revisions', async (req, res) => {
  const postId = param(req, 'id');
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { resumeText: true } });
  if (!post) throw new HttpError(404, 'Post not found');
  if (post.resumeText === null) throw new HttpError(400, 'This post has no editable resume');
  const query = parseQuery(listSchema, req.query);
  const cursor = decodeCursor<{ afterId: string }>(query.cursor);
  if (cursor && !z.string().uuid().safeParse(cursor.afterId).success) throw new HttpError(400, 'Invalid cursor');
  const limit = clampLimit(query.limit);
  const rows = await prisma.resumeRevision.findMany({
    where: { postId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    ...(cursor ? { cursor: { id: cursor.afterId }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  const { profiles } = page.length ? await userService.post<{ profiles: AuthorSummary[] }>(
    '/internal/profiles/batch', { ids: [...new Set(page.map((row) => row.authorId))] },
  ).catch((err) => {
    logger.warn({ err }, 'revision author enrichment degraded');
    return { profiles: [] as AuthorSummary[] };
  }) : { profiles: [] };
  const authors = new Map(profiles.map((profile) => [profile.userId, profile]));
  res.json({
    items: page.map((row) => ({ ...row, author: authors.get(row.authorId) ?? null })),
    nextCursor: rows.length > limit ? encodeCursor({ afterId: page[page.length - 1].id }) : null,
  });
});

resumeRouter.post('/api/posts/:id/revisions', requireAuth(config.jwtPublicKey), validateBody(revisionSchema), async (req, res) => {
  const user = authedUser(req);
  const postId = param(req, 'id');
  const { baseVersion, summary } = req.body;
  const revision = await prisma.$transaction(async (tx) => {
    // Serialize suggestions and decisions on the parent, including concurrent accepts.
    await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`;
    const post = await tx.post.findUnique({ where: { id: postId } });
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.resumeText === null) throw new HttpError(400, 'This post has no editable resume');
    if (post.resumeVersion !== baseVersion) throw new HttpError(409, 'The resume changed. Reload it and create a new proposal');
    const content = prepareRevision(post.resumeText, req.body);
    return tx.resumeRevision.create({ data: { postId, authorId: user.id, baseVersion, summary, ...content } });
  });
  res.status(201).json(revision);
});

resumeRouter.patch('/api/posts/:id/revisions/:revisionId', requireAuth(config.jwtPublicKey), validateBody(decisionSchema), async (req, res) => {
  const user = authedUser(req);
  const postId = param(req, 'id');
  const revisionId = param(req, 'revisionId');
  const { status } = req.body;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`;
    const post = await tx.post.findUnique({ where: { id: postId } });
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.authorId !== user.id) throw new HttpError(403, 'Only the resume author can accept or reject revisions');
    const revision = await tx.resumeRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.postId !== postId) throw new HttpError(404, 'Revision not found');
    if (revision.status !== 'pending') throw new HttpError(409, 'This revision has already been reviewed');
    if (status === 'accepted') {
      if (revision.baseVersion !== post.resumeVersion) throw new HttpError(409, 'This proposal is for an older resume. Ask for a new proposal');
      await tx.post.update({ where: { id: postId }, data: {
        resumeText: revision.proposedText, resumeVersion: { increment: 1 },
      } });
    }
    return tx.resumeRevision.update({ where: { id: revisionId }, data: { status, resolvedAt: new Date() } });
  });
  res.json(result);
});
