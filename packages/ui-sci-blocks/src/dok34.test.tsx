import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const DOK = '3-4-predkosc-chwilowa.md';
const pliki = [DOK, '3-3-predkosc-srednia.md', 'Slownik.md']
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

describe('3-4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwa wzory numerowane, oba jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind]))
      .toEqual([['rh1-3-eq2', 'relation'], ['rh1-3-eq3', 'relation']]);
    for (const f of d!.formulas) expect(f.issues, f.id).toEqual([]);
  });

  /**
   * (3-3) przechodzi przez parser także BEZ `@relation` — zostaje wtedy zwykłą
   * definicją z wyrażeniem `|dr/dt|`, czyli silnik wziąłby różniczki za symbole
   * i policzył co innego, niż napisał autor. Ten test pilnuje, żeby deklaracja
   * rodzaju nie wypadła przy jakiejś późniejszej poprawce.
   */
  it('(3-3) bez @relation cicho staje się wyrażeniem do policzenia', () => {
    const bezRelacji = bodies[DOK].replace(/```formula:rh1-3-eq3\n@relation\n/, '```formula:rh1-3-eq3\n');
    const f = buildIndex([{ path: DOK, markdown: bezRelacji }]).documents[0]
      .formulas.find((x) => x.id === 'rh1-3-eq3')!;
    expect(f.kind).not.toBe('relation');
    expect(f.issues).toEqual([]); // nikt nie ostrzeże — dlatego deklarujemy jawnie
  });

  // Granica `v = lim Δr/Δt` jest w druku wyświetlona, ale nie ma numeru na
  // marginesie, więc nie ma z czego zrobić identyfikatora — zostaje LaTeX-em.
  it('wzór bez numeru nie dostaje identyfikatora', () => {
    expect(bodies[DOK]).toContain('$$\\mathbf{v} = \\lim_{\\Delta t \\to 0} \\frac{\\Delta\\mathbf{r}}{\\Delta t}.$$');
    expect(index.documents.find((x) => x.path === DOK)?.formulas).toHaveLength(2);
  });

  it('podrozdział nie ma własnego rysunku', () => {
    expect(index.documents.find((x) => x.path === DOK)?.figures ?? []).toHaveLength(0);
    expect(widok().container.querySelectorAll('img')).toHaveLength(0);
  });

  // Rys. 3-2 mieszka w 3-3 — odsyłacz przez granicę pliku jest sednem indeksu.
  it('odsyłacz do rys. 3-2 trafia do dokumentu 3-3', () => {
    const cel = resolveReference(
      'rh1-3-rys2', { anchors: index.anchors, formulaHome: index.formulaHome }, DOK,
    );
    expect(cel.found).toBe(true);
    expect(cel.sameDocument).toBe(false);
    expect(cel.path).toBe('3-3-predkosc-srednia.md');
    const { container } = widok();
    expect(container.textContent).toContain('na rys. 3-2a');
    expect(container.textContent).toContain('na rys. 3-2b');
  });

  // Odsyłacz idzie do zdania, które mówi, czym rzecz jest — nie do zapowiedzi.
  it('hasło „prędkość chwilowa" doczekało swojego podrozdziału', () => {
    expect(index.anchors.get('rh1-poj-predkosc-chwilowa')?.kind).toBe('term');
    expect(bodies[DOK]).toContain('((rh1-poj-predkosc-chwilowa|prędkością chwilową))');
    expect(bodies[DOK]).toContain('czyli\n*prędkości chwilowej*.');
  });

  // Skorowidz wiąże `ruch — jednowymiarowy` ze stroną 47, ale ta strona należy
  // już do 3-5 — hasło powstaje więc tam, choć zakres stron 3-4 też ją obejmuje.
  it('„ruch jednowymiarowy" należy do 3-5, nie tutaj', () => {
    expect(bodies[DOK]).not.toContain('rh1-poj-ruch-jednowymiarowy');
    expect(bodies['Slownik.md']).toMatch(/rh1-poj-ruch-jednowymiarowy[\s\S]*?@source 3-5/);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toMatch(/\$|```/);
  });
});
