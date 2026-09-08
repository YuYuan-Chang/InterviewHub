import { Router } from 'express';
import { z } from 'zod';
import {
  authedUser, clampLimit, decodeCursor, encodeCursor, HttpError, param, parseQuery,
  requireAuth, validateBody,
} from '@interviewhub/shared';
import { Prisma } from '../generated/prisma';
import { config } from './config';
import { prisma } from './db';
import { enrichPosts } from './enrich';

export const collectionSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const saveSchema = z.object({
  notes: z.string().max(5000).optional(),
  reviewed: z.boolean().optional(),
  collectionIds: z.array(z.string().uuid()).max(100).transform((ids) => [...new Set(ids)]).optional(),
});
export const savedQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
  reviewed: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const cursorSchema = z.object({ savedAt: z.string().datetime(), postId: z.string().uuid() });

export function savedCursorWhere(raw: string | undefined): Prisma.SavedResourceWhereInput {
  if (!raw) return {};
  const result = cursorSchema.safeParse(decodeCursor<unknown>(raw));
  if (!result.success) throw new HttpError(400, 'Malformed cursor');
  const { savedAt, postId } = result.data;
  return {
    OR: [
      { savedAt: { lt: new Date(savedAt) } },
      { savedAt: new Date(savedAt), postId: { lt: postId } },
    ],
  };
}

const savedInclude = { post: true, memberships: { select: { collectionId: true } } } as const;
type SavedRow = Prisma.SavedResourceGetPayload<{ include: typeof savedInclude }>;
type CollectionRow = Prisma.SavedCollectionGetPayload<{ include: { _count: { select: { resources: true } } } }>;
const collectionInclude = { _count: { select: { resources: true } } } as const;

function collectionResponse(row: CollectionRow) {
  return {
    id: row.id, name: row.name, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(), resourceCount: row._count.resources,
  };
}

async function savedResponses(rows: SavedRow[], userId: string) {
  const posts = await enrichPosts(rows.map((row) => row.post), userId);
  return rows.map((row, index) => ({
    post: posts[index], savedAt: row.savedAt.toISOString(), notes: row.notes,
    reviewed: row.reviewed, collectionIds: row.memberships.map((m) => m.collectionId).sort(),
  }));
}

async function ownedCollection(id: string, userId: string) {
  const collection = await prisma.savedCollection.findUnique({ where: { id_userId: { id, userId } } });
  if (!collection) throw new HttpError(404, 'Collection not found');
  return collection;
}

function databaseError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new HttpError(409, 'A collection with this name already exists');
    if (err.code === 'P2003' || err.code === 'P2025') throw new HttpError(404, 'Resource or collection not found');
  }
  throw err;
}

export const savedRouter: Router = Router();
const auth = requireAuth(config.jwtPublicKey);

savedRouter.get('/api/posts/collections', auth, async (req, res) => {
  const rows = await prisma.savedCollection.findMany({
    where: { userId: authedUser(req).id }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
    include: collectionInclude,
  });
  res.json({ items: rows.map(collectionResponse) });
});

savedRouter.post('/api/posts/collections', auth, validateBody(collectionSchema), async (req, res) => {
  try {
    const row = await prisma.savedCollection.create({
      data: { userId: authedUser(req).id, name: req.body.name }, include: collectionInclude,
    });
    res.status(201).json(collectionResponse(row));
  } catch (err) { databaseError(err); }
});

savedRouter.patch('/api/posts/collections/:id', auth, validateBody(collectionSchema), async (req, res) => {
  try {
    const row = await prisma.savedCollection.update({
      where: { id_userId: { id: param(req, 'id'), userId: authedUser(req).id } },
      data: { name: req.body.name }, include: collectionInclude,
    });
    res.json(collectionResponse(row));
  } catch (err) { databaseError(err); }
});

savedRouter.delete('/api/posts/collections/:id', auth, async (req, res) => {
  try {
    await prisma.savedCollection.delete({
      where: { id_userId: { id: param(req, 'id'), userId: authedUser(req).id } },
    });
    res.status(204).end();
  } catch (err) { databaseError(err); }
});

savedRouter.get('/api/posts/saved', auth, async (req, res) => {
  const userId = authedUser(req).id;
  const query = parseQuery(savedQuerySchema, req.query);
  const cursorWhere = savedCursorWhere(query.cursor);
  if (query.collectionId) await ownedCollection(query.collectionId, userId);
  const limit = clampLimit(query.limit);
  const rows = await prisma.savedResource.findMany({
    where: {
      userId, ...cursorWhere,
      ...(query.reviewed !== undefined ? { reviewed: query.reviewed } : {}),
      ...(query.collectionId ? { memberships: { some: { collectionId: query.collectionId } } } : {}),
    },
    orderBy: [{ savedAt: 'desc' }, { postId: 'desc' }], take: limit + 1, include: savedInclude,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  res.json({
    items: await savedResponses(page, userId),
    nextCursor: rows.length > limit && last
      ? encodeCursor({ savedAt: last.savedAt.toISOString(), postId: last.postId }) : null,
  });
});

savedRouter.get('/api/posts/:id/save', auth, async (req, res) => {
  const userId = authedUser(req).id;
  const row = await prisma.savedResource.findUnique({
    where: { userId_postId: { userId, postId: param(req, 'id') } }, include: savedInclude,
  });
  if (!row) throw new HttpError(404, 'Saved resource not found');
  res.json((await savedResponses([row], userId))[0]);
});

savedRouter.put('/api/posts/:id/save', auth, validateBody(saveSchema), async (req, res) => {
  const userId = authedUser(req).id;
  const postId = param(req, 'id');
  const input = req.body as z.output<typeof saveSchema>;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) throw new HttpError(404, 'Post not found');
      if (input.collectionIds?.length) {
        const count = await tx.savedCollection.count({ where: { userId, id: { in: input.collectionIds } } });
        if (count !== input.collectionIds.length) throw new HttpError(404, 'Collection not found');
      }
      // Even an unchanged save writes postId, taking the row lock before replacing
      // memberships. Concurrent edits cannot interleave their delete/insert steps.
      await tx.savedResource.upsert({
        where: { userId_postId: { userId, postId } },
        create: { userId, postId, notes: input.notes, reviewed: input.reviewed },
        update: { postId, notes: input.notes, reviewed: input.reviewed },
      });
      if (input.collectionIds !== undefined) {
        await tx.savedCollectionMembership.deleteMany({ where: { userId, postId } });
        if (input.collectionIds.length) {
          await tx.savedCollectionMembership.createMany({
            data: input.collectionIds.map((collectionId) => ({ collectionId, userId, postId })),
          });
        }
      }
      return tx.savedResource.findUniqueOrThrow({ where: { userId_postId: { userId, postId } }, include: savedInclude });
    });
    res.json((await savedResponses([row], userId))[0]);
  } catch (err) { databaseError(err); }
});

savedRouter.delete('/api/posts/:id/save', auth, async (req, res) => {
  await prisma.savedResource.deleteMany({ where: { userId: authedUser(req).id, postId: param(req, 'id') } });
  res.status(204).end();
});
