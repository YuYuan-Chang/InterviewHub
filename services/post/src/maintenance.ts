import { s2sClient, startJob } from '@interviewhub/shared';
import { config } from './config';
import { prisma } from './db';
import { logger } from './logger';

const comments = s2sClient(config.commentServiceUrl, config.internalToken);
let afterId = '';
let afterCollection = '';

export async function syncCommentCount(id: string) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM posts WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) return;
    const { count } = await comments.get<{ count: number }>(`/internal/comments/post/${id}/count`);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid comment count');
    await tx.post.update({ where: { id }, data: { commentCount: count } });
  }, { timeout: 5000 });
}

export async function reconcileCounters() {
  const posts = await prisma.post.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: 100, select: { id: true } });
  for (const post of posts) {
    // Serializable prevents concurrent reaction writes from being counted twice.
    await prisma.$transaction(async (tx) => {
      const count = await tx.postReaction.count({ where: { postId: post.id } });
      await tx.post.updateMany({ where: { id: post.id }, data: { upvoteCount: count } });
    }, { isolationLevel: 'Serializable' });
    await syncCommentCount(post.id);
    afterId = post.id;
  }
  if (posts.length < 100) afterId = '';
  const collections = await prisma.collection.findMany({ where: { id: { gt: afterCollection } }, orderBy: { id: 'asc' }, take: 100, select: { id: true } });
  for (const collection of collections) {
    await prisma.$transaction(async (tx) => {
      const count = await tx.collectionItem.count({ where: { collectionId: collection.id } });
      await tx.collection.updateMany({ where: { id: collection.id }, data: { itemCount: count } });
    }, { isolationLevel: 'Serializable' });
    afterCollection = collection.id;
  }
  if (collections.length < 100) afterCollection = '';
  return { posts: posts.length, collections: collections.length };
}

export function startMaintenance() {
  return startJob('counter-reconciliation', reconcileCounters, logger, config.maintenanceIntervalMs);
}
