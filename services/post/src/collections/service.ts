import { HttpError } from '@interviewhub/shared';
import type { Collection, Prisma } from '../../generated/prisma';
import { prisma } from '../db';

// All bookmark/collection data access lives here — routes stay thin, and the
// module is the seam if saved-content ever moves out of post-service.

export const MAX_COLLECTIONS_PER_USER = 50;
export const MAX_ITEMS_PER_COLLECTION = 500;

/** A page of saved/collected post ids, newest first, plus the next keyset cursor. */
export interface IdPage {
  postIds: string[];
  nextAfterPostId: string | null;
}

function pageOf<T extends { postId: string }>(rows: T[], limit: number): IdPage {
  const page = rows.slice(0, limit);
  return {
    postIds: page.map((r) => r.postId),
    nextAfterPostId: rows.length > limit && page.length > 0 ? page[page.length - 1].postId : null,
  };
}

/**
 * Prisma's cursor API over the composite primary key: `created_at DESC` orders the
 * page and the PK breaks ties, so a cursor is just the last post id we handed out.
 * Rows here are append-only (no re-ordering the way `sort=popular` re-ranks posts),
 * so paging is stable.
 */
export async function savedPage(userId: string, limit: number, afterPostId?: string): Promise<IdPage> {
  const rows = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
    select: { postId: true },
    take: limit + 1,
    ...(afterPostId ? { cursor: { postId_userId: { postId: afterPostId, userId } }, skip: 1 } : {}),
  });
  return pageOf(rows, limit);
}

export async function collectionPage(collectionId: string, limit: number, afterPostId?: string): Promise<IdPage> {
  const rows = await prisma.collectionItem.findMany({
    where: { collectionId },
    orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
    select: { postId: true },
    take: limit + 1,
    ...(afterPostId ? { cursor: { collectionId_postId: { collectionId, postId: afterPostId } }, skip: 1 } : {}),
  });
  return pageOf(rows, limit);
}

/** Fetches the posts for a page of ids and restores the page's ordering. */
export async function postsInOrder(postIds: string[]) {
  if (postIds.length === 0) return [];
  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    include: { interviewExperience: true },
  });
  const byId = new Map(posts.map((p) => [p.id, p]));
  return postIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => p !== undefined);
}

export async function listCollections(ownerId: string, includePrivate: boolean): Promise<Collection[]> {
  return prisma.collection.findMany({
    where: { ownerId, ...(includePrivate ? {} : { isPrivate: false }) },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: MAX_COLLECTIONS_PER_USER,
  });
}

/** Which of these collections already hold the post — powers the "Save to…" picker. */
export async function collectionIdsHolding(collectionIds: string[], postId: string): Promise<Set<string>> {
  if (collectionIds.length === 0) return new Set();
  const rows = await prisma.collectionItem.findMany({
    where: { postId, collectionId: { in: collectionIds } },
    select: { collectionId: true },
  });
  return new Set(rows.map((r) => r.collectionId));
}

/** Loads a collection the viewer is allowed to see. Private ones 404 for everyone else. */
export async function readableCollection(id: string, viewerId?: string): Promise<Collection> {
  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection) throw new HttpError(404, 'Collection not found');
  if (collection.isPrivate && collection.ownerId !== viewerId) throw new HttpError(404, 'Collection not found');
  return collection;
}

export async function ownedCollection(id: string, ownerId: string): Promise<Collection> {
  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection) throw new HttpError(404, 'Collection not found');
  if (collection.ownerId !== ownerId) throw new HttpError(403, 'Only the owner can change this collection');
  return collection;
}

/** Maps Postgres' unique-violation on (owner_id, name) to a 409. */
function asDuplicateName(err: unknown): never {
  if ((err as { code?: string })?.code === 'P2002') {
    throw new HttpError(409, 'You already have a collection with that name');
  }
  throw err;
}

