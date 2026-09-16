import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['3-1-mechanika.md', 'Slownik.md'].map((p) => ({
  path: p,
  markdown: readDocument(p),
}));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '3-1-mechanika.md'
  );
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(
    <ReaderView
      markdown={bodies['3-1-mechanika.md']}
      path="3-1-mechanika.md"
      resolveRef={resolveRef}
    />
  );

describe('3-1 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('podrozdział bez wzorów i rysunków', () => {
    const d = index.documents.find((x) => x.path === '3-1-mechanika.md');
    expect(d?.formulas).toHaveLength(0);
    expect(d?.figures).toHaveLength(0);
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('dwa nowe hasła, oba z odsyłaczem', () => {
    for (const id of ['rh1-poj-kinematyka', 'rh1-poj-dynamika']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
      expect(bodies['3-1-mechanika.md'], id).toContain(`((${id}|`);
    }
  });

  it('sekcja rozdziału 3 stoi między rozdziałem 2 a 15', () => {
    const s = bodies['Slownik.md'];
    expect(s.indexOf('## Rozdział 2. Wektory')).toBeLessThan(
      s.indexOf('## Rozdział 3. Ruch jednowymiarowy')
    );
    expect(s.indexOf('## Rozdział 3. Ruch jednowymiarowy')).toBeLessThan(
      s.indexOf('## Rozdział 15. Drgania')
    );
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
  });
});
