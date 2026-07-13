import { describe, expect, it } from 'vitest';
import { HttpError, clampLimit, decodeCursor, encodeCursor } from '../src';

describe('cursor codec', () => {
  it('round-trips payloads', () => {
    const cursor = encodeCursor({ afterId: 'abc', n: 3 });
    expect(decodeCursor(cursor)).toEqual({ afterId: 'abc', n: 3 });
  });

  it('returns undefined for missing cursors', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('throws 400 on malformed cursors', () => {
    expect(() => decodeCursor('!!!not-base64json!!!')).toThrowError(HttpError);
  });
});

describe('clampLimit', () => {
  it('falls back on garbage', () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit('abc')).toBe(20);
    expect(clampLimit(-5)).toBe(20);
  });
  it('clamps to the max', () => {
    expect(clampLimit(9999)).toBe(50);
    expect(clampLimit(30)).toBe(30);
  });
});
