import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['2-5-prawa.md', '2-1-wektory.md', '2-2-dodawanie.md', '2-3-skladowe.md',
  '2-4-mnozenie.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '2-5-prawa.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['2-5-prawa.md']} path="2-5-prawa.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '2-5-prawa.md');

describe('2-5 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('trzy wzory, wszystkie relacje — nic nie wchodzi do grafu', () => {
    const { container } = widok();
    for (const n of [13, 14, 15]) {
      expect(container.querySelector(`#ref-rh1-2-eq${n}`), `eq${n}`).toBeTruthy();
    }
    for (const f of dokument()?.formulas ?? []) {
      expect(f.kind, f.id).toBe('relation');
      expect(f.issues, f.id).toEqual([]);
    }
  });

  it('primy stoją w indeksach, nie przy nazwach wielkości', () => {
    const eq15 = dokument()?.formulas.find((f) => f.id === 'rh1-2-eq15');
    expect(eq15?.latex).toContain("r_{x'}");
    expect(eq15?.latex).not.toMatch(/r'\s*=/);
  });

  it('trzy nowe hasła, żadne bez odsyłacza z tekstu', () => {
    for (const id of ['rh1-poj-niezmienniczosc', 'rh1-poj-translacja-ukladu', 'rh1-poj-symetria-praw']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
    expect(bodies['2-5-prawa.md']).not.toContain('((rh1-poj-');
  });

  it('odsyłacz do (2-10) sięga do 2-3', () => {
    expect(index.anchors.get('rh1-2-eq10a')?.path).toBe('2-3-skladowe.md');
  });

  it('rozdział 2 ma komplet wzorów 2-1…2-15 i rysunków 2-1…2-14', () => {
    for (const id of ['1','2','3','4','5','6a','6b','7','8a','8b','9','10a','10b','11','12','13','14','15']) {
      expect(index.anchors.has(`rh1-2-eq${id}`), `eq${id}`).toBe(true);
    }
    for (let n = 1; n <= 14; n += 1) {
      expect(index.anchors.has(`rh1-2-rys${n}`), `rys${n}`).toBe(true);
    }
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
