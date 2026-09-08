import { describe, expect, it, vi } from 'vitest';
import { encodeCursor, HttpError } from '@interviewhub/shared';

vi.mock('../src/config', () => ({ config: { jwtPublicKey: 'unused', userServiceUrl: 'http://unused', internalToken: 'unused' } }));
vi.mock('../src/db', () => ({ prisma: {} }));
import { collectionSchema, saveSchema, savedCursorWhere, savedQuerySchema } from '../src/saved';

const id = '83de59c3-4846-4931-90b1-a26cfd803a0a';

describe('Saved resource validation', () => {
  it('distinguishes unreviewed resources from reviewed resources', () => {
    expect(savedQuerySchema.parse({ reviewed: 'false' }).reviewed).toBe(false);
    expect(savedQuerySchema.parse({ reviewed: 'true' }).reviewed).toBe(true);
    expect(savedQuerySchema.parse({}).reviewed).toBeUndefined();
    expect(savedQuerySchema.safeParse({ reviewed: 'no' }).success).toBe(false);
  });

  it('leaves omitted fields unchanged and permits explicitly clearing notes and collections', () => {
    expect(saveSchema.parse({})).toEqual({});
    expect(saveSchema.parse({ notes: '', collectionIds: [], reviewed: false }))
      .toEqual({ notes: '', collectionIds: [], reviewed: false });
  });

  it('deduplicates membership ids and preserves intentional note formatting', () => {
    expect(saveSchema.parse({ notes: '  code\n\nnotes  ', collectionIds: [id, id] }))
      .toEqual({ notes: '  code\n\nnotes  ', collectionIds: [id] });
  });

  it('rejects invalid collections, excessive notes, and nonboolean review values', () => {
    expect(saveSchema.safeParse({ collectionIds: ['not-an-id'] }).success).toBe(false);
    expect(saveSchema.safeParse({ notes: 'x'.repeat(5001) }).success).toBe(false);
    expect(saveSchema.safeParse({ reviewed: 'false' }).success).toBe(false);
    expect(saveSchema.safeParse({ collectionIds: Array(101).fill(id) }).success).toBe(false);
  });

  it('normalizes collection names and rejects blank or oversized names', () => {
    expect(collectionSchema.parse({ name: '  SWE prep  ' })).toEqual({ name: 'SWE prep' });
    expect(collectionSchema.safeParse({ name: ' \n ' }).success).toBe(false);
    expect(collectionSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
  });
});

describe('Saved resource pagination', () => {
  it('uses a timestamp and id boundary without depending on the cursor row still existing', () => {
    const savedAt = '2026-09-08T12:00:00.000Z';
    expect(savedCursorWhere(encodeCursor({ savedAt, postId: id }))).toEqual({
      OR: [{ savedAt: { lt: new Date(savedAt) } }, { savedAt: new Date(savedAt), postId: { lt: id } }],
    });
    expect(savedCursorWhere(undefined)).toEqual({});
  });

  it.each(['garbage', encodeCursor({}), encodeCursor({ savedAt: 'bad-date', postId: id }),
    encodeCursor({ savedAt: '2026-09-08T12:00:00.000Z', postId: 'bad-id' }),
    Buffer.from('null').toString('base64url')])('rejects malformed cursor %s with a client error', (cursor) => {
    expect(() => savedCursorWhere(cursor)).toThrow(HttpError);
    try { savedCursorWhere(cursor); } catch (error) { expect((error as HttpError).status).toBe(400); }
  });
});
