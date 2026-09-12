import { describe, it, expect } from 'vitest';
import { hasUncommittedChanges, parseCodemap, stringifyCodemap } from '@hestia/node-devtools/format';
import {
  changeTextSigil, cleanEdges, cleanNodes, docTooltip, fieldNameOptional, hasDoc, memberSigil, newCodemap,
  normalizeCodemap, normalizeOptional, reorderWithinKind, type UmlFlowEdge, type UmlFlowNode,
} from './model';

describe('a new codemap', () => {
  it('starts committed, with the example diagram or an empty one', () => {
    const seeded = newCodemap('Zoo', true);
    expect(seeded.diagrams[0].nodes).toHaveLength(3);
    expect(hasUncommittedChanges(seeded)).toBe(false);
    expect(newCodemap('Empty', false).diagrams[0].nodes).toEqual([]);
  });

  it('survives the file format — what the editor makes, the format accepts', () => {
    const c = newCodemap('Zoo', true);
    expect(normalizeCodemap(parseCodemap(stringifyCodemap(c)))).toEqual(c);
  });
});

describe('normalising a codemap from outside', () => {
  const raw = (nodes: unknown[]) => {
    const c = newCodemap('X', false);
    return { ...c, diagrams: [{ id: 'd1', name: 'D', nodes, edges: [{ id: 'e1', source: 'a', target: 'b' }] }] } as never;
  };

  it('fills in member ids and kinds, and the node and edge types', () => {
    const c = normalizeCodemap(raw([{ id: 'a', data: { name: 'A', members: [{ text: '+ run(): void', kind: 'method' }, { text: 'x' }] } }]));
    const node = c.diagrams[0].nodes[0];
    expect(node.type).toBe('umlClass');
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.data.members.map((m) => m.kind)).toEqual(['method', 'field']);
    expect(node.data.members.every((m) => typeof m.id === 'string' && m.id.length > 0)).toBe(true);
    expect(c.diagrams[0].edges[0]).toMatchObject({ type: 'uml', data: { relType: 'association' } });
  });

  it('keeps the class-level documentation (the MyCastle editor lost it)', () => {
    const c = normalizeCodemap(raw([{ id: 'a', data: { name: 'A', members: [], doc: { summary: 'An A.' } } }]));
    expect(c.diagrams[0].nodes[0].data.doc).toEqual({ summary: 'An A.' });
  });

  it('reads the old two-array member shape', () => {
    const c = normalizeCodemap(raw([{ id: 'a', data: { name: 'A', attributes: ['- x: number'], methods: ['+ go(): void'] } }]));
    expect(c.diagrams[0].nodes[0].data.members.map((m) => `${m.kind} ${m.text}`)).toEqual(['field - x: number', 'method + go(): void']);
  });

  it('gives a codemap with no diagrams one empty diagram', () => {
    const c = newCodemap('X', false);
    expect(normalizeCodemap({ ...c, diagrams: [] }).diagrams).toHaveLength(1);
  });
});

describe('flow ⇄ codemap', () => {
  it('drops React Flow runtime fields before a node or edge goes into the file', () => {
    const node = { id: 'a', type: 'umlClass', position: { x: 1, y: 2 }, data: { kind: 'class', name: 'A', members: [] }, selected: true, measured: { width: 10 } } as UmlFlowNode;
    expect(cleanNodes([node])).toEqual([{ id: 'a', type: 'umlClass', position: { x: 1, y: 2 }, data: { kind: 'class', name: 'A', members: [] } }]);
    const edge = { id: 'e', source: 'a', target: 'b', sourceHandle: null, targetHandle: 'l', selected: true, data: { relType: 'directed' } } as UmlFlowEdge;
    expect(cleanEdges([edge])).toEqual([{ id: 'e', source: 'a', target: 'b', sourceHandle: undefined, targetHandle: 'l', type: 'uml', data: { relType: 'directed' } }]);
  });
});

describe('member text', () => {
  it('reads and changes the visibility sigil', () => {
    expect(memberSigil('- x: number')).toBe('-');
    expect(memberSigil('x: number')).toBe('+');
    expect(changeTextSigil('- x: number', '#')).toBe('# x: number');
    expect(changeTextSigil('x: number', '~')).toBe('~ x: number');
  });

  it('recognises optional fields and tags them', () => {
    expect(fieldNameOptional('+ name?: string')).toBe(true);
    expect(fieldNameOptional('+ name: string?')).toBe(false);
    const c = newCodemap('X', false);
    c.diagrams[0].nodes = [{ id: 'a', type: 'umlClass', position: { x: 0, y: 0 }, data: { kind: 'class', name: 'A', members: [{ id: 'm', kind: 'field', text: '+ nick?: string' }] } }];
    expect(normalizeOptional(c).diagrams[0].nodes[0].data.members[0].category).toBe('optional');
  });

  it('reorders within one kind and leaves the other kind in place', () => {
    const ms = [
      { id: 'f1', kind: 'field' as const, text: 'a' },
      { id: 'm1', kind: 'method' as const, text: 'x()' },
      { id: 'f2', kind: 'field' as const, text: 'b' },
    ];
    expect(reorderWithinKind(ms, 'f2', 'f1').map((m) => m.id)).toEqual(['f2', 'm1', 'f1']);
    expect(reorderWithinKind(ms, 'f1', 'nope')).toBe(ms);
  });
});

describe('documentation tooltips', () => {
  it('orders the text as documentation reads, deprecation first', () => {
    const text = docTooltip({ summary: 'Fetches.', params: { id: 'The id.' }, returns: 'Text.', deprecated: 'Use B.' });
    expect(text.split('\n')).toEqual(['⚠ Deprecated: Use B.', 'Fetches.', 'Arguments:', '  • id — The id.', 'Returns: Text.']);
  });

  it('treats an all-empty doc as no doc', () => {
    expect(hasDoc({ summary: '', see: [] })).toBe(false);
    expect(hasDoc({ summary: 'x' })).toBe(true);
  });
});
