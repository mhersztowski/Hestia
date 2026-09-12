import { describe, it, expect } from 'vitest';
import type { UmlDiagram } from '@hestia/node-devtools/format';
import { buildDiff, diffMembers, memberName } from './diff';

const m = (id: string, text: string, kind: 'field' | 'method' = 'method') => ({ id, kind, text });

describe('member diff', () => {
  it('reads the bare name out of a UML line', () => {
    expect(memberName('+ static fetch(id: string): Text')).toBe('fetch');
    expect(memberName('- count: number')).toBe('count');
  });

  it('a changed signature under a new id is "modified", not remove + add', () => {
    const out = diffMembers([m('a', '+ func2(arg1: number): void')], [m('b', '+ func2(arg1: number, arg2: string): void')]);
    expect(out.map((x) => [x.status, x.oldText])).toEqual([['modified', '+ func2(arg1: number): void']]);
  });

  it('the same text under a new id is unchanged', () => {
    expect(diffMembers([m('a', '+ go(): void')], [m('b', '+ go(): void')]).map((x) => x.status)).toEqual(['unchanged']);
  });
});

describe('diagram diff', () => {
  const node = (id: string, name: string, members: ReturnType<typeof m>[]) => ({ id, type: 'umlClass' as const, position: { x: 0, y: 0 }, data: { kind: 'class' as const, name, members } });
  const edge = (id: string) => ({ id, source: 'a', target: 'b', type: 'uml' as const, data: { relType: 'association' as const } });
  const base: UmlDiagram = { id: 'd', name: 'D', nodes: [node('a', 'A', [m('1', '+ x(): void')]), node('b', 'B', [])], edges: [edge('e1')] };
  const target: UmlDiagram = { id: 'd', name: 'D', nodes: [node('a', 'A2', [m('1', '+ x(): void'), m('2', '+ y(): void')]), node('c', 'C', [])], edges: [edge('e2')] };

  it('marks classes, members and relations, and counts them', () => {
    const { nodes, edges, counts } = buildDiff(base, target);
    const status = Object.fromEntries(nodes.map((n) => [n.id, n.data.status]));
    expect(status).toEqual({ a: 'modified', b: 'removed', c: 'added' });
    expect(nodes.find((n) => n.id === 'a')?.data.oldName).toBe('A');
    expect(Object.fromEntries(edges.map((e) => [e.id, e.data?.status]))).toEqual({ e1: 'removed', e2: 'added' });
    expect(counts).toEqual({ cls: [1, 1, 1], mem: [1, 0, 0], rel: [1, 1] });
  });

  it('a diagram compared with nothing is all added', () => {
    expect(buildDiff(undefined, target).nodes.every((n) => n.data.status === 'added')).toBe(true);
  });
});