export async function createCollection(
  ownerId: string,
  data: { name: string; description: string; isPrivate: boolean },
): Promise<Collection> {
  const existing = await prisma.collection.count({ where: { ownerId } });
  if (existing >= MAX_COLLECTIONS_PER_USER) {
    throw new HttpError(400, `You can have at most ${MAX_COLLECTIONS_PER_USER} collections`);
  }
  return prisma.collection.create({ data: { ownerId, ...data } }).catch(asDuplicateName);
}

export async function updateCollection(id: string, data: Prisma.CollectionUpdateInput): Promise<Collection> {
  return prisma.collection.update({ where: { id }, data }).catch(asDuplicateName);
}

export async function deleteCollection(id: string): Promise<void> {
  // items cascade; bookmarks are deliberately left alone — deleting a folder
  // must not un-save the posts that were filed in it
  await prisma.collection.delete({ where: { id } });
}

/** Saves a post. Returns false when it was already saved (the call is idempotent). */
export async function bookmark(userId: string, postId: string): Promise<boolean> {
  const created = await prisma.bookmark
    .createMany({ data: [{ postId, userId }], skipDuplicates: true })
    .catch((err: { code?: string }) => {
      // FK violation → the post doesn't exist
      if (err?.code === 'P2003') throw new HttpError(404, 'Post not found');
      throw err;
    });
  return created.count > 0;
}

/**
 * Un-saves a post and drops it from every collection of the same user: a post
 * filed in a collection is by definition saved, so leaving the item rows behind
 * would contradict `viewerHasBookmarked`.
 */
export async function unbookmark(userId: string, postId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.collectionItem.findMany({
      where: { postId, collection: { ownerId: userId } },
      select: { collectionId: true },
    });
    await tx.bookmark.deleteMany({ where: { postId, userId } });
    if (items.length === 0) return;
    const collectionIds = items.map((i) => i.collectionId);
    await tx.collectionItem.deleteMany({ where: { postId, collectionId: { in: collectionIds } } });
    await tx.collection.updateMany({
      where: { id: { in: collectionIds } },
      data: { itemCount: { decrement: 1 } },
    });
  });
}

/**
 * Files a post in a collection. Adding also saves it, so the two states can't
 * drift. Returns false when the post was already in the collection.
 */
export async function addToCollection(collection: Collection, postId: string): Promise<boolean> {
  if (collection.itemCount >= MAX_ITEMS_PER_COLLECTION) {
    throw new HttpError(400, `A collection can hold at most ${MAX_ITEMS_PER_COLLECTION} posts`);
  }
  return prisma
    .$transaction(async (tx) => {
      const created = await tx.collectionItem.createMany({
        data: [{ collectionId: collection.id, postId }],
        skipDuplicates: true,
      });
      // idempotent: the counter only moves when a row was actually inserted
      if (created.count === 0) return false;
      await tx.bookmark.createMany({ data: [{ postId, userId: collection.ownerId }], skipDuplicates: true });
      await tx.collection.update({
        where: { id: collection.id },
        data: { itemCount: { increment: 1 } },
      });
      return true;
    })
    .catch((err: { code?: string }) => {
      if (err?.code === 'P2003') throw new HttpError(404, 'Post not found');
      throw err;
    });
}

/** Removes a post from one collection. The bookmark survives — it's still saved. */
export async function removeFromCollection(collectionId: string, postId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.collectionItem.deleteMany({ where: { collectionId, postId } });
    if (deleted.count === 0) return false;
    await tx.collection.update({ where: { id: collectionId }, data: { itemCount: { decrement: 1 } } });
    return true;
  });
}

/**
 * Keeps `item_count` honest when a post disappears. `ON DELETE CASCADE` removes
 * the item rows without telling the counters, so the affected collections have to
 * be read before the delete and decremented in the same transaction.
 */
export async function deletePostAndFixCounters(postId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.collectionItem.findMany({ where: { postId }, select: { collectionId: true } });
    await tx.post.delete({ where: { id: postId } });
    if (items.length === 0) return;
    await tx.collection.updateMany({
      where: { id: { in: items.map((i) => i.collectionId) } },
      data: { itemCount: { decrement: 1 } },
    });
  });
}
