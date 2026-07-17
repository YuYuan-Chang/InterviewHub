import { s2sClient, param } from '@interviewhub/shared';
import type { Post } from '../generated/prisma';
import { prisma } from './db';
import { config } from './config';
import { logger } from './logger';

const userService = s2sClient(config.userServiceUrl, config.internalToken);

export interface AuthorSummary {
  userId: string;
  username: string;
  displayName: string;
  school: string;
  avatarFileId: string | null;
}

export interface AttachmentMeta {
  fileId: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface EnrichedPost extends Omit<Post, 'createdAt' | 'attachments'> {
  createdAt: string;
  attachments: AttachmentMeta[];
  author: AuthorSummary | null;
  viewerHasUpvoted: boolean;
}

/** New posts store attachments as JSON; legacy rows get their single file synthesized in. */
function attachmentsOf(p: Post): AttachmentMeta[] {
  const arr = Array.isArray(p.attachments) ? (p.attachments as unknown as AttachmentMeta[]) : [];
  if (arr.length > 0) return arr;
  if (p.fileId && p.fileName) {
    return [
      {
        fileId: p.fileId,
        name: p.fileName,
        mime: p.fileMime ?? 'application/octet-stream',
        sizeBytes: p.fileSize ?? 0,
      },
    ];
  }
  return [];
}

/** Attach author profiles (batched S2S call) and the viewer's upvote state. */
export async function enrichPosts(posts: Post[], viewerId?: string): Promise<EnrichedPost[]> {
  if (posts.length === 0) return [];
  const authorIds = [...new Set(posts.map((p) => p.authorId))];

  const [profilesRes, reactions] = await Promise.all([
    userService
      .post<{ profiles: AuthorSummary[] }>('/internal/profiles/batch', { ids: authorIds })
      .catch((err) => {
        // Feed reads should degrade gracefully if user-service is briefly down.
        logger.warn({ err }, 'author enrichment degraded — serving posts without profiles');
        return { profiles: [] as AuthorSummary[] };
      }),
    viewerId
      ? prisma.postReaction.findMany({
          where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
          select: { postId: true },
        })
      : Promise.resolve([]),
  ]);

  const authorsById = new Map(profilesRes.profiles.map((p) => [p.userId, p]));
  const upvoted = new Set(reactions.map((r) => r.postId));

  return posts.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    attachments: attachmentsOf(p),
    author: authorsById.get(p.authorId) ?? null,
    viewerHasUpvoted: upvoted.has(p.id),
  }));
}
