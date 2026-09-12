import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = [
  '15-5-zastosowania.md', 'Slownik.md',
  '15-1-ruch-harmoniczny.md', '15-2-oscylator.md', '15-3-ruch-prosty.md', '15-4-energia.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-5-zastosowania.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-5-zastosowania.md']} path="15-5-zastosowania.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '15-5-zastosowania.md');

describe('15-5 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dziewięć wzorów z kotwicami, w tym trzy równania bez przypisania', () => {
    const { container } = widok();
    for (let n = 19; n <= 27; n += 1) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
    const rodzaje = Object.fromEntries((dokument()?.formulas ?? []).map((f) => [f.id, f.kind]));
    expect(rodzaje['rh1-15-eq19']).toBe('relation');
    expect(rodzaje['rh1-15-eq20']).toBe('relation');
    expect(rodzaje['rh1-15-eq22']).toBe('relation');
    expect(rodzaje['rh1-15-eq21']).toBe('definition');
    expect(rodzaje['rh1-15-eq24']).toBe('definition');
  });

  it('moment kierujący niesie wariant greckiej litery z druku', () => {
    // `\varkappa`, nie `\kappa` — do 15-5 wariant znikał w parserze.
    const eq21 = dokument()?.formulas.find((f) => f.id === 'rh1-15-eq21');
    expect(eq21?.expression).toContain('\\varkappa');
    expect(Object.keys(eq21?.vars ?? {})).toContain('kappaSymbol');
    expect(eq21?.issues).toEqual([]);
  });

  it('cztery rysunki na miejscu, wszystkie ze skanu', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(4);
    for (const n of [10, 11, 12, 13]) {
      expect(container.querySelector(`#ref-rh1-15-rys${n} img`), `rys ${n}`).toBeTruthy();
    }
  });

  it('tabela z przypisu składa się razem z matematyką w nagłówku', () => {
    const { container } = widok();
    const tabela = container.querySelector('#ref-rh1-15-tab-sinus');
    expect(tabela).toBeTruthy();
    expect(tabela?.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(tabela?.querySelectorAll('th .katex').length).toBe(2);
  });

  it('odsyłacze wychodzą do 15-3, a paragraf 12-7 czeka na swój rozdział', () => {
    expect(index.anchors.get('rh1-15-eq7')?.path).toBe('15-3-ruch-prosty.md');
    expect(index.anchors.get('rh1-15-eq10')?.path).toBe('15-3-ruch-prosty.md');
    // 12-7 rozwiązuje się w pełnej bazie (rusztowanie ma 183 podrozdziały);
    // tutaj indeks obejmuje sam rozdział 15, więc sprawdzamy tylko zapis.
    expect(bodies['15-5-zastosowania.md']).toContain('((rh1-sec-12-7|§ 12-7))');
  });

  it('nowe hasła słownika pochodzą ze skorowidza', () => {
    for (const id of [
      'rh1-poj-wahadlo-proste',
      'rh1-poj-wahadlo-torsyjne',
      'rh1-poj-wahadlo-fizyczne',
      'rh1-poj-moment-kierujacy',
    ]) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });

  it('uwagi redakcyjne są kompletne, a nie urwane na pierwszym wierszu', () => {
    const { container } = widok();
    expect(container.textContent).toContain('a szereg wymaga tu');
  });
});
