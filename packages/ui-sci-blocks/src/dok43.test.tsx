import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-3-rzut-ukosny.md';
const pliki = [
  DOK,
  '4-1-przemieszczenie.md',
  '4-2-stale-przyspieszenie.md',
  '3-10-spadek-swobodny.md',
  'Slownik.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
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

describe('4-3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Prim jest w książce częścią numeru — (4-6a) i (4-6a′) to dwa różne wzory —
   * a znak ′ nie przechodzi do identyfikatora, stąd przyrostek `-prim`.
   * W tablicy 4-1 ten sam kształt rozwiązał się inaczej, bo tam numery nie mają
   * własnych bloków.
   */
  it('sześć wzorów numerowanych, prim w identyfikatorze jako -prim', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-4-eq6a', 'relation'],
      ['rh1-4-eq6a-prim', 'relation'],
      ['rh1-4-eq7', 'relation'],
      ['rh1-4-eq6c', 'relation'],
      ['rh1-4-eq6c-prim', 'relation'],
      ['rh1-4-eq8', 'relation'],
    ]);
    expect(d!.formulas.flatMap((f) => f.issues)).toEqual([]);
    for (const n of ['(4-6a)', '(4-6a′)', '(4-7)', '(4-6c)', '(4-6c′)', '(4-8)']) {
      expect(tekst(), n).toContain(n);
    }
  });

  /**
   * Obie usterki wychodzą dopiero z porównania ze skanem: pierwsza jest
   * niewidoczna w rachunku (Przykład 2 liczy poprawnie, z $\theta_0$), druga
   * daje wynik o właściwej liczbie i złej jednostce.
   */
  it('dwie usterki druku przetrwały', () => {
    // (4-6a): w druku bez indeksu przy kącie, choć zdanie nad wzorem podstawia θ₀.
    expect(resolveRef('rh1-4-eq6a')?.code).toContain('v_x = v_0\\cos\\theta.');
    // Zasięg podany w metrach na sekundę; rachunek daje 22 m.
    expect(wyklad()).toContain('\\tfrac{90}{49}\\ \\mathrm{s} = 22\\ \\mathrm{m/s}');
  });

  it('trzy rysunki, wszystkie skany', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-4-rys2', 'rh1-4-rys3', 'rh1-4-rys4']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(3);
    for (const p of ['Rys. 4-2.', 'Rys. 4-3.', 'Rys. 4-4.']) expect(tekst(), p).toContain(p);
  });

  it('sięga po tablicę 4-1 i po (4-5b) z 4-2', () => {
    expect(cel('rh1-4-tab1').path).toBe('4-2-stale-przyspieszenie.md');
    expect(cel('rh1-4-eq5b').path).toBe('4-2-stale-przyspieszenie.md');
    // Numery wierszy tablicy dalej odsyłają do niej samej, tak jak w 4-2.
    for (const n of ['4-4a', '4-4a′', '4-4c', '4-4c′']) {
      expect(wyklad(), n).toContain(`((rh1-4-tab1|${n}))`);
    }
  });

  /**
   * Skorowidz daje dla tych stron jedno hasło, a książka wprowadza je pismem
   * prostym — więc słownik rośnie, a dokument nie dostaje znacznika. Drugi raz
   * w tym rozdziale, po `ruchu dwuwymiarowym` z 4-1.
   */
  it('stawia hasło rzut ukośny, ale bez odsyłacza w tekście', () => {
    expect(cel('rh1-poj-rzut-ukosny').path).toBe('Slownik.md');
    expect(resolveRef('rh1-poj-rzut-ukosny')?.code).toContain('@source 4-3, s. 70');
    expect(wyklad()).not.toContain('rh1-poj-');
    // „ruch po okręgu" ma w skorowidzu s. 74, ale nagłówek tej strony to już
    // 4-4 — hasło należy więc do tamtego podrozdziału, nie do tego.
    expect(bodies['Slownik.md']).not.toContain('@source 4-3, s. 74');
  });

  /**
   * Druga notka o Galileuszu w bazie i tak ma być: w 3-10 książka spotyka go
   * przy spadku swobodnym, tutaj przy torze pocisku. Slug nazywa temat, nie
   * postać — inaczej jedna z tych treści musiałaby zniknąć.
   */
  it('ma własną notkę o Galileuszu, obok tej z 3-10', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.callouts.map((c) => [c.id, c.kind])).toEqual([
      ['rh1-nota-tor-paraboliczny', 'person'],
    ]);
    expect(resolveRef('rh1-nota-tor-paraboliczny')?.code).toContain('@source 4-3');
    // Tamta notka dalej mieszka w 3-10 i nie jest tu powtórzona.
    expect(cel('rh1-nota-galileusz').path).toBe('3-10-spadek-swobodny.md');
    expect(wyklad()).not.toContain('rh1-nota-galileusz\n');
  });

  /**
   * W druku oba przypisy mają jedną gwiazdkę, bo numeracja startuje od nowa na
   * każdej stronie (70 i 72). W jednym dokumencie strona przestaje być
   * jednostką, więc drugi dostał dwie.
   */
  it('dwa przypisy, rozróżnione mimo jednej gwiazdki w druku', () => {
    const t = tekst();
    expect(t).toContain('* Patrz Galileo Galilei, Dialogues Concerning Two New Sciences');
    expect(t).toContain('** Patrz: \u201eGalileo\'s Discovery of the Parabolic Trajectory"');
    // Escape musi działać: gwiazdka nie otwiera kursywy.
    expect(t).not.toContain('\\*');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
