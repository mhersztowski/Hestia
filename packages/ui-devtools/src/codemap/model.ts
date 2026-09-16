/**
 * The editor's side of the model: what the canvas needs on top of the codemap
 * format — display metadata, factories for new elements, member-text helpers,
 * and normalisation of files that come from outside.
 *
 * The document itself (types, commits, branches) comes from
 * `@hestia/node-devtools/format`, the same code the server uses. Nothing here
 * redefines it.
 */
import type { Edge, Node } from '@xyflow/react';
import {
  codemapFromDiagrams,
  type Codemap,
  type CodemapCommit,
  type UmlDiagram,
  type UmlDoc,
  type UmlEdge,
  type UmlEdgeData,
  type UmlKind,
  type UmlMember,
  type UmlNode,
  type UmlNodeData,
  type RelType,
} from '@hestia/node-devtools/format';

/** A class node as React Flow holds it (with `selected`, `measured`, …). */
export type UmlFlowNode = Node<UmlNodeData>;
/** A relation as React Flow holds it. */
export type UmlFlowEdge = Edge<UmlEdgeData>;

export const KIND_META: Record<
  UmlKind,
  { stereotype: string | null; color: string; label: string }
> = {
  class: { stereotype: null, color: '#1976d2', label: 'Class' },
  abstract: { stereotype: '«abstract»', color: '#6a1b9a', label: 'Abstract' },
  interface: { stereotype: '«interface»', color: '#00838f', label: 'Interface' },
  enum: { stereotype: '«enumeration»', color: '#ef6c00', label: 'Enum' },
  struct: { stereotype: '«struct»', color: '#546e7a', label: 'Struct' },
  module: { stereotype: '«module»', color: '#37474f', label: 'Module' },
};

export const REL_META: Record<
  RelType,
  { label: string; markerStart?: string; markerEnd?: string; dashed?: boolean }
> = {
  association: { label: 'Association' },
  directed: { label: 'Directed', markerEnd: 'url(#uml-arrow-open)' },
  dependency: { label: 'Dependency', markerEnd: 'url(#uml-arrow-open)', dashed: true },
  generalization: { label: 'Generalization (extends)', markerEnd: 'url(#uml-triangle)' },
  realization: { label: 'Realization (implements)', markerEnd: 'url(#uml-triangle)', dashed: true },
  aggregation: { label: 'Aggregation', markerStart: 'url(#uml-diamond-hollow)' },
  composition: { label: 'Composition', markerStart: 'url(#uml-diamond-filled)' },
};

export const REL_ORDER: RelType[] = [
  'association',
  'directed',
  'aggregation',
  'composition',
  'generalization',
  'realization',
  'dependency',
];

export const VIS_ORDER = ['+', '#', '~', '-'] as const;
export const VIS_LABEL: Record<string, string> = {
  '+': 'public',
  '#': 'protected',
  '~': 'package',
  '-': 'private',
};
export const VIS_COLOR: Record<string, string> = {
  '+': '#4caf50',
  '#': '#ff9800',
  '~': '#2196f3',
  '-': '#f44336',
};

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ── Ids and factories ────────────────────────────────────────────────────────

