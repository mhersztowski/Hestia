import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const DOK = '4-6-predkosc-wzgledna.md';
const pliki = [DOK, '4-5-przyspieszenie-styczne.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const cel = (id: string) =>
  resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
const resolveRef = (id: string) => {
  const c = cel(id);
  if (!c.found || !c.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${c.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[c.path] ?? '');
  return { code: m?.[1], kind: c.kind, sameDocument: c.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />,
);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');
const wyklad = () => bodies[DOK].split('## Uwagi redakcyjne')[0];

describe('4-6 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Przy wzorze `v = v′+u` prawy margines w druku jest pusty, a mimo to tekst
   * na s. 83 powołuje się na „równanie (4-19)". Numer w książce istnieje, tylko
   * nie został wydrukowany — blok ma więc identyfikator, żeby odsyłacz miał cel,
   * ale nie ma wiersza z numerem kursywą.
   */
  it('(4-19) ma identyfikator, choć numeru w druku nie ma', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas.map((f) => [f.id, f.kind])).toEqual([
      ['rh1-4-eq18', 'relation'],
      ['rh1-4-eq19', 'relation'],
    ]);
    expect(resolveRef('rh1-4-eq19')?.code).toContain("\\mathbf{v} = \\mathbf{v}'+\\mathbf{u}.");
    // (4-18) ma numer pod blokiem, (4-19) nie — i tak ma być.
    expect(tekst()).toContain('(4-18)');
    expect(wyklad()).not.toContain('*(4-19)*');
    // Odsyłacz z akapitu końcowego mimo to trafia w cel.
    expect(wyklad()).toContain('((rh1-4-eq19|4-19))');
    expect(cel('rh1-4-eq19').sameDocument).toBe(true);
  });

  it('dwa rysunki: jeden bez paneli literowych, drugi z panelami', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-4-rys11', 'rh1-4-rys12']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(2);
    // 4-11 dzieli się na chwile t = 0 i t = t, nie na (a) i (b).
    expect(resolveRef('rh1-4-rys11')?.code).not.toContain('@panels');
    expect(resolveRef('rh1-4-rys12')?.code).toContain('@panels a, b');
  });

  /**
   * Trzeci raz w rozdziale 4 hasło ze skorowidza nie ma w tekście kursywy —
   * wszystkie cztery wyróżnienia w akapicie końcowym to zdania z naciskiem.
   */
  it('stawia hasło prędkość względna, ale bez odsyłacza w tekście', () => {
    expect(cel('rh1-poj-predkosc-wzgledna').path).toBe('Slownik.md');
    expect(resolveRef('rh1-poj-predkosc-wzgledna')?.code).toContain('@source 4-6, s. 82');
    expect(wyklad()).not.toContain('rh1-poj-');
    for (const nacisk of ['*zawsze różnią się*', '*prędkością stałą*', '*to samo przyspieszenie*']) {
      expect(wyklad(), nacisk).toContain(nacisk);
    }
  });

  /**
   * Przykład 6 podaje znaczenie u, v′ i v w trzech wciętych wierszach. To nie
   * jest lista punktowana i nie wolno jej w taką zamienić.
   */
  it('wyliczenie z przykładu zostaje akapitami, nie listą', () => {
    expect(wyklad()).not.toMatch(/^[-*] \$\\mathbf\{u\}\$/m);
    const t = tekst();
    expect(t).toContain('jest prędkością powietrza względem Ziemi,');
    expect(t).toContain('jest prędkością samolotu względem powietrza,');
    expect(t).toContain('jest prędkością samolotu względem Ziemi.');
  });

  it('nie ma notki, bo nie ma zaczepienia', () => {
    expect(index.documents.find((x) => x.path === DOK)?.callouts ?? []).toEqual([]);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
