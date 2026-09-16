/**
 * The visual diff: two versions of a diagram merged into one, every class,
 * member and relation marked added / removed / modified / unchanged.
 *
 * `diffDiagrams` in `@hestia/node-devtools` answers a different question — a list of
 * changes for a commit message. This one keeps everything, unchanged elements
 * included, because a picture with only the changes on it has lost its context.
 */
import type { Edge, Node } from '@xyflow/react';
import type { UmlDiagram, UmlEdgeData, UmlKind, UmlMember } from '@hestia/node-devtools/format';

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';
export const DIFF_COLOR: Record<DiffStatus, string> = {
  added: '#2e7d32',
  removed: '#c62828',
  modified: '#ef6c00',
  unchanged: '#9e9e9e',
};

export interface DiffMember extends UmlMember {
  status: DiffStatus;
  oldText?: string;
}
export type DiffNodeData = {
  kind: UmlKind;
  name: string;
  oldName?: string;
  status: DiffStatus;
  members: DiffMember[];
};
export type DiffFlowNode = Node<DiffNodeData>;
export type DiffEdgeData = UmlEdgeData & { status: DiffStatus };
export type DiffFlowEdge = Edge<DiffEdgeData>;

/** The bare member name from a UML line (sigil, `static`, parameters and type stripped). */
export function memberName(text: string): string {
  let s = text.trim();
  if ('+-#~'.includes(s[0])) s = s.slice(1).trim();
  if (s.startsWith('static ')) s = s.slice(7).trim();
  const paren = s.indexOf('(');
  const colon = s.indexOf(':');
  const end = paren >= 0 ? paren : colon >= 0 ? colon : s.length;
  return s.slice(0, end).trim();
}

export function diffMembers(aMembers: UmlMember[], bMembers: UmlMember[]): DiffMember[] {
  const aMap = new Map(aMembers.map((m) => [m.id, m]));
  const bMap = new Map(bMembers.map((m) => [m.id, m]));
  const out: DiffMember[] = [];
  for (const m of bMembers) {
    const am = aMap.get(m.id);
    if (!am) out.push({ ...m, status: 'added' });
    else if (am.text !== m.text) out.push({ ...m, status: 'modified', oldText: am.text });
    else out.push({ ...m, status: 'unchanged' });
  }
  const removed = aMembers
    .filter((m) => !bMap.has(m.id))
    .map((m) => ({ ...m, status: 'removed' as DiffStatus }));
  // Reconcile id mismatches by name: a removed + added pair with the same name
  // is really a signature change (`func2(arg1)` → `func2(arg1, arg2)`) — shown
  // as modified, not remove + add. The same text → unchanged (the ids differ
  // only because they came from different schemes).
  const usedAdded = new Set<string>();
  for (const rem of removed) {
    const cand = out.find(
      (o) =>
        o.status === 'added' &&
        !usedAdded.has(o.id) &&
        o.kind === rem.kind &&
        memberName(o.text) === memberName(rem.text)
    );
    if (cand) {
      usedAdded.add(cand.id);
      if (cand.text === rem.text) cand.status = 'unchanged';
      else {
        cand.status = 'modified';
        cand.oldText = rem.text;
      }
    } else out.push(rem);
  }
  return out;
}

export interface DiffResult {
  nodes: DiffFlowNode[];
  edges: DiffFlowEdge[];
  /** [added, removed, modified] for classes and members; [added, removed] for relations. */
  counts: { cls: [number, number, number]; mem: [number, number, number]; rel: [number, number] };
}

export function buildDiff(
  baseDia: UmlDiagram | undefined,
  targetDia: UmlDiagram | undefined
): DiffResult {
  const aNodes = new Map((baseDia?.nodes ?? []).map((n) => [n.id, n]));
  const bNodes = new Map((targetDia?.nodes ?? []).map((n) => [n.id, n]));
  const nodes: DiffFlowNode[] = [];
  const counts: DiffResult['counts'] = { cls: [0, 0, 0], mem: [0, 0, 0], rel: [0, 0] };
  const bumpMem = (ms: DiffMember[]) =>
    ms.forEach((m) => {
      if (m.status === 'added') counts.mem[0]++;
      else if (m.status === 'removed') counts.mem[1]++;
      else if (m.status === 'modified') counts.mem[2]++;
    });

  for (const id of new Set([...aNodes.keys(), ...bNodes.keys()])) {
    const a = aNodes.get(id);
    const b = bNodes.get(id);
    if (a && b) {
      const members = diffMembers(a.data.members, b.data.members);
      const changed =
        a.data.name !== b.data.name ||
        a.data.kind !== b.data.kind ||
        members.some((m) => m.status !== 'unchanged');
      if (changed) counts.cls[2]++;
      bumpMem(members);
      nodes.push({
        id,
        type: 'diff',
        position: b.position,
        data: {
          kind: b.data.kind,
          name: b.data.name,
          oldName: a.data.name !== b.data.name ? a.data.name : undefined,
          status: changed ? 'modified' : 'unchanged',
          members,
        },
      });
    } else if (b) {
      counts.cls[0]++;
      const members = b.data.members.map((m) => ({ ...m, status: 'added' as DiffStatus }));
      bumpMem(members);
      nodes.push({
        id,
        type: 'diff',
        position: b.position,
        data: { kind: b.data.kind, name: b.data.name, status: 'added', members },
      });
    } else if (a) {
      counts.cls[1]++;
      const members = a.data.members.map((m) => ({ ...m, status: 'removed' as DiffStatus }));
      bumpMem(members);
      nodes.push({
        id,
        type: 'diff',
        position: a.position,
        data: { kind: a.data.kind, name: a.data.name, status: 'removed', members },
      });
    }
  }

  const aEdges = new Map((baseDia?.edges ?? []).map((e) => [e.id, e]));
  const bEdges = new Map((targetDia?.edges ?? []).map((e) => [e.id, e]));
  const edges: DiffFlowEdge[] = [];
  for (const id of new Set([...aEdges.keys(), ...bEdges.keys()])) {
    const a = aEdges.get(id);
    const b = bEdges.get(id);
    const e = (b ?? a)!;
    const status: DiffStatus = a && b ? 'unchanged' : b ? 'added' : 'removed';
    if (status === 'added') counts.rel[0]++;
    else if (status === 'removed') counts.rel[1]++;
    edges.push({ ...e, type: 'diffEdge', data: { ...e.data, status } });
  }
  return { nodes, edges, counts };
}
