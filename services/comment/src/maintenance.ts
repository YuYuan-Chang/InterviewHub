import { HttpError, s2sClient, startJob } from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';
import { logger } from './logger';

const posts = s2sClient(config.postServiceUrl, config.internalToken);
let afterId = '';
export async function repairComments() {
  const rows = await prisma.comment.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: 100, select: { id: true, postId: true } });
  const missing = new Set<string>();
  for (const postId of new Set(rows.map((row) => row.postId))) {
    try { await posts.get(`/internal/posts/${postId}`); }
    catch (err) {
      // Never interpret a timeout, open circuit or 5xx as deletion.
      if (!(err instanceof HttpError) || err.status !== 404) throw err;
      missing.add(postId);
      await prisma.comment.deleteMany({ where: { postId } });
    }
  }
  for (const row of rows) {
    if (!missing.has(row.postId)) await prisma.$transaction(async (tx) => {
      const count = await tx.commentReaction.count({ where: { commentId: row.id } });
      await tx.comment.updateMany({ where: { id: row.id }, data: { upvoteCount: count } });
    }, { isolationLevel: 'Serializable' });
    afterId = row.id;
  }
  if (rows.length < 100) afterId = '';
  return { scanned: rows.length, deletedPosts: missing.size };
}

export function startMaintenance() {
  return startJob('comment-repair', repairComments, logger, config.maintenanceIntervalMs);
}
