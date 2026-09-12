import { parseMemberText } from '../model/render.js';
import { UmlDiagram, UmlEdge, UmlMember, UmlNode } from './umlTypes.js';

export type ChangeKind = 'added' | 'removed' | 'modified';
export type ChangeTarget = 'class' | 'field' | 'method' | 'relation';

export interface ModelChange {
  kind: ChangeKind;
  target: ChangeTarget;
  /** Owning class name (for class/member changes) or relation endpoint label. */
  symbol?: string;
  /** Member text or relation type. */
  member?: string;
  from?: string;
  to?: string;
}

const byId = <T extends { id: string }>(arr: T[]): Map<string, T> => new Map(arr.map((x) => [x.id, x]));

/** Compute add/remove/modify changes between two UML diagrams (component-level). */
export function diffDiagrams(oldD: UmlDiagram | undefined, newD: UmlDiagram): ModelChange[] {
  const changes: ModelChange[] = [];
  const oldNodes = byId<UmlNode>(oldD?.nodes ?? []);
  const newNodes = byId<UmlNode>(newD.nodes);

  // Classes
  for (const [id, n] of newNodes) {
    const prev = oldNodes.get(id);
    if (!prev) { changes.push({ kind: 'added', target: 'class', symbol: n.data.name }); continue; }
    if (prev.data.name !== n.data.name || prev.data.kind !== n.data.kind) {
      changes.push({ kind: 'modified', target: 'class', symbol: n.data.name, from: `${prev.data.kind} ${prev.data.name}`, to: `${n.data.kind} ${n.data.name}` });
    }
    // Members — id-based first, then reconcile id mismatches by name so a
    // signature change (e.g. arity) reads as "modified", not remove+add.
    const oldM = byId(prev.data.members);
    const newM = byId(n.data.members);
    const added: UmlMember[] = [];
    for (const [mid, m] of newM) {
      const pm = oldM.get(mid);
      if (!pm) added.push(m);
      else if (pm.text !== m.text) changes.push({ kind: 'modified', target: m.kind, symbol: n.data.name, from: pm.text, to: m.text });
    }
    const removed = [...oldM.values()].filter((m) => !newM.has(m.id));
    const usedAdded = new Set<string>();
    for (const rem of removed) {
      const rn = parseMemberText(rem.text).name;
      const cand = added.find((a) => !usedAdded.has(a.id) && a.kind === rem.kind && parseMemberText(a.text).name === rn);
      if (cand) {
        usedAdded.add(cand.id);
        if (cand.text !== rem.text) changes.push({ kind: 'modified', target: cand.kind, symbol: n.data.name, from: rem.text, to: cand.text });
      } else {
        changes.push({ kind: 'removed', target: rem.kind, symbol: n.data.name, member: rem.text });
      }
    }
    for (const m of added) if (!usedAdded.has(m.id)) changes.push({ kind: 'added', target: m.kind, symbol: n.data.name, member: m.text });
  }
  for (const [id, n] of oldNodes) if (!newNodes.has(id)) changes.push({ kind: 'removed', target: 'class', symbol: n.data.name });

  // Relations
  const nameOf = (nodeId: string, which: UmlNode[]): string => which.find((x) => x.id === nodeId)?.data.name ?? nodeId;
  const oldEdges = byId<UmlEdge>(oldD?.edges ?? []);
  const newEdges = byId<UmlEdge>(newD.edges);
  for (const [id, e] of newEdges) if (!oldEdges.has(id)) changes.push({ kind: 'added', target: 'relation', symbol: `${nameOf(e.source, newD.nodes)} → ${nameOf(e.target, newD.nodes)}`, member: e.data.relType });
  for (const [id, e] of oldEdges) if (!newEdges.has(id)) changes.push({ kind: 'removed', target: 'relation', symbol: `${nameOf(e.source, oldD?.nodes ?? [])} → ${nameOf(e.target, oldD?.nodes ?? [])}`, member: e.data.relType });

  return changes;
}

const TARGET_LABEL: Record<ChangeTarget, string> = {
  class: 'class', field: 'field', method: 'method', relation: 'relation',
};

/** Short summary of the counts, like `+2 -1 ~3` (added, removed, modified). */
export function summarizeChanges(changes: ModelChange[]): string {
  if (changes.length === 0) return 'no changes';
  const counts = { added: 0, removed: 0, modified: 0 };
  for (const c of changes) counts[c.kind]++;
  const parts: string[] = [];
  if (counts.added) parts.push(`+${counts.added}`);
  if (counts.removed) parts.push(`-${counts.removed}`);
  if (counts.modified) parts.push(`~${counts.modified}`);
  return parts.join(' ');
}

/** Group changes by target for readable commit bodies. */
export function describeChanges(changes: ModelChange[]): string {
  return changes.map((c) => {
    const what = TARGET_LABEL[c.target];
    const detail = c.from && c.to ? `: ${c.from} → ${c.to}` : c.member ? `: ${c.member}` : '';
    return `${c.kind} ${what} ${c.symbol ?? ''}${detail}`.trim();
  }).join('\n');
}