let idSeq = 1;
export const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${idSeq++}`;
export const member = (kind: UmlMember['kind'], text: string, category?: string): UmlMember => ({
  id: nextId('m'),
  kind,
  text,
  category,
});

export function makeNode(kind: UmlKind, position: { x: number; y: number }): UmlNode {
  const members =
    kind === 'enum'
      ? [member('field', 'VALUE_A'), member('field', 'VALUE_B')]
      : [member('field', '- field: type'), member('method', '+ method(): void')];
  return {
    id: nextId('n'),
    type: 'umlClass',
    position,
    data: { kind, name: KIND_META[kind].label, members },
  };
}

/** A small example diagram — what a first visit shows instead of an empty canvas. */
export function seedDiagram(name: string): UmlDiagram {
  const animal: UmlNode = {
    id: nextId('n'),
    type: 'umlClass',
    position: { x: 220, y: 40 },
    data: {
      kind: 'abstract',
      name: 'Animal',
      members: [member('field', '- name: string'), member('method', '+ makeSound(): void')],
    },
  };
  const dog: UmlNode = {
    id: nextId('n'),
    type: 'umlClass',
    position: { x: 80, y: 280 },
    data: {
      kind: 'class',
      name: 'Dog',
      members: [member('field', '- breed: string'), member('method', '+ makeSound(): void')],
    },
  };
  const owner: UmlNode = {
    id: nextId('n'),
    type: 'umlClass',
    position: { x: 400, y: 280 },
    data: {
      kind: 'class',
      name: 'Owner',
      members: [member('field', '- pets: Animal[]'), member('method', '+ adopt(a: Animal): void')],
    },
  };
  return {
    id: nextId('d'),
    name,
    nodes: [animal, dog, owner],
    edges: [
      {
        id: nextId('e'),
        source: dog.id,
        target: animal.id,
        sourceHandle: 't',
        targetHandle: 'b',
        type: 'uml',
        data: { relType: 'generalization' },
      },
      {
        id: nextId('e'),
        source: owner.id,
        target: animal.id,
        sourceHandle: 'l',
        targetHandle: 'r',
        type: 'uml',
        data: { relType: 'aggregation' },
      },
    ],
  };
}

export const emptyDiagram = (name: string): UmlDiagram => ({
  id: nextId('d'),
  name,
  nodes: [],
  edges: [],
});

/** A new codemap with one diagram — the example one, or empty. */
export function newCodemap(name: string, seeded: boolean): Codemap {
  return codemapFromDiagrams(name, [seeded ? seedDiagram('Diagram 1') : emptyDiagram('Diagram 1')]);
}

// ── Member text ──────────────────────────────────────────────────────────────

/** The leading visibility sigil of a member line (`+` when there is none). */
export function memberSigil(text: string): string {
  const ch = text.trimStart()[0];
  return ch === '+' || ch === '-' || ch === '#' || ch === '~' ? ch : '+';
}

/** Replaces (or prepends) the leading visibility sigil of a member line. */
export function changeTextSigil(text: string, sig: string): string {
  const trimmed = text.trimStart();
  const first = trimmed[0];
  if (first === '+' || first === '-' || first === '#' || first === '~')
    return sig + trimmed.slice(1);
  return sig + ' ' + trimmed;
}

/** Whether a field line uses the optional form `name?: type`. */
export function fieldNameOptional(text: string): boolean {
  let t = text.trim();
  if (t && '+-#~'.includes(t[0])) t = t.slice(1).trim();
  const i = t.indexOf(':');
  return (i < 0 ? t : t.slice(0, i)).trim().endsWith('?');
}

/**
 * Moves a member (by id) into another member's slot within the same kind,
 * leaving the positions of the other kind untouched — fields and methods are
 * reordered in their own sections.
 */
export function reorderWithinKind(ms: UmlMember[], fromId: string, toId: string): UmlMember[] {
  const moving = ms.find((m) => m.id === fromId);
  if (!moving) return ms;
  const kind = moving.kind;
  const sameKind = ms.filter((m) => m.kind === kind);
  const fromIdx = sameKind.findIndex((m) => m.id === fromId);
  const toIdx = sameKind.findIndex((m) => m.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return ms;
  const [mv] = sameKind.splice(fromIdx, 1);
  sameKind.splice(toIdx, 0, mv);
  let i = 0;
  return ms.map((m) => (m.kind === kind ? sameKind[i++] : m));
}

/** Tags every `name?: type` field with the "optional" category (e.g. after a sync from code). */
export function normalizeOptional(c: Codemap): Codemap {
  return {
    ...c,
    diagrams: c.diagrams.map((d) => ({
      ...d,
      nodes: d.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          members: n.data.members.map((m) =>
            m.kind === 'field' && m.category !== 'optional' && fieldNameOptional(m.text)
              ? { ...m, category: 'optional' }
              : m
          ),
        },
      })),
    })),
  };
}

// ── Normalisation of files from outside ──────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeNode(n: any): UmlNode {
  const data = n?.data ?? {};
  const members: UmlMember[] = Array.isArray(data.members)
    ? data.members.map((m: any) => ({
        id: m?.id ?? nextId('m'),
        kind: m?.kind === 'method' ? 'method' : 'field',
        text: String(m?.text ?? ''),
        ...(m?.category ? { category: String(m.category) } : {}),
        ...(m?.doc ? { doc: m.doc as UmlDoc } : {}),
      }))
    : // Old MyCastle nodes kept members as two string arrays.
      [
        ...(Array.isArray(data.attributes) ? data.attributes : []).map((t: unknown) =>
          member('field', String(t))
        ),
        ...(Array.isArray(data.methods) ? data.methods : []).map((t: unknown) =>
          member('method', String(t))
        ),
      ];
  return {
    id: String(n?.id ?? nextId('n')),
    type: 'umlClass',
    position: n?.position ?? { x: 0, y: 0 },
    data: {
      kind: (data.kind ?? 'class') as UmlKind,
      name: String(data.name ?? 'Class'),
      members,
      ...(data.linkedFile ? { linkedFile: String(data.linkedFile) } : {}),
      // The MyCastle editor dropped the class-level doc here on every load, so
      // a class description imported from code vanished after the first save.
      ...(data.doc ? { doc: data.doc as UmlDoc } : {}),
    },
  };
}

function normalizeDiagram(d: any): UmlDiagram {
  return {
    id: String(d?.id ?? nextId('d')),
    name: String(d?.name ?? 'Diagram'),
    nodes: (Array.isArray(d?.nodes) ? d.nodes : []).map(normalizeNode),
    edges: (Array.isArray(d?.edges) ? d.edges : []).map((e: any): UmlEdge => ({
      ...e,
      type: 'uml',
      data: { relType: 'association', ...e?.data },
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Makes a parsed codemap safe for the canvas: every member has an id and a
 * kind, every node the node type, every edge the edge type — in the working
 * state and in every commit's snapshot. `parseCodemap` checks that a file is a
 * codemap; this repairs the details inside, because a person may be opening a
 * file an older tool or a text editor wrote.
 */
export function normalizeCodemap(c: Codemap): Codemap {
  const commits: Record<string, CodemapCommit> = {};
  for (const [id, commit] of Object.entries(c.history.commits)) {
    commits[id] = {
      ...commit,
      parents: commit.parents ?? [],
      snapshot: {
        ...commit.snapshot,
        diagrams: (commit.snapshot?.diagrams ?? []).map(normalizeDiagram),
      },
    };
  }
  const diagrams = c.diagrams.map(normalizeDiagram);
  return {
    ...c,
    // A codemap with no diagram has nothing to put on the canvas.
    diagrams: diagrams.length ? diagrams : [emptyDiagram('Diagram 1')],
    history: { ...c.history, commits },
  };
}

// ── Flow ⇄ codemap ───────────────────────────────────────────────────────────

/** Strips React Flow's runtime fields (`selected`, `measured`, …) before a node goes into the file. */
export const cleanNodes = (nodes: UmlFlowNode[]): UmlNode[] =>
  nodes.map((n) => ({ id: n.id, type: 'umlClass', position: n.position, data: n.data }));

export const cleanEdges = (edges: UmlFlowEdge[]): UmlEdge[] =>
  edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    type: 'uml',
    data: e.data ?? { relType: 'association' },
  }));

// ── Documentation and categories ─────────────────────────────────────────────

/**
 * TSDoc metadata as tooltip text, in documentation order — description,
 * remarks, arguments, return value, example — so the most important sentence
 * shows first.
 */
export function docTooltip(doc?: UmlDoc): string {
  if (!doc) return '';
  const lines: string[] = [];
  if (doc.deprecated !== undefined)
    lines.push(`⚠ Deprecated${doc.deprecated ? `: ${doc.deprecated}` : ''}`);
  if (doc.summary) lines.push(doc.summary);
  if (doc.remarks) lines.push(doc.remarks);
  const params = Object.entries(doc.params ?? {});
  if (params.length) {
    lines.push('Arguments:');
    for (const [name, description] of params) lines.push(`  • ${name} — ${description}`);
  }
  if (doc.returns) lines.push(`Returns: ${doc.returns}`);
  if (doc.examples?.length) lines.push(`Example:\n${doc.examples[0]}`);
  if (doc.see?.length) lines.push(`See: ${doc.see.join(', ')}`);
  return lines.join('\n');
}

/** Whether an element has any documentation at all (to mark it on the node). */
export function hasDoc(doc?: UmlDoc): boolean {
  return (
    !!doc &&
    Object.values(doc).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''))
  );
}

/** A deterministic colour for a category dot — the same name, the same colour. */
export function categoryColor(cat: string): string {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 45%)`;
}
