import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-4-ruch-po-okregu.md';
const pliki = [
  DOK,
  '4-1-przemieszczenie.md',
  '4-2-stale-przyspieszenie.md',
  '3-6-przyspieszenie.md',
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

describe('4-4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Trzy różne powody, jeden rodzaj: (4-11)…(4-14) mają po lewej wektor,
   * (4-10a) i (4-10b) łączą po dwa równania pod jednym numerem, a (4-9) prowadzi
   * przez granicę. Po czterech podrozdziałach rozdział 4 nie postawił ani
   * jednego bloku wchodzącego do grafu obliczeń.
   */
  it('siedem wzorów numerowanych i ani jednego obliczalnego', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => f.id)).toEqual([
      'rh1-4-eq9',
      'rh1-4-eq10a',
      'rh1-4-eq10b',
      'rh1-4-eq11',
      'rh1-4-eq12',
      'rh1-4-eq13',
      'rh1-4-eq14',
    ]);
    expect(d?.formulas.every((f) => f.kind === 'relation')).toBe(true);
    expect(d!.formulas.flatMap((f) => f.issues)).toEqual([]);
    expect(resolveRef('rh1-4-eq9')?.code).toContain('\\lim_{\\Delta t\\to 0}');
    expect(resolveRef('rh1-4-eq14')?.code).toContain('\\mathbf{a} = -\\mathbf{u}_r\\frac{v^2}{r},');
  });

  it('cztery rysunki, w tym dwa panelowe', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual([
      'rh1-4-rys5',
      'rh1-4-rys6',
      'rh1-4-rys7',
      'rh1-4-rys8',
    ]);
    expect(widok().container.querySelectorAll('img')).toHaveLength(4);
    expect(resolveRef('rh1-4-rys5')?.code).toContain('@panels a, b, c');
    expect(resolveRef('rh1-4-rys8')?.code).toContain('@panels a, b');
  });

  /**
   * Pierwszy raz w rozdziale 4 książka wyróżnia pojęcia kursywą — 4-1, 4-2 i 4-3
   * wprowadzały je pismem prostym albo wcale.
   */
  it('dwa hasła i oba z odsyłaczem w tekście', () => {
    for (const id of ['rh1-poj-ruch-po-okregu', 'rh1-poj-przyspieszenie-dosrodkowe']) {
      expect(cel(id).path, id).toBe('Slownik.md');
      expect(resolveRef(id)?.code, id).toContain('@source 4-4');
      expect(wyklad(), id).toContain(`((${id}|`);
    }
    // Druga nazwa z tego samego zdania zostaje kursywą, nie drugim linkiem.
    expect(wyklad()).toContain('lub\n*dośrodkowym*');
    expect(resolveRef('rh1-poj-przyspieszenie-dosrodkowe')?.code).toContain(
      '@aka przyspieszeniem radialnym, dośrodkowym'
    );
  });

  /**
   * `ruch — po okręgu` ma w skorowidzu strony 74, 126 i 364. Przy 15-6 (s. 364)
   * zapadła decyzja, że hasło czeka na rozdział 4, bo tam książka je definiuje.
   * To pierwszy w bazie przypadek odłożonego hasła, które wróciło z zapowiedzianego
   * miejsca.
   */
  it('stawia hasło, na które czekał 15-6', () => {
    const h = resolveRef('rh1-poj-ruch-po-okregu')?.code ?? '';
    expect(h).toContain('74 i n., 126, 364');
    expect(h).toContain('@source 4-4, s. 74');
    // Skorowidz wiąże ze s. 77 także `Satelita`, ale definicja jest dopiero w rozdziale 16.
    expect(bodies['Slownik.md']).not.toContain('rh1-poj-satelita');
  });

  it('usterka druku w Przykładzie 5 przetrwała', () => {
    // Przyspieszenie podane w jednostce prędkości; wzór niżej liczy z cm/s².
    expect(tekst()).toContain('na tej wysokości wynosi g=920g = 920g=920 cm/s.');
    expect(wyklad()).toContain('920\\ \\mathrm{cm/s^2}');
  });

  /**
   * W druku „kierunek wzrostu r" jest pogrubione, czyli mowa o wektorze
   * położenia, a nie o skalarnym promieniu. Rozstrzygnięte porównaniem kroju
   * w powiększeniu — tak samo jak `v_v` w tablicy 4-1.
   */
  it('pogrubione r w zdaniu o wektorze jednostkowym zostaje wektorem', () => {
    expect(wyklad()).toContain('wskazuje kierunek wzrostu\n$\\mathbf{r}$ w tym punkcie');
  });

  it('ma notkę o Sputniku, zaczepioną w haśle ze skorowidza', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.callouts.map((c) => [c.id, c.kind])).toEqual([
      ['rh1-nota-pierwszy-satelita', 'device'],
    ]);
    expect(resolveRef('rh1-nota-pierwszy-satelita')?.code).toContain('@source 4-4, s. 77');
  });

  it('sięga po paragraf 3-6, wzór z 4-1 i tablicę z 4-2', () => {
    expect(cel('rh1-sec-3-6').path).toBe('3-6-przyspieszenie.md');
    expect(cel('rh1-4-eq3').path).toBe('4-1-przemieszczenie.md');
    expect(cel('rh1-4-tab1').path).toBe('4-2-stale-przyspieszenie.md');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
