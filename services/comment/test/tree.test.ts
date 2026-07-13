import { describe, expect, it } from 'vitest';
import { buildTree } from '../src/tree';

const c = (id: string, parentId: string | null = null) => ({ id, parentId });

describe('buildTree', () => {
  it('nests replies under their parents', () => {
    const tree = buildTree([c('a'), c('b', 'a'), c('c', 'b'), c('d')]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'd']);
    expect(tree[0].replies[0].id).toBe('b');
    expect(tree[0].replies[0].replies[0].id).toBe('c');
    expect(tree[1].replies).toEqual([]);
  });

  it('preserves input order among siblings (created_at asc)', () => {
    const tree = buildTree([c('a'), c('r1', 'a'), c('r2', 'a'), c('r3', 'a')]);
    expect(tree[0].replies.map((n) => n.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('surfaces orphaned replies as roots instead of dropping them', () => {
    const tree = buildTree([c('a'), c('z', 'deleted-parent')]);
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'z']);
  });

  it('handles empty input', () => {
    expect(buildTree([])).toEqual([]);
  });
});
