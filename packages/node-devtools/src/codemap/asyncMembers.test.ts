/**
 * `async` methods must be recognisable in the model and on the diagram —
 * otherwise the UML does not show which calls are asynchronous, and that is one
 * of the more important things to know when reading someone else's code.
 */
import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import { createCodemap } from './document.js';
import { parseMemberText, renderMember } from './model/render.js';

const SRC = `
export class Api {
  sync(): number { return 1; }
  async fetchOne(id: string): Promise<string> { return id; }
  static async loadAll(): Promise<string[]> { return []; }
  private async retry(): Promise<void> {}
}

export async function topLevel(): Promise<void> {}
export function plain(): void {}
`;

async function model() {
  return buildModel([{ file: 'src/api.ts', content: SRC, language: 'typescript' }]);
}

describe('async methods', () => {
  it('flags async methods and leaves ordinary ones without the flag', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    const byName = (n: string) => api.members.find((m) => m.name === n)!;

    expect(byName('fetchOne').isAsync).toBe(true);
    expect(byName('loadAll').isAsync).toBe(true);
    expect(byName('retry').isAsync).toBe(true);
    expect(byName('sync').isAsync).toBeFalsy();
  });

  it('flags module-level functions too', async () => {
    const mod = (await model()).symbols.find((s) => s.kind === 'module')!;
    expect(mod.members.find((m) => m.name === 'topLevel')?.isAsync).toBe(true);
    expect(mod.members.find((m) => m.name === 'plain')?.isAsync).toBeFalsy();
  });

  it('the UML line contains the word async (after static)', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    expect(api.members.find((m) => m.name === 'fetchOne')!.text).toContain('async fetchOne');
    expect(api.members.find((m) => m.name === 'loadAll')!.text).toContain('static async loadAll');
  });

  it('diagram nodes get the "async" category', async () => {
    const codemap = createCodemap(await model(), 'Api', 'src');
    const node = codemap.diagrams[0].nodes.find((n) => n.data.name === 'Api')!;
    const cat = (n: string) => node.data.members.find((m) => m.text.includes(`${n}(`))?.category;

    expect(cat('fetchOne')).toBe('async');
    expect(cat('sync')).toBeUndefined();
  });

  it('the line text can be read back (round-trip for codegen)', () => {
    const line = renderMember({
      kind: 'method',
      name: 'fetchOne',
      visibility: 'public',
      isAsync: true,
      type: 'Promise<string>',
      params: [{ name: 'id', type: 'string' }],
    });
    const parsed = parseMemberText(line);
    expect(parsed.name).toBe('fetchOne');
    expect(parsed.isAsync).toBe(true);
    expect(parsed.type).toBe('Promise<string>');
  });
});

describe('code generation from a diagram', () => {
  it('keeps `async` on the way code → UML → code (TypeScript)', async () => {
    const { generateCode } = await import('./codegen/index.js');
    const { diagramToModel } = await import('./uml/umlToModel.js');
    const codemap = createCodemap(await model(), 'Api', 'src');
    const back = diagramToModel(codemap.diagrams[0], 'typescript');
    const files = generateCode(back, 'typescript');
    const code = files.map((f) => f.content).join('\n');

    expect(code).toContain('async fetchOne(');
    expect(code).toContain('static async loadAll(');
    expect(code).toMatch(/\n\s+sync\(/); // an ordinary method, no async
  });
});
