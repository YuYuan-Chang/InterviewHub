import { describe, expect, it } from 'vitest';
import { HttpError, encodeCursor } from '@interviewhub/shared';
import {
  createCollectionSchema,
  parseItemCursor,
  updateCollectionSchema,
} from '../src/collections/schemas';

const uuid = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

describe('collection name normalization', () => {
  it('trims and collapses whitespace so near-duplicate names collide', () => {
    const parsed = createCollectionSchema.parse({ name: '  System   design  ' });
    expect(parsed.name).toBe('System design');
  });

  it('defaults new collections to private with an empty description', () => {
    const parsed = createCollectionSchema.parse({ name: 'Behavioral' });
    expect(parsed).toMatchObject({ isPrivate: true, description: '' });
  });

  it('rejects a name that is only whitespace', () => {
    expect(createCollectionSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name over 80 characters', () => {
    expect(createCollectionSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
  });

  it('keeps case, so "Resume" and "resume" are different collections', () => {
    expect(createCollectionSchema.parse({ name: 'Resume' }).name).toBe('Resume');
    expect(createCollectionSchema.parse({ name: 'resume' }).name).toBe('resume');
  });
});

describe('collection updates', () => {
  it('accepts a single field', () => {
    expect(updateCollectionSchema.parse({ isPrivate: false })).toEqual({ isPrivate: false });
  });

  it('rejects an empty patch instead of touching updatedAt for nothing', () => {
    expect(updateCollectionSchema.safeParse({}).success).toBe(false);
  });
});

describe('parseItemCursor', () => {
  it('returns undefined for a first page', () => {
    expect(parseItemCursor(undefined)).toBeUndefined();
  });

  it('round-trips the keyset a page handed out', () => {
    expect(parseItemCursor(encodeCursor({ afterPostId: uuid }))).toBe(uuid);
  });

  it('rejects a cursor whose payload is not a post id', () => {
    expect(() => parseItemCursor(encodeCursor({ afterPostId: 'not-a-uuid' }))).toThrow(HttpError);
    expect(() => parseItemCursor(encodeCursor({ afterId: uuid }))).toThrow(HttpError);
  });

  it('rejects a cursor that is not encoded JSON at all', () => {
    expect(() => parseItemCursor('%%%')).toThrow(HttpError);
  });

  it('answers 400, not 500, for every malformed cursor', () => {
    try {
      parseItemCursor(encodeCursor({ afterPostId: 12 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as HttpError).status).toBe(400);
    }
  });
});
