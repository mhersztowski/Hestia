import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-8-przyspieszenie-stale.md';
const pliki = [
  DOK,
  '3-5-predkosc-zmienna.md',
  '3-6-przyspieszenie.md',
  '3-7-przyspieszenie-zmienne.md',
  'Slownik.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
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

describe('3-8 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Sedno tego podrozdziału: książka **nie liczy** tych wzorów po kolei, tylko
   * kładzie cztery obok siebie do wyboru (po to jest tablica 3-1). Parser
   * przyjąłby (3-12), (3-14) i (3-15) jako przypisania — i dwa ostatnie
   * definiowałyby **to samo `x`** dwoma różnymi wyrażeniami. Dlatego wszystkie
   * pięć jest `@relation`: do grafu nie wchodzi żaden.
   */
  it('pięć wzorów numerowanych, wszystkie jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => f.id)).toEqual([
      'rh1-3-eq12',
      'rh1-3-eq13',
      'rh1-3-eq14',
      'rh1-3-eq15',
      'rh1-3-eq16',
    ]);
    expect(d?.formulas.every((f) => f.kind === 'relation')).toBe(true);
    for (const f of d!.formulas) expect(f.issues, f.id).toEqual([]);
  });

  it('wzory zgadzają się ze skanem co do znaku', () => {
    const kod = (id: string) => resolveRef(id)?.code ?? '';
    expect(kod('rh1-3-eq12')).toContain('v_x = v_{x0}+a_x t');
    expect(kod('rh1-3-eq13')).toContain('\\bar{v}_x = \\tfrac{1}{2}(v_{x0}+v_x)');
    expect(kod('rh1-3-eq14')).toContain('x = x_0+\\tfrac{1}{2}(v_{x0}+v_x)t');
    expect(kod('rh1-3-eq15')).toContain('x = x_0+v_{x0}t+\\tfrac{1}{2}a_x t^2');
    expect(kod('rh1-3-eq16')).toContain('v_x^2 = v_{x0}^2+2a_x(x-x_0)');
  });

  // Pierwszy rysunek własny od 3-6 i pierwsza **numerowana** tablica w bazie.
  it('ma własny rysunek 3-7 i tablicę 3-1', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-3-rys7']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(1);
    expect(resolveRef('rh1-3-tab1')?.kind).toBe('table');
    expect(tekst()).toContain('Tablica 3-1.');
  });

  /**
   * Tablica jest treścią, nie ozdobą: mówi, którą z czterech zależności wybrać,
   * bo każda omija inną niewiadomą. Gdyby przepisać ją jako obrazek, ta
   * informacja nie dałaby się przeszukać.
   */
  it('tablica wymienia cztery równania i to, czego każde nie zawiera', () => {
    const t = tekst();
    for (const nr of ['(3-12)', '(3-14)', '(3-15)', '(3-16)']) expect(t, nr).toContain(nr);
    const wiersze = (resolveRef('rh1-3-tab1')?.code ?? '')
      .split('\n')
      .filter((w) => w.startsWith('| (3-'));
    expect(wiersze).toHaveLength(4);
    // W każdym wierszu dokładnie jedna wielkość jest nieobecna.
    for (const w of wiersze) expect(w.match(/−/g), w).toHaveLength(1);
  });

  it('odsyłacz do (3-8) sięga wstecz do 3-6', () => {
    const cel = resolveReference(
      'rh1-3-eq8',
      { anchors: index.anchors, formulaHome: index.formulaHome },
      DOK
    );
    expect(cel.path).toBe('3-6-przyspieszenie.md');
  });

  // Podpis rys. 3-7 kończy się porównaniem z rys. 3-5, który stoi w 3-5.
  it('podpis rysunku odsyła do rysunku z innego podrozdziału', () => {
    const cel = resolveReference(
      'rh1-3-rys5',
      { anchors: index.anchors, formulaHome: index.formulaHome },
      DOK
    );
    expect(cel.path).toBe('3-5-predkosc-zmienna.md');
    expect(cel.sameDocument).toBe(false);
  });

  /**
   * Trzy usterki druku na czterech stronach. Każda wygląda jak literówka
   * przepisującego — i o to chodzi, że nie jest.
   */
  it('usterki druku przetrwały', () => {
    const t = tekst();
    // Rodzaj się nie zgadza: „nachylenie … jest stała".
    expect(t).toContain('prędkość jest stała, jak być powinno');
    // Nawias otwierający podwojony i niedomknięty.
    expect(t).toContain('[porównaj równanie [(3-12)] oraz');
    // „przemieszczania" zamiast „przemieszczenia" — w tym samym przykładzie,
    // którego pierwsze zdanie pisze poprawnie.
    expect(t).toContain('zależność przemieszczania od czasu');
    expect(t).toContain('przedstawia zależność przemieszczenia od czasu');
  });

  // Podpis rys. 3-7c pisze „jest stałe" poprawnie — usterka jest tylko w tekście
  // głównym. Gdyby ktoś kiedyś „poprawił" jedno miejsce, rozjazd zniknie i nikt
  // się nie zorientuje, że w druku był.
  it('podpis rysunku nie powtarza usterki z tekstu głównego', () => {
    expect(tekst()).toContain('reprezentującej prędkość jest stałe');
  });

  // Skorowidz dla s. 52–55 daje tylko hasła należące do 3-9.
  it('nie wprowadza haseł ani odsyłaczy do pojęć', () => {
    expect(bodies[DOK]).not.toContain('((rh1-poj-');
  });

  it('wzory bez numeru zostają zwykłym LaTeX-em', () => {
    const dok = bodies[DOK].split('## Uwagi redakcyjne')[0];
    const display = dok.match(/^\$\$.*\$\$$/gm) ?? [];
    expect(display).toHaveLength(5);
    // Powtórzenie (3-15) w Przykładzie 4 nie może być blokiem — dałoby duplikat
    // identyfikatora, a w druku jest bez numeru.
    expect(display.some((d) => d.includes('\\tfrac{1}{2}a_x t^2'))).toBe(true);
  });

  it('nawiasy druku wokół odsyłaczy przetrwały', () => {
    const t = tekst();
    expect(t).toContain('równania (3-12)');
    expect(t).toContain('patrz rys. 3-7d');
    expect(t).toContain('patrz tablica 3-1');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
