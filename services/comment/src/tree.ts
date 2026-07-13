/** Builds a nested comment tree from the flat parentId list. Pure — unit tested. */

export interface FlatComment {
  id: string;
  parentId: string | null;
  [key: string]: unknown;
}

export type TreeComment<T extends FlatComment> = T & { replies: TreeComment<T>[] };

export function buildTree<T extends FlatComment>(flat: T[]): TreeComment<T>[] {
  const nodes = new Map<string, TreeComment<T>>();
  for (const c of flat) nodes.set(c.id, { ...c, replies: [] });

  const roots: TreeComment<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node); // orphaned replies surface as roots rather than vanishing
  }
  return roots;
}
