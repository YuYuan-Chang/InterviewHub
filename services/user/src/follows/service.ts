import { notificationRecord } from '@interviewhub/shared';
import { prisma } from '../db';

// All follow-graph data access lives here — the seam for extracting a
// dedicated social-graph service later.

export async function followCounts(userId: string) {
  const [followerCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followeeId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followerCount, followingCount };
}

export async function isFollowing(followerId: string, followeeId: string): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId } },
  });
  return row !== null;
}

/** Returns true if a new follow edge was created (false = already following). */
export async function follow(followerId: string, followeeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.follow.createMany({ data: [{ followerId, followeeId }], skipDuplicates: true });
    if (result.count > 0) await tx.outbox.create({ data: notificationRecord({
      type: 'new_follower', recipientId: followeeId, actorId: followerId,
    }) });
    return result.count > 0;
  });
}

export async function unfollow(followerId: string, followeeId: string): Promise<void> {
  await prisma.follow.deleteMany({ where: { followerId, followeeId } });
}

export async function followingIds(userId: string, cap = 1000): Promise<string[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followeeId: true },
    take: cap,
  });
  return rows.map((r) => r.followeeId);
}

export async function listEdges(userId: string, direction: 'followers' | 'following', limit: number, before?: Date) {
  const where =
    direction === 'followers'
      ? { followeeId: userId, ...(before ? { createdAt: { lt: before } } : {}) }
      : { followerId: userId, ...(before ? { createdAt: { lt: before } } : {}) };
  return prisma.follow.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
}
