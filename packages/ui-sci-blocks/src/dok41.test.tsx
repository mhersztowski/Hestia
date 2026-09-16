import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-1-przemieszczenie.md';
const pliki = [
  DOK,
  '3-4-predkosc-chwilowa.md',
  '3-5-predkosc-zmienna.md',
  '3-7-przyspieszenie-zmienne.md',
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

describe('4-1 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * OCR ma z (4-2) tylko „dF " -¦", a z (4-3) trzy rozsypane wiersze — obu
   * prawych stron w warstwie tekstowej nie ma wcale. Test pilnuje odczytu
   * z obrazu strony: nie tylko tego, jak wzór wygląda, ale i ile ich jest.
   */
  it('trzy wzory odczytane ze skanu, wszystkie jako relacje', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-4-eq1', 'relation'],
      ['rh1-4-eq2', 'relation'],
      ['rh1-4-eq3', 'relation'],
    ]);
    expect(d!.formulas.flatMap((f) => f.issues)).toEqual([]);

    expect(resolveRef('rh1-4-eq1')?.code).toContain('\\mathbf{r} = \\mathbf{i}x+\\mathbf{j}y,');
    expect(resolveRef('rh1-4-eq2')?.code).toContain(
      '\\mathbf{v} = \\frac{\\mathrm{d}\\mathbf{r}}{\\mathrm{d}t} = \\mathbf{i}v_x+\\mathbf{j}v_y,'
    );
    expect(resolveRef('rh1-4-eq3')?.code).toContain(
      '\\mathbf{a} = \\frac{\\mathrm{d}\\mathbf{v}}{\\mathrm{d}t} = \\mathbf{i}a_x+\\mathbf{j}a_y.'
    );
    for (const n of ['(4-1)', '(4-2)', '(4-3)']) expect(tekst()).toContain(n);
  });

  /**
   * (4-1)…(4-3) powtarzają (3-4), (3-5) i (3-10) — o tym samym kształcie, ale
   * z nowymi numerami na marginesie. Rozstrzyga numer, nie treść: własne numery
   * znaczą własne bloki, a odsyłacze z tego akapitu mają trafić w rozdział 3.
   */
  it('odsyła do pierwowzorów w rozdziale 3, zamiast je powtarzać', () => {
    expect(cel('rh1-3-eq4').path).toBe('3-5-predkosc-zmienna.md');
    expect(cel('rh1-3-eq5').path).toBe('3-5-predkosc-zmienna.md');
    expect(cel('rh1-3-eq10').path).toBe('3-7-przyspieszenie-zmienne.md');
    expect(cel('rh1-sec-3-4').path).toBe('3-4-predkosc-chwilowa.md');
  });

  it('ma własny rysunek 4-1 o trzech panelach i odsyła nim do rys. 3-3', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-4-rys1']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(1);
    expect(tekst()).toContain('Rys. 4-1.');
    // Podpis w druku każe porównać rysunek z rys. 3-3 — cel jest w bazie od 3-5.
    expect(cel('rh1-3-rys3').path).toBe('3-5-predkosc-zmienna.md');
    expect(wyklad()).toContain('@panels a, b, c');
  });

  /**
   * Skorowidz wiąże ze stroną 68 pięć pozycji. Trzy z nich książka wprowadziła
   * w rozdziale 3, więc dokument tylko się do nich odsyła; nowe są dwie.
   */
  it('stawia dwa hasła, a trzy bierze z rozdziału 3', () => {
    for (const id of ['rh1-poj-predkosc', 'rh1-poj-ruch-dwuwymiarowy']) {
      expect(cel(id).path, id).toBe('Slownik.md');
      expect(resolveRef(id)?.code, id).toContain('@source 4-1');
    }
    for (const id of [
      'rh1-poj-przyspieszenie',
      'rh1-poj-wektor-polozenia',
      'rh1-poj-predkosc-punktu',
    ]) {
      expect(cel(id).found, id).toBe(true);
      expect(resolveRef(id)?.code, id).toContain('@source 3-');
    }
  });

  /**
   * „Wróćmy do rozważań dotyczących ruchu dwuwymiarowego" stoi w druku bez
   * kursywy, a definiujące zdanie na końcu podrozdziału też. Hasło idzie więc
   * do słownika, a dokument zostaje bez znacznika — reguła „kursywa → odsyłacz"
   * działa w jedną stronę i nie wolno jej odwracać.
   */
  it('hasło bez kursywy w druku nie dostaje odsyłacza w tekście', () => {
    expect(wyklad()).not.toContain('rh1-poj-ruch-dwuwymiarowy');
    expect(wyklad()).toContain('ruchu dwuwymiarowego');
  });

  /**
   * Trzeci przypadek w bazie po „rozdziałów 4 i 5" (3-1) i „(rozdział 16)"
   * (3-10): rusztowanie ma identyfikatory podrozdziałów, ale nie ma celu dla
   * rozdziału jako całości.
   */
  it('odsyłacz do rozdziału jako całości zostaje zwykłym tekstem', () => {
    expect(wyklad()).toContain('W rozdziale 3 rozważaliśmy');
    expect(wyklad()).not.toMatch(/\(\(rh1-[a-z]+-3\|W rozdziale/);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
