import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-2-stale-przyspieszenie.md';
const pliki = [DOK, '4-1-przemieszczenie.md', '3-8-przyspieszenie-stale.md', 'Slownik.md'].map(
  (p) => ({ path: p, markdown: readDocument(p) })
);
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const cel = (id: string) =>
  resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
const resolveRef = (id: string) => {
  const c = cel(id);
  if (!c.found || !c.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${c.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[c.path] ?? ''
  );
  return { code: m?.[1], kind: c.kind, sameDocument: c.sameDocument };
};
const widok = () =>
  render(<ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');
const wyklad = () => bodies[DOK].split('## Uwagi redakcyjne')[0];

describe('4-2 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwa wzory numerowane, oba jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-4-eq5a', 'relation'],
      ['rh1-4-eq5b', 'relation'],
    ]);
    expect(d!.formulas.flatMap((f) => f.issues)).toEqual([]);
    expect(resolveRef('rh1-4-eq5a')?.code).toContain('\\mathbf{v} = \\mathbf{v}_0+\\mathbf{a}t');
    expect(resolveRef('rh1-4-eq5b')?.code).toContain(
      '\\mathbf{r} = \\mathbf{r}_0+\\mathbf{v}_0 t+\\tfrac{1}{2}\\mathbf{a}t^2,'
    );
    for (const n of ['(4-5a)', '(4-5b)']) expect(tekst()).toContain(n);
  });

  /**
   * Równania (4-4a)…(4-4d′) nie są nigdzie wydrukowane osobno — istnieją tylko
   * jako wiersze tablicy, a tekst odsyła do nich po numerze. Celem odsyłacza
   * jest więc tablica, a numer siedzi w jego podpisie; tak samo jak litera
   * panelu przy rysunku złożonym z jednego skanu.
   */
  it('numer równania z tablicy odsyła do tablicy, bo własnego bloku nie ma', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.tables.map((t) => t.id)).toEqual(['rh1-4-tab1']);
    expect(cel('rh1-4-tab1').sameDocument).toBe(true);
    for (const numer of ['4-4a', '4-4a′', '4-4c', '4-4c′']) {
      expect(wyklad(), numer).toContain(`((rh1-4-tab1|${numer}))`);
    }
    // Żaden z tych numerów nie dostał własnego bloku formula.
    expect(d?.formulas.map((f) => f.id)).not.toContain('rh1-4-eq4a');
    // Prim z druku musi przeżyć podpis odsyłacza — inaczej „4-4a′" czytałoby się jak „4-4a".
    expect(tekst()).toContain('podstawiając równania (4-4a) i (4-4a′) do równania (4-2)');
  });

  /**
   * Obie usterki siedzą w wierszu „b" i obie zostają. Druga rozstrzygnięta
   * porównaniem kroju znaku: indeks przy $v_{y0}$ ma ogonek pod linią, przy
   * drugim składniku go nie ma.
   */
  it('dwie usterki druku w tablicy przetrwały', () => {
    const tab = resolveRef('rh1-4-tab1')?.code ?? '';
    expect(tab).toContain('$x = v_0+\\tfrac{1}{2}(v_{x0}+v_x)t$'); // ma być x_0
    expect(tab).toContain('$y = y_0+\\tfrac{1}{2}(v_{y0}+v_v)t$'); // ma być v_y
    // Pozostałe sześć równań jest bez zarzutu — wiersze c i d zgodne z (3-15) i (3-16).
    expect(tab).toContain('$x = x_0+v_{x0}t+\\tfrac{1}{2}a_x t^2$');
    expect(tab).toContain('$v_y^2 = v_{y0}^2+2a_y(y-y_0)$');
  });

  it('tablica ma cztery kolumny i składa symbole w nagłówku', () => {
    const { container } = widok();
    const naglowki = [...container.querySelectorAll('th')].map((th) => th.textContent);
    expect(naglowki).toHaveLength(4);
    expect(naglowki[0]).toContain('Numer równania');
    expect(naglowki[2]).toContain('Numer równania');
    expect(naglowki.join(' ')).not.toContain('$');
    expect(tekst()).toContain('Tablica 4-1.');
  });

  it('sięga po tablicę 3-1 i po wzory z 4-1', () => {
    expect(cel('rh1-3-tab1').path).toBe('3-8-przyspieszenie-stale.md');
    expect(cel('rh1-4-eq2').path).toBe('4-1-przemieszczenie.md');
    expect(cel('rh1-4-eq3').path).toBe('4-1-przemieszczenie.md');
  });

  /**
   * Skorowidz wiąże ze stronami 69–70 tylko `rzut ukośny 70 i n.`, a to hasło
   * należy do 4-3. Podrozdział bez haseł jest stanem poprawnym, nie brakiem.
   */
  it('nie stawia haseł, bo skorowidz nie wskazuje tych stron', () => {
    expect(bodies['Slownik.md']).not.toContain('@source 4-2');
    expect(wyklad()).not.toContain('rh1-poj-');
  });

  it('odsyłacz do zadania zostaje zwykłym tekstem', () => {
    expect(wyklad()).toContain('odkładamy do zadania 3.');
    expect(wyklad()).not.toContain('rh1-zad-4');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
