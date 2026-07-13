import { z } from 'zod';
import type { Prisma } from '../generated/prisma';
import { prisma } from './db';

export const feedQuerySchema = z.object({
  sort: z.enum(['recent', 'popular']).optional().default('recent'),
  q: z.string().trim().min(1).max(100).optional(),
  tag: z.string().min(1).max(60).optional(), // single-tag links (back-compat)
  tags: z.string().max(500).optional(), // comma-separated multi-tag filter
  authorId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().optional(),
});

export function parseTagList(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
}

export interface FeedOptions {
  sort: 'recent' | 'popular';
  q?: string;
  tagList?: string[]; // AND semantics: every selected tag must be present
  authorId?: string;
  authorIds?: string[]; // Following feed: restrict to followees
  afterId?: string; // keyset cursor: id of the last post on the previous page
  limit: number;
}

/**
 * Keyset pagination via Prisma's cursor API: we seek to the last-seen post id
 * and continue in the same ordering. With the 'popular' sort, counts can shift
 * between pages (a post may repeat or be skipped) — the standard trade-off for
 * cursoring over a mutable ranking.
 */
export async function queryFeed(opts: FeedOptions) {
  const where: Prisma.PostWhereInput = {
    ...(opts.tagList?.length ? { tags: { hasEvery: opts.tagList } } : {}),
    ...(opts.authorId ? { authorId: opts.authorId } : {}),
    ...(opts.authorIds ? { authorId: { in: opts.authorIds } } : {}),
    ...(opts.q
      ? {
          OR: [
            { title: { contains: opts.q, mode: 'insensitive' } },
            { description: { contains: opts.q, mode: 'insensitive' } },
            { tags: { has: opts.q.toLowerCase() } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    opts.sort === 'popular'
      ? [{ upvoteCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }];

  const posts = await prisma.post.findMany({
    where,
    orderBy,
    take: opts.limit + 1,
    ...(opts.afterId ? { cursor: { id: opts.afterId }, skip: 1 } : {}),
  });

  const page = posts.slice(0, opts.limit);
  return {
    page,
    nextAfterId: posts.length > opts.limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

/** Most-used tags across all posts — feeds the filter chip bar in the UI. */
export async function popularTags(limit = 20): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT unnest(tags) AS tag, count(*) AS count
    FROM posts
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
