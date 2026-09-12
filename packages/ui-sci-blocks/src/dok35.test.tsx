import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-5-predkosc-zmienna.md';
const pliki = [DOK, '3-4-predkosc-chwilowa.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
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

describe('3-5 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('cztery wzory numerowane, wszystkie jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-3-eq4', 'relation'], ['rh1-3-eq5', 'relation'],
      ['rh1-3-eq6', 'relation'], ['rh1-3-eq7', 'relation'],
    ]);
    for (const f of d!.formulas) expect(f.issues, f.id).toEqual([]);
  });

  /**
   * (3-7) przechodzi przez parser także BEZ `@relation` — tak samo jak (3-3)
   * w poprzednim podrozdziale. Silnik nie różniczkuje, więc `dx/dt` wziąłby za
   * iloczyn `d·x` podzielony przez `d·t`. Druga sztuka tej samej pułapki.
   */
  it('(3-7) bez @relation cicho staje się wyrażeniem do policzenia', () => {
    const bez = bodies[DOK].replace(/```formula:rh1-3-eq7\n@relation\n/, '```formula:rh1-3-eq7\n');
    const f = buildIndex([{ path: DOK, markdown: bez }]).documents[0]
      .formulas.find((x) => x.id === 'rh1-3-eq7')!;
    expect(f.kind).not.toBe('relation');
    expect(f.issues).toEqual([]); // nikt nie ostrzeże
  });

  it('trzy rysunki i tablica bez numeru', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures?.map((f) => f.id)).toEqual(['rh1-3-rys3', 'rh1-3-rys4', 'rh1-3-rys5']);
    // Tablica z Przykładu 1 nie ma w książce numeru, więc identyfikator jest opisowy.
    expect(bodies[DOK]).toContain('```table:rh1-3-tab-granica');
    expect(index.anchors.get('rh1-3-tab-granica')?.kind).toBe('table');
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('tablica niesie wszystkie dziewięć wierszy danych', () => {
    const { container } = widok();
    const wiersze = container.querySelectorAll('tbody tr');
    expect(wiersze).toHaveLength(9);
    // granica, do której zbiega ostatnia kolumna
    expect(wiersze[wiersze.length - 1].textContent).toContain('+7,1');
  });

  // Nawiasy z książki muszą zostać poza odsyłaczem — `))` kończy zapis, więc
  // każdy z tych trzech kształtów jest osobnym przypadkiem do sprawdzenia.
  it('nawiasy druku wokół odsyłaczy przetrwały', () => {
    const t = widok().container.textContent!;
    expect(t).toContain('(patrz rys. 3-3a)');
    expect(t).toContain('równania (3-2) i (3-4)');
    expect(t).toContain('(rys. 3-5c)');
  });

  /**
   * Książka nigdy nie drukuje numeru (2-8) samodzielnie — na s. 30 stoją (2-8a)
   * i (2-8b). Cel jest więc rozszczepiony, nie brakujący; zostaje tekstem.
   */
  it('odsyłacz do (2-8) zostaje tekstem, bo cel jest rozszczepiony', () => {
    const tekstKsiazki = bodies[DOK].split('## Uwagi redakcyjne')[0];
    expect(tekstKsiazki).toContain('[patrz równanie (2-8)]');
    expect(tekstKsiazki).not.toContain('rh1-2-eq8');
  });

  // Wzór wyświetlony bez numeru na marginesie nie ma z czego wziąć
  // identyfikatora; drugi z nich to w dodatku powtórzenie (3-2).
  it('dwa wzory bez numeru zostają zwykłym LaTeX-em', () => {
    const display = bodies[DOK].match(/^\$\$.*\$\$$/gm) ?? [];
    expect(display).toHaveLength(2);
    expect(display[1]).toContain('\\lim_{\\Delta t \\to 0}');
  });

  // Skorowidz daje hasło, ale w tekście nie ma kursywy definiującej — reguła
  // „kursywa → odsyłacz" działa w jedną stronę i nie wolno jej odwracać.
  it('hasło „ruch jednowymiarowy" jest w słowniku, ale bez odsyłacza', () => {
    expect(index.anchors.get('rh1-poj-ruch-jednowymiarowy')?.kind).toBe('term');
    expect(bodies[DOK]).not.toContain('((rh1-poj-');
  });

  // Wiersz na s. 48 zaczyna się od „est dodatnie" — litera zgubiła się w druku.
  it('zgubione „j" zostaje tak, jak w druku', () => {
    expect(widok().container.textContent).toContain('Ponieważ');
    expect(bodies[DOK]).toContain('est dodatnie, prędkość');
    expect(bodies[DOK]).not.toContain('jest dodatnie, prędkość');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = widok().container.textContent!;
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
