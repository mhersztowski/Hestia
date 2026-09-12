import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const DOK = '3-7-przyspieszenie-zmienne.md';
const pliki = [DOK, '3-5-predkosc-zmienna.md', '3-6-przyspieszenie.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />,
);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

describe('3-7 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwa wzory numerowane, oba jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind]))
      .toEqual([['rh1-3-eq10', 'relation'], ['rh1-3-eq11', 'relation']]);
    for (const f of d!.formulas) expect(f.issues, f.id).toEqual([]);
  });

  /**
   * Sedno tego podrozdziału w bazie: podpis rys. 3-3 stoi w 3-5 i przywołuje
   * (3-10), którego wtedy nie było. Po przeniesieniu 3-7 odsyłacz z dokumentu
   * przeniesionego **wcześniej** trafia w blok przeniesiony **później** — to
   * jedyny sprawdzian tego, po co w ogóle są identyfikatory.
   */
  it('odsyłacz z 3-5 zamyka się wstecz na (3-10) w 3-7', () => {
    expect(bodies['3-5-predkosc-zmienna.md']).toContain('(((rh1-3-eq10|3-10)))');
    const cel = resolveReference(
      'rh1-3-eq10', { anchors: index.anchors, formulaHome: index.formulaHome },
      '3-5-predkosc-zmienna.md',
    );
    expect(cel.found).toBe(true);
    expect(cel.path).toBe(DOK);
    expect(cel.sameDocument).toBe(false);
  });

  // Podrozdział nie ma własnych rysunków — wszystkie sześć odesłań sięga do 3-5.
  it('nie ma własnych rysunków, a odesłania trafiają do 3-5', () => {
    expect(index.documents.find((x) => x.path === DOK)?.figures ?? []).toHaveLength(0);
    expect(widok().container.querySelectorAll('img')).toHaveLength(0);
    for (const id of ['rh1-3-rys3', 'rh1-3-rys5']) {
      const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
      expect(cel.path, id).toBe('3-5-predkosc-zmienna.md');
    }
  });

  it('odsyłacz do (3-9) sięga poprzedniego podrozdziału', () => {
    const cel = resolveReference(
      'rh1-3-eq9', { anchors: index.anchors, formulaHome: index.formulaHome }, DOK,
    );
    expect(cel.path).toBe('3-6-przyspieszenie.md');
  });

  // Skorowidz nie daje dla s. 51–52 nic nowego: podrozdział przekłada wzory
  // z 3-5 z prędkości na przyspieszenie i nie wprowadza słownictwa.
  it('nie wprowadza haseł ani odsyłaczy do pojęć', () => {
    expect(bodies[DOK]).not.toContain('((rh1-poj-');
  });

  /**
   * Gwiazdka przypisu musi zostać gwiazdką. Bez ucieczki markdown otwierał nią
   * kursywę, która połykała resztę akapitu razem z odsyłaczami — to była jedna
   * z pierwszych usterek czytnika, wykryta przy 15-1.
   */
  it('przypis zostaje przypisem, a nie kursywą', () => {
    const t = tekst();
    // KaTeX dubluje wzór w `textContent` (MathML + HTML), więc porównujemy sam
    // odnośnik razem z otoczeniem tekstowym, a nie całą frazę.
    expect(t).toContain(' * w dowolnej chwili czasu');
    expect(t).toContain('Podobnie jak w przypadku prędkości');
    expect(t).not.toContain('\\*');
  });

  it('wzór bez numeru zostaje zwykłym LaTeX-em', () => {
    const display = bodies[DOK].match(/^\$\$.*\$\$$/gm) ?? [];
    expect(display).toHaveLength(1);
    expect(display[0]).toContain('\\frac{\\mathrm{d}\\mathbf{v}}{\\mathrm{d}t}');
    expect(index.documents.find((x) => x.path === DOK)?.formulas).toHaveLength(2);
  });

  it('nawiasy druku wokół odsyłaczy przetrwały', () => {
    const t = tekst();
    expect(t).toContain('równań (3-5) i (3-9)');
    expect(t).toContain('patrz rys. 3-3c');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
