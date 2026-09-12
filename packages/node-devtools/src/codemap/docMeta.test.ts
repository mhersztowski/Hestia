/**
 * Tests for carrying TSDoc documentation over from code into UML.
 *
 * The point: after clicking "From code", the descriptions of classes, methods
 * and arguments should be visible in the UML editor as metadata — without
 * opening the sources.
 */
import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import { createCodemap } from './document.js';
import { diagramToModel } from './uml/umlToModel.js';

const SRC = `
/**
 * Backend REST client.
 *
 * Keeps a single connection and retries requests.
 * @see https://example.test/docs
 */
export class Api {
  /** Base address. */
  baseUrl: string;

  /**
   * Fetches a resource by its identifier.
   *
   * The result is cached for the session.
   * @param id Resource identifier.
   * @param retries Number of retries on a network error.
   * @returns The resource contents as text.
   * @example
   * const t = await Api.fetchOne('42');
   * @deprecated Use fetchMany.
   */
  static async fetchOne(id: string, retries: number): Promise<string> { return id; }

  noDocs(): void {}
}

/** Formats a date as ISO. @param d Input date. */
export function formatDate(d: Date): string { return d.toISOString(); }
`;

async function model() {
  return buildModel([{ file: 'src/api.ts', content: SRC, language: 'typescript' }]);
}

describe('TS parser — TSDoc', () => {
  it('reads the class description: first paragraph as the summary, the rest as remarks', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    expect(api.doc?.summary).toBe('Backend REST client.');
    expect(api.doc?.remarks).toContain('Keeps a single connection');
    expect(api.doc?.see).toEqual(['https://example.test/docs']);
  });

  it('reads argument descriptions by name', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    const fetchOne = api.members.find((m) => m.name === 'fetchOne')!;
    expect(fetchOne.doc?.params).toEqual({
      id: 'Resource identifier.',
      retries: 'Number of retries on a network error.',
    });
  });

  it('reads returns, example and deprecated', async () => {
    const fetchOne = (await model()).symbols
      .find((s) => s.name === 'Api')!.members.find((m) => m.name === 'fetchOne')!;
    expect(fetchOne.doc?.returns).toBe('The resource contents as text.');
    expect(fetchOne.doc?.examples?.[0]).toContain("Api.fetchOne('42')");
    expect(fetchOne.doc?.deprecated).toBe('Use fetchMany.');
  });

  it('an element without a comment does not get an empty object', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    expect(api.members.find((m) => m.name === 'noDocs')?.doc).toBeUndefined();
  });

  it('documents fields and module-level functions too', async () => {
    const symbols = (await model()).symbols;
    expect(symbols.find((s) => s.name === 'Api')!.members.find((m) => m.name === 'baseUrl')?.doc?.summary)
      .toBe('Base address.');
    const mod = symbols.find((s) => s.kind === 'module')!;
    const fn = mod.members.find((m) => m.name === 'formatDate')!;
    expect(fn.doc?.summary).toBe('Formats a date as ISO.');
    expect(fn.doc?.params).toEqual({ d: 'Input date.' });
  });
});

describe('UML — documentation metadata', () => {
  it('a node and its members carry doc after "From code"', async () => {
    const codemap = createCodemap(await model(), 'Api', 'src');
    const node = codemap.diagrams[0].nodes.find((n) => n.data.name === 'Api')!;
    expect(node.data.doc?.summary).toBe('Backend REST client.');

    const member = node.data.members.find((m) => m.text.includes('fetchOne('))!;
    expect(member.doc?.params?.id).toBe('Resource identifier.');
    expect(member.doc?.returns).toBe('The resource contents as text.');
  });

  it('a member without documentation has no doc field (a smaller codemap file)', async () => {
    const codemap = createCodemap(await model(), 'Api', 'src');
    const node = codemap.diagrams[0].nodes.find((n) => n.data.name === 'Api')!;
    expect(node.data.members.find((m) => m.text.includes('noDocs('))?.doc).toBeUndefined();
  });

  it('documentation survives the way back UML → code model (regeneration)', async () => {
    const codemap = createCodemap(await model(), 'Api', 'src');
    const back = diagramToModel(codemap.diagrams[0], 'typescript');
    const api = back.symbols.find((s) => s.name === 'Api')!;
    expect(api.doc?.summary).toBe('Backend REST client.');
    expect(api.members.find((m) => m.name === 'fetchOne')?.doc?.returns).toBe('The resource contents as text.');
  });
});
