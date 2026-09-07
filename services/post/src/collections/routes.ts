import { Router } from 'express';
import {
  HttpError,
  authedUser,
  clampLimit,
  encodeCursor,
  optionalAuth,
  param,
  parseQuery,
  requireAuth,
  validateBody,
} from '@interviewhub/shared';
import { config } from '../config';
import { enrichPosts } from '../enrich';
import type { Collection } from '../../generated/prisma';
import * as collections from './service';
import {
  addItemSchema,
  collectionsQuerySchema,
  createCollectionSchema,
  listQuerySchema,
  parseItemCursor,
  updateCollectionSchema,
} from './schemas';

export const collectionsRouter: Router = Router();

interface CollectionDto {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  isPrivate: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  containsPost?: boolean;
}

function toDto(c: Collection, containsPost?: boolean): CollectionDto {
  return {
    id: c.id,
    ownerId: c.ownerId,
    name: c.name,
    description: c.description,
    isPrivate: c.isPrivate,
    itemCount: c.itemCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    ...(containsPost === undefined ? {} : { containsPost }),
  };
}

/** Turns a page of saved post ids into an enriched, cursored feed response. */
async function respondWithPosts(page: collections.IdPage, viewerId: string | undefined) {
  const posts = await collections.postsInOrder(page.postIds);
  return {
    items: await enrichPosts(posts, viewerId),
    nextCursor: page.nextAfterPostId ? encodeCursor({ afterPostId: page.nextAfterPostId }) : null,
  };
}

// ---- saved posts ----------------------------------------------------------

collectionsRouter.get('/api/bookmarks', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const query = parseQuery(listQuerySchema, req.query);
  const page = await collections.savedPage(user.id, clampLimit(query.limit), parseItemCursor(query.cursor));
  res.json(await respondWithPosts(page, user.id));
});

collectionsRouter.put('/api/posts/:id/bookmark', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const created = await collections.bookmark(user.id, param(req, 'id'));
  res.status(created ? 201 : 200).json({ viewerHasBookmarked: true });
});

collectionsRouter.delete('/api/posts/:id/bookmark', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  await collections.unbookmark(user.id, param(req, 'id'));
  res.json({ viewerHasBookmarked: false });
});

// ---- collections ----------------------------------------------------------

collectionsRouter.get('/api/collections', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const query = parseQuery(collectionsQuerySchema, req.query);
  const viewerId = req.user?.id;
  const ownerId = query.userId ?? viewerId;
  if (!ownerId) throw new HttpError(401, 'Authentication required');

  const isSelf = ownerId === viewerId;
  const items = await collections.listCollections(ownerId, isSelf);
  // the "Save to…" picker asks for the viewer's own collections plus a post id
  if (query.postId && isSelf) {
    const holding = await collections.collectionIdsHolding(
      items.map((c) => c.id),
      query.postId,
    );
    res.json({ items: items.map((c) => toDto(c, holding.has(c.id))) });
    return;
  }
  res.json({ items: items.map((c) => toDto(c)) });
});

collectionsRouter.post(
  '/api/collections',
  requireAuth(config.jwtPublicKey),
  validateBody(createCollectionSchema),
  async (req, res) => {
    const user = authedUser(req);
    const created = await collections.createCollection(user.id, req.body);
    res.status(201).json(toDto(created));
  },
);

collectionsRouter.get('/api/collections/:id', optionalAuth(config.jwtPublicKey), async (req, res) => {
  res.json(toDto(await collections.readableCollection(param(req, 'id'), req.user?.id)));
});

collectionsRouter.patch(
  '/api/collections/:id',
  requireAuth(config.jwtPublicKey),
  validateBody(updateCollectionSchema),
  async (req, res) => {
    const user = authedUser(req);
    const existing = await collections.ownedCollection(param(req, 'id'), user.id);
    res.json(toDto(await collections.updateCollection(existing.id, req.body)));
  },
);

collectionsRouter.delete('/api/collections/:id', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const existing = await collections.ownedCollection(param(req, 'id'), user.id);
  await collections.deleteCollection(existing.id);
  res.status(204).end();
});

// ---- collection contents --------------------------------------------------

collectionsRouter.get('/api/collections/:id/posts', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const viewerId = req.user?.id;
  const collection = await collections.readableCollection(param(req, 'id'), viewerId);
  const query = parseQuery(listQuerySchema, req.query);
  const page = await collections.collectionPage(collection.id, clampLimit(query.limit), parseItemCursor(query.cursor));
  res.json(await respondWithPosts(page, viewerId));
});

collectionsRouter.post(
  '/api/collections/:id/posts',
  requireAuth(config.jwtPublicKey),
  validateBody(addItemSchema),
  async (req, res) => {
    const user = authedUser(req);
    const collection = await collections.ownedCollection(param(req, 'id'), user.id);
    const added = await collections.addToCollection(collection, req.body.postId);
    res.status(added ? 201 : 200).json(toDto(await collections.ownedCollection(collection.id, user.id), true));
  },
);

collectionsRouter.delete(
  '/api/collections/:id/posts/:postId',
  requireAuth(config.jwtPublicKey),
  async (req, res) => {
    const user = authedUser(req);
    const collection = await collections.ownedCollection(param(req, 'id'), user.id);
    await collections.removeFromCollection(collection.id, param(req, 'postId'));
    res.json(toDto(await collections.ownedCollection(collection.id, user.id), false));
  },
);
