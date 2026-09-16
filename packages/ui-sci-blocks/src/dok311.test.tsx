import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-11-rownania-spadku.md';
const pliki = [DOK, '3-8-przyspieszenie-stale.md', '3-10-spadek-swobodny.md', 'Slownik.md'].map(
  (p) => ({ path: p, markdown: readDocument(p) })
);
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(<ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

describe('3-11 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Pierwszy w bazie numer obejmujący **grupę** równań: książka składa cztery
   * wiersze w jeden blok i stawia „(3-17)" z boku, na wysokości środka grupy,
   * a pytanie 12 odsyła do całości. Blok musi więc być jeden — inaczej
   * identyfikator `rh1-3-eq17` nie miałby jednego celu.
   */
  it('(3-17) to jeden blok nad czterema równaniami', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([['rh1-3-eq17', 'relation']]);
    expect(d!.formulas[0].issues).toEqual([]);

    const latex = resolveRef('rh1-3-eq17')?.code ?? '';
    expect(latex).toContain('\\begin{aligned}');
    for (const w of [
      'v_y &= v_{y0}+a_y t',
      'y &= \\tfrac{1}{2}(v_{y0}+v_y)t',
      'y &= v_{y0}t+\\tfrac{1}{2}a_y t^2',
      'v_y^2 &= v_{y0}^2+2a_y y',
    ]) {
      expect(latex, w).toContain(w);
    }
  });

  /**
   * Warstwa tekstowa skanu ma z tej grupy **trzy** wiersze zamiast czterech
   * i nie ma numeru. Ten test pilnuje tego, czego OCR by nie dał — gdyby wiersz
   * kiedyś wypadł, brak wyszedłby dopiero przy pytaniu 12, które odsyła do
   * numeru (3-17).
   */
  it('równanie, które zgubił OCR, jest na miejscu', () => {
    expect(resolveRef('rh1-3-eq17')?.code).toContain('\\tfrac{1}{2}(v_{y0}+v_y)t');
    expect(tekst()).toContain('(3-17)');
  });

  it('przepisuje na oś y wszystkie cztery równania z 3-8', () => {
    for (const id of ['rh1-3-eq12', 'rh1-3-eq14', 'rh1-3-eq15', 'rh1-3-eq16']) {
      const cel = resolveReference(
        id,
        { anchors: index.anchors, formulaHome: index.formulaHome },
        DOK
      );
      expect(cel.path, id).toBe('3-8-przyspieszenie-stale.md');
    }
  });

  it('korzysta z haseł postawionych w 3-10 i nie stawia własnych', () => {
    for (const id of ['rh1-poj-spadek-swobodny', 'rh1-poj-przyspieszenie-ziemskie']) {
      const cel = resolveReference(
        id,
        { anchors: index.anchors, formulaHome: index.formulaHome },
        DOK
      );
      expect(cel.found, id).toBe(true);
      expect(cel.path, id).toBe('Slownik.md');
      expect(bodies['Slownik.md'], id).toContain('@source 3-10');
    }
    // Skorowidz nie wiąże ze stronami 59–60 ani jednej pozycji.
    expect(bodies['Slownik.md']).not.toContain('@source 3-11');
  });

  it('ma własny rysunek 3-8', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-3-rys8']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(1);
    expect(tekst()).toContain('Rys. 3-8.');
  });

  /**
   * Rysunek stoi tam, gdzie w druku — na górze s. 60, czyli między częścią (b)
   * a (c) Przykładu 9 — choć powołuje się na niego Przykład 8, stronę wcześniej.
   * To pozycja z łamania, nie z toku wywodu; przesunięcie byłoby poprawianiem
   * książki.
   */
  it('rysunek stoi w miejscu z druku, a nie przy swoim odsyłaczu', () => {
    const zrodlo = bodies[DOK];
    const rysunek = zrodlo.indexOf('```figure:rh1-3-rys8');
    expect(zrodlo.indexOf('jak pokazane na ((rh1-3-rys8|rys. 3-8))')).toBeLessThan(rysunek);
    expect(zrodlo.indexOf('(b) Jak wysoko wzniesie się piłka?')).toBeLessThan(rysunek);
    expect(zrodlo.indexOf('(c) Po jakim czasie piłka znajdzie się')).toBeGreaterThan(rysunek);
  });

  it('usterki druku przetrwały', () => {
    const t = tekst();
    // Wysokość podana w metrach na sekundę; rachunek niżej używa „29,4 m".
    expect(t).toContain('na wysokości 29,4 m/s nad Ziemią');
    // Czas bez jednostki, choć wiersz niżej podstawiane jest 1,0 s².
    expect(t).toContain('dla czasu t=1t = 1t=1 otrzymamy');
  });

  // W jednym wierszu druk składa `(m/s²)` kursywą, a `(m/s)` pismem prostym.
  it('dwie odmiany jednostek w jednym wzorze zostają', () => {
    const zrodlo = bodies[DOK].split('## Uwagi redakcyjne')[0];
    expect(zrodlo).toContain('\\mathit{m/s^2}');
    expect(zrodlo).toContain('(\\mathrm{m/s})\\cdot t');
  });

  it('wzory bez numeru zostają zwykłym LaTeX-em', () => {
    const zrodlo = bodies[DOK].split('## Uwagi redakcyjne')[0];
    // Dwanaście rachunków w przykładach; (3-17) jest blokiem, nie wyświetleniem.
    expect(zrodlo.match(/^\$\$.*\$\$$/gm) ?? []).toHaveLength(12);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
