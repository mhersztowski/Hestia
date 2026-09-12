import { describe, it, expect } from 'vitest';
import { stringifyCodemap } from '@hestia/node-devtools/format';
import {
  codemapDisplayName, codemapFileName, listCodemaps, pathIn, readCodemap, renameCodemapFile, sortEntries, writeCodemap,
} from './store';
import { newCodemap } from './model';
import { memoryStore } from './testStore';

describe('codemap file names', () => {
  it('adds the extension once and drops old suffixes', () => {
    expect(codemapFileName('core')).toBe('core.codemap.json');
    expect(codemapFileName('core.codemap.json')).toBe('core.codemap.json');
    expect(codemapFileName('core.json')).toBe('core.codemap.json');
    expect(codemapFileName('core.umlproj.json')).toBe('core.codemap.json');
    expect(codemapFileName('a/b\\c')).toBe('a-b-c.codemap.json');
    expect(codemapFileName('   ')).toBe('codemap.codemap.json');
  });

  it('shows a name without the extension', () => {
    expect(codemapDisplayName('core.codemap.json')).toBe('core');
    expect(codemapDisplayName('notes.txt')).toBe('notes.txt');
  });

  it('joins paths without double slashes and sorts directories first', () => {
    expect(pathIn('a/b/', 'c')).toBe('a/b/c');
    expect(pathIn('', 'c')).toBe('c');
    expect(sortEntries([{ name: 'b', directory: false }, { name: 'z', directory: true }, { name: 'a', directory: false }]).map((e) => e.name))
      .toEqual(['z', 'a', 'b']);
  });
});

describe('reading and writing codemaps through a store', () => {
  it('lists only codemap files in the codemap directory', async () => {
    const store = memoryStore({
      'devtools/codemaps/b.codemap.json': '{}',
      'devtools/codemaps/a.codemap.json': '{}',
      'devtools/codemaps/old.umlproj.json': '{}',
      'devtools/codemaps/sub/c.codemap.json': '{}',
      'elsewhere/d.codemap.json': '{}',
    });
    expect(await listCodemaps(store)).toEqual(['a.codemap.json', 'b.codemap.json']);
  });

  it('writes and reads back the same codemap', async () => {
    const store = memoryStore();
    const c = newCodemap('Zoo', true);
    await writeCodemap(store, 'zoo.codemap.json', c);
    const back = await readCodemap(store, 'zoo.codemap.json');
    expect(back.name).toBe('Zoo');
    expect(back.diagrams[0].nodes.map((n) => n.data.name)).toEqual(['Animal', 'Dog', 'Owner']);
  });

  it('reads a MyCastle uml-project v2 saved under the new name', async () => {
    const c = newCodemap('Old', true);
    const legacy = { ...JSON.parse(stringifyCodemap(c)), type: 'uml-project', version: 2, outputs: ['drive/Model.d.ts'] };
    const store = memoryStore({ 'devtools/codemaps/old.codemap.json': JSON.stringify(legacy) });
    const back = await readCodemap(store, 'old.codemap.json');
    expect(back.type).toBe('codemap');
    expect(back.outputs).toEqual(['drive/Model.d.ts']);
  });

  it('refuses a file that is not a codemap', async () => {
    const store = memoryStore({ 'devtools/codemaps/x.codemap.json': '{"type":"notes"}' });
    await expect(readCodemap(store, 'x.codemap.json')).rejects.toThrow('expected type "codemap"');
  });
});

describe('renaming a codemap file', () => {
  const content = newCodemap('New', false);

  it('uses the store rename when there is one', async () => {
    const store = memoryStore({ 'devtools/codemaps/old.codemap.json': '{}' }, { rename: true });
    await renameCodemapFile(store, 'old.codemap.json', 'new.codemap.json', content);
    expect([...store.files.keys()]).toEqual(['devtools/codemaps/new.codemap.json']);
  });

  it('otherwise writes the new file and removes the old one', async () => {
    const store = memoryStore({ 'devtools/codemaps/old.codemap.json': '{}' }, { remove: true });
    await renameCodemapFile(store, 'old.codemap.json', 'new.codemap.json', content);
    expect([...store.files.keys()]).toEqual(['devtools/codemaps/new.codemap.json']);
  });

  it('says which file is current when the old one cannot be removed', async () => {
    const store = memoryStore({ 'devtools/codemaps/old.codemap.json': '{}' }, { remove: 'fails' });
    await expect(renameCodemapFile(store, 'old.codemap.json', 'new.codemap.json', content))
      .rejects.toThrow('new.codemap.json is the current one');
    expect(store.files.has('devtools/codemaps/new.codemap.json')).toBe(true);
  });

  it('refuses when the store can neither rename nor remove', async () => {
    const store = memoryStore({}, {});
    await expect(renameCodemapFile(store, 'a.codemap.json', 'b.codemap.json', content)).rejects.toThrow('neither rename nor remove');
    expect(store.files.size).toBe(0);
  });
});
