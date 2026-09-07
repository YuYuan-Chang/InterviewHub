import { z } from 'zod';
import { HttpError, decodeCursor } from '@interviewhub/shared';

/** Collapses runs of whitespace so " AI   prep " and "AI prep" can't both exist. */
export const collectionNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Give the collection a name').max(80));

export const createCollectionSchema = z.object({
  name: collectionNameSchema,
  description: z.string().trim().max(300).optional().default(''),
  isPrivate: z.boolean().optional().default(true),
});

export const updateCollectionSchema = z
  .object({
    name: collectionNameSchema.optional(),
    description: z.string().trim().max(300).optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const addItemSchema = z.object({ postId: z.string().uuid() });

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const collectionsQuerySchema = z.object({
  userId: z.string().uuid().optional(), // browse someone else's public collections
  postId: z.string().uuid().optional(), // annotate each collection with containsPost
});

/**
 * Saved/collected pages are keyset-paged on the last post id they returned, so a
 * cursor only ever carries `afterPostId`. Anything else is rejected rather than
 * passed to Prisma, where a bad cursor would surface as a 500.
 */
export function parseItemCursor(raw: string | undefined): string | undefined {
  const cursor = decodeCursor<{ afterPostId?: unknown }>(raw);
  if (!cursor) return undefined;
  const parsed = z.string().uuid().safeParse(cursor.afterPostId);
  if (!parsed.success) throw new HttpError(400, 'Malformed cursor');
  return parsed.data;
}
