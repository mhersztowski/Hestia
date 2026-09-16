import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { JsonStore } from './JsonStore';

const Schema = z.object({ count: z.number().default(0), items: z.array(z.string()).default([]) });

describe('JsonStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hestia-'));
    file = join(dir, 'data.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a missing file yields the initial value rather than an exception', async () => {
    const store = new JsonStore(file, Schema, () => ({ count: 7, items: [] }));
    expect((await store.read()).count).toBe(7);
  });

  it('writes and reads back through a new instance', async () => {
    const store = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    await store.write({ count: 3, items: ['a'] });
    const other = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    expect(await other.read()).toEqual({ count: 3, items: ['a'] });
  });

  it('the write is atomic — it leaves no temporary file behind', async () => {
    const store = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    await store.write({ count: 1, items: [] });
    // An in-place write cut in half (power loss, full disk) leaves a file
    // with half a JSON document, i.e. an unreadable store. Hence writing to
    // a sibling file and renaming — but the sibling must not survive.
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  it('damaged contents do not erase the data silently', async () => {
    writeFileSync(file, '{ this is not json');
    const store = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    await expect(store.read()).rejects.toThrow(/data\.json/);
    // The file is left untouched — fixing it by hand is then possible.
    expect(readFileSync(file, 'utf8')).toBe('{ this is not json');
  });

  it('contents that do not match the schema are an error too, not a silent fill-in', async () => {
    writeFileSync(file, JSON.stringify({ count: 'many' }));
    const store = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    await expect(store.read()).rejects.toThrow();
  });

  it('update reads, changes and writes in one step', async () => {
    const store = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    const result = await store.update((d) => ({ ...d, count: d.count + 5 }));
    expect(result.count).toBe(5);
    expect((await store.read()).count).toBe(5);
  });

  it('concurrent changes do not lose one another', async () => {
    // Without queueing both operations read the same initial value and the
    // second overwrites the result of the first — the classic lost update.
    const store = new JsonStore(file, Schema, () => ({ count: 0, items: [] }));
    await Promise.all([
      store.update((d) => ({ ...d, count: d.count + 1 })),
      store.update((d) => ({ ...d, count: d.count + 1 })),
      store.update((d) => ({ ...d, count: d.count + 1 })),
    ]);
    expect((await store.read()).count).toBe(3);
  });
});
