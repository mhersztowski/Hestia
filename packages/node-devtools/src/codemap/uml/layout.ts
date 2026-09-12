import { CodeRelation, CodeSymbol } from '../model/CodeModel.js';

export interface XY { x: number; y: number }

/**
 * Inheritance-aware grid layout: a symbol's row is its longest generalization /
 * realization chain depth (base classes on top), columns spread within a row.
 * Cycle-guarded so malformed hierarchies still lay out.
 */
export function layoutSymbols(symbols: CodeSymbol[], relations: CodeRelation[], spacing: { dx?: number; dy?: number } = {}): Map<string, XY> {
  const dx = spacing.dx ?? 260;
  const dy = spacing.dy ?? 240;

  const parents = new Map<string, string[]>();
  for (const r of relations) {
    if (r.type === 'generalization' || r.type === 'realization') {
      (parents.get(r.fromId) ?? parents.set(r.fromId, []).get(r.fromId)!).push(r.toId);
    }
  }

  const memo = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    let d = 0;
    for (const p of parents.get(id) ?? []) d = Math.max(d, depthOf(p, stack) + 1);
    stack.delete(id);
    memo.set(id, d);
    return d;
  };

  const byDepth = new Map<number, string[]>();
  for (const s of symbols) {
    const d = depthOf(s.id, new Set());
    (byDepth.get(d) ?? byDepth.set(d, []).get(d)!).push(s.id);
  }

  const pos = new Map<string, XY>();
  for (const [d, ids] of byDepth) ids.forEach((id, i) => pos.set(id, { x: i * dx, y: d * dy }));
  return pos;
}

/** Pick UML handle pair from relative node geometry for tidy edges. */
export function handlesFor(from: XY, to: XY): { sourceHandle: string; targetHandle: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? { sourceHandle: 'b', targetHandle: 't' } : { sourceHandle: 't', targetHandle: 'b' };
  }
  return dx >= 0 ? { sourceHandle: 'r', targetHandle: 'l' } : { sourceHandle: 'l', targetHandle: 'r' };
}
