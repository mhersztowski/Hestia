/**
 * The codemap file: what `parseCodemap` accepts, what it refuses, that a
 * MyCastle `uml-project` v2 comes back as a codemap rather than an error — and
 * the history operations the editor relies on.
 */
import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import {
  CODEMAP_EXTENSION, branchLog, checkoutBranch, codemapFromDiagrams, commitCodemap, createBranch,
  createCodemap, hasUncommittedChanges, headCommit, parseCodemap, restoreCommit, stringifyCodemap,
} from './document.js';
import type { UmlDiagram } from './uml/umlTypes.js';

async function sample() {
  const model = await buildModel([{ file: 'src/a.ts', content: 'export class A { run(): void {} }' }]);
  return createCodemap(model, 'Sample', 'src');
}

describe('codemap document', () => {
  it('survives stringify → parse unchanged', async () => {
    const codemap = await sample();
    expect(parseCodemap(stringifyCodemap(codemap))).toEqual(codemap);
  });

  it('names the file with its own suffix', () => {
    expect(`core${CODEMAP_EXTENSION}`).toBe('core.codemap.json');
  });

  it('reads a MyCastle uml-project v2 as a codemap, keeping its outputs', async () => {
    const { type: _t, version: _v, ...rest } = await sample();
    const legacy = { ...rest, type: 'uml-project', version: 2, outputs: ['schema.json'] };
    const parsed = parseCodemap(JSON.stringify(legacy));
    expect(parsed.type).toBe('codemap');
    expect(parsed.version).toBe(1);
    expect(parsed.diagrams[0].nodes.map((n) => n.data.name)).toEqual(['A']);
    expect(parsed.outputs).toEqual(['schema.json']);
  });

  it('drops outputs that are not strings, and adds no field when there are none', async () => {
    const codemap = await sample();
    expect(parseCodemap(JSON.stringify({ ...codemap, outputs: ['a.d.ts', 42, null] })).outputs).toEqual(['a.d.ts']);
    expect('outputs' in parseCodemap(JSON.stringify(codemap))).toBe(false);
  });

  it('refuses other files, including the old single-diagram uml-scene', () => {
    expect(() => parseCodemap('{"type":"git-repo","version":1,"url":"x"}')).toThrow('expected type "codemap"');
    expect(() => parseCodemap('{"type":"uml-scene","nodes":[],"edges":[]}')).toThrow('expected type "codemap"');
    expect(() => parseCodemap('[]')).toThrow('not a JSON object');
  });

  it('refuses a codemap whose history has no tip for the current branch', async () => {
    const codemap = await sample();
    const broken = { ...codemap, history: { ...codemap.history, head: 'nowhere' } };
    expect(() => parseCodemap(JSON.stringify(broken))).toThrow('invalid "name", "diagrams" or "history"');
  });
});

const diagram = (name: string): UmlDiagram => ({ id: `d_${name}`, name, nodes: [], edges: [] });
const rename = (c: ReturnType<typeof codemapFromDiagrams>, name: string) => ({ ...c, diagrams: [diagram(name)] });

describe('codemap history', () => {
  it('starts with one commit on main that records the initial diagrams', () => {
    const c = codemapFromDiagrams('Drawn', [diagram('one')]);
    expect(c.history.head).toBe('main');
    expect(headCommit(c.history)?.snapshot.diagrams[0].name).toBe('one');
    expect(hasUncommittedChanges(c)).toBe(false);
  });

  it('sees an edit as uncommitted until it is committed', () => {
    const edited = rename(codemapFromDiagrams('Drawn', [diagram('one')]), 'two');
    expect(hasUncommittedChanges(edited)).toBe(true);
    const committed = commitCodemap(edited, 'rename');
    expect(hasUncommittedChanges(committed)).toBe(false);
    expect(branchLog(committed.history, 'main').map((x) => x.message)).toEqual(['rename', 'Start']);
  });

  it('a new branch starts at the current commit, and checkout brings back its state', () => {
    const base = codemapFromDiagrams('Drawn', [diagram('one')]);
    const branched = createBranch(base, 'try this');
    expect(branched.history.head).toBe('try-this');
    const onBranch = commitCodemap(rename(branched, 'experiment'), 'experiment');

    const back = checkoutBranch(onBranch, 'main');
    expect(back.history.head).toBe('main');
    expect(back.diagrams[0].name).toBe('one');
    expect(checkoutBranch(back, 'try-this').diagrams[0].name).toBe('experiment');
  });

  it('refuses a taken or empty branch name, and an unknown branch or commit', () => {
    const c = codemapFromDiagrams('Drawn', [diagram('one')]);
    expect(() => createBranch(c, 'main')).toThrow('already exists');
    expect(() => createBranch(c, '   ')).toThrow('needs a name');
    expect(() => checkoutBranch(c, 'nowhere')).toThrow('does not exist');
    expect(() => restoreCommit(c, 'c_nothing')).toThrow('does not exist');
  });

  it('restoring an old commit changes the working state, not the history', () => {
    const first = codemapFromDiagrams('Drawn', [diagram('one')]);
    const firstId = first.history.branches.main;
    const second = commitCodemap(rename(first, 'two'), 'two');
    const restored = restoreCommit(second, firstId);
    expect(restored.diagrams[0].name).toBe('one');
    expect(restored.history).toEqual(second.history);
    expect(hasUncommittedChanges(restored)).toBe(true);
  });

  it('a broken history yields the commits it can instead of looping', () => {
    const c = codemapFromDiagrams('Drawn', [diagram('one')]);
    const id = c.history.branches.main;
    const looped = { ...c.history, commits: { [id]: { ...c.history.commits[id], parents: [id] } } };
    expect(branchLog(looped, 'main')).toHaveLength(1);
  });
});
