/**
 * The provider the code editor reads through.
 *
 * Two applications have to agree on the wire here, and every mismatch so far
 * has been silent: a listing that came back empty, a file that came back as
 * `undefined`. None of them failed — they just showed nothing, which on screen
 * is indistinguishable from an empty file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { platformProvider } from './fsProvider';

function answerWith(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })));
}

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

afterEach(() => vi.unstubAllGlobals());

describe('reading a file for the editor', () => {
  it('decodes what readFile sends', async () => {
    answerWith({ data: base64('const a = 1;\n') });

    const bytes = await platformProvider().readFile('/notes.ts');
    expect(new TextDecoder().decode(bytes)).toBe('const a = 1;\n');
  });

  /** Polish text through base64 is where a byte-vs-character slip shows up. */
  it('survives non-ASCII', async () => {
    answerWith({ data: base64('# Zażółć gęślą jaźń\n') });

    const bytes = await platformProvider().readFile('/notatka.md');
    expect(new TextDecoder().decode(bytes)).toBe('# Zażółć gęślą jaźń\n');
  });

  it('an empty file is empty, not a failure', async () => {
    answerWith({ data: '' });
    expect((await platformProvider().readFile('/pusty.txt')).byteLength).toBe(0);
  });
});

describe('listing a directory for the editor', () => {
  it('tells a directory from a file', async () => {
    answerWith({ entries: [{ name: 'src', type: 2 }, { name: 'index.ts', type: 1 }] });

    expect(await platformProvider().readDirectory('/')).toEqual([
      { name: 'src', type: 2 },
      { name: 'index.ts', type: 1 },
    ]);
  });
});
