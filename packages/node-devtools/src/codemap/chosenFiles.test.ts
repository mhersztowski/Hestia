/**
 * Tests for choosing SPECIFIC files as the source of a diagram (next to the
 * directory scan). The point of this path: the diagram should show the chosen
 * classes, not everything that lives in the module — so the tests check that
 * the rest of the directory really stays out of the model.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodemapService } from './CodemapService.js';

let dir = '';
const svc = new CodemapService();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'uml-files-'));
  await mkdir(path.join(dir, 'src'), { recursive: true });
  await writeFile(path.join(dir, 'src/alpha.ts'), 'export class Alpha { run(): void {} }\n');
  await writeFile(path.join(dir, 'src/beta.ts'), 'export class Beta { stop(): void {} }\n');
  await writeFile(path.join(dir, 'src/notes.md'), '# not code\n');
});

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('CodemapService — chosen files', () => {
  it('takes only the given files and skips the rest of the directory', async () => {
    const model = await svc.parseFiles(['src/alpha.ts'], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name)).toEqual(['Alpha']);
  });

  it('several files make a single model', async () => {
    const model = await svc.parseFiles(['src/alpha.ts', 'src/beta.ts'], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('skips unreadable files and files in an unsupported language', async () => {
    const model = await svc.parseFiles(['src/alpha.ts', 'src/notes.md', 'src/missing.ts'], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name)).toEqual(['Alpha']);
  });

  it('absolute paths work the same as relative ones', async () => {
    const model = await svc.parseFiles([path.join(dir, 'src/beta.ts')], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name)).toEqual(['Beta']);
  });

  it('creates a codemap from the chosen files', async () => {
    const codemap = await svc.createFromFiles(['src/alpha.ts'], dir, 'Chosen', { relativeTo: dir });
    expect(codemap.type).toBe('codemap');
    expect(codemap.diagrams[0].nodes.map((n) => n.data.name)).toEqual(['Alpha']);
  });

  it('an update adds the symbols from a new set of files', async () => {
    const codemap = await svc.createFromFiles(['src/alpha.ts'], dir, 'Chosen', { relativeTo: dir });
    const res = await svc.updateFromFiles(codemap, ['src/beta.ts'], dir, { relativeTo: dir });

    // A disjoint set of symbols lands in a NEW diagram — that is how `applyModel`
    // picks the target diagram (shared with the directory path): an update
    // overwrites only the diagram in which those symbols already were.
    const all = res.codemap.diagrams.flatMap((d) => d.nodes.map((n) => n.data.name));
    expect(all.sort()).toEqual(['Alpha', 'Beta']);
    expect(res.changes.length).toBeGreaterThan(0);
  });

  it('re-syncing the same files updates the existing diagram', async () => {
    const codemap = await svc.createFromFiles(['src/alpha.ts'], dir, 'Chosen', { relativeTo: dir });
    const res = await svc.updateFromFiles(codemap, ['src/alpha.ts'], dir, { relativeTo: dir });
    expect(res.codemap.diagrams).toHaveLength(1);
    expect(res.codemap.diagrams[0].nodes.map((n) => n.data.name)).toEqual(['Alpha']);
  });
});
