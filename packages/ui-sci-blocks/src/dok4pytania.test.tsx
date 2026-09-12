import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '4-Pytania.md';
const pliki = [DOK, '4-3-rzut-ukosny.md', '4-5-przyspieszenie-styczne.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
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
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');
const tresc = () => bodies[DOK].split('## Uwagi redakcyjne')[0];

describe('Pytania rozdziału 4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Numer pozycji jest adresem — podręcznik odsyła „patrz pytanie 10" (zadanie 4
   * robi to wprost). Lista musi więc dojść do 16 bez restartu numeracji.
   */
  it('szesnaście pytań, numeracja bez przerwy', () => {
    // Same pytania — uwagi redakcyjne są listą punktowaną i nie liczą się tutaj.
    const ol = widok().container.querySelector('ol');
    const items = [...(ol?.querySelectorAll('li') ?? [])];
    expect(items).toHaveLength(16);
    expect(ol?.getAttribute('start') ?? '1').toBe('1');
    expect(items[15].textContent).toContain('Winda jedzie w dół');
  });

  /**
   * Rys. 4-13 należy do pytania 15, ale w druku stoi pod pytaniem 16, na dole
   * strony. Miejsce bierzemy z numeru strony, nie z pierwszej wzmianki.
   */
  it('rysunek stoi po ostatnim pytaniu, tak jak w druku', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-4-rys13']);
    const zrodlo = tresc();
    expect(zrodlo.indexOf('Co się nie zgadza')).toBeLessThan(zrodlo.indexOf('```figure:rh1-4-rys13'));
    expect(zrodlo.indexOf('Winda jedzie w dół')).toBeLessThan(zrodlo.indexOf('```figure:rh1-4-rys13'));
    expect(tekst()).toContain('Rys. 4-13. Pytanie 15');
  });

  it('dwie usterki interpunkcji przetrwały', () => {
    const t = tekst();
    expect(t).toContain('odgrywa jakąś rolę wysokość skoku. Jakie czynniki');
    expect(t).toContain('nieruchomą względem ścian budynku.');
  });

  /**
   * Pytanie 8 każe opisać przyspieszenie koralika biegnącego po spirali ze stałą
   * prędkością — czyli dokładnie to, co nazywa hasło. Odsyłacz byłby tam
   * odpowiedzią; w pytaniu 9 ten sam termin odsyłacz dostaje, bo pytanie brzmi
   * inaczej.
   */
  it('odsyłacz nie zdradza odpowiedzi na pytanie 8', () => {
    const zrodlo = tresc();
    const p8 = zrodlo.slice(zrodlo.indexOf('8. Opisz'), zrodlo.indexOf('9. Czy'));
    expect(p8).not.toContain('rh1-poj-');
    const p9 = zrodlo.slice(zrodlo.indexOf('9. Czy'), zrodlo.indexOf('10. Na'));
    expect(p9).toContain('rh1-poj-przyspieszenie-styczne');
    expect(p9).toContain('rh1-poj-przyspieszenie-dosrodkowe');
  });

  it('cztery odsyłacze do słownika, wszystkie do haseł tego rozdziału', () => {
    for (const id of ['rh1-poj-rzut-ukosny', 'rh1-poj-ruch-dwuwymiarowy',
      'rh1-poj-przyspieszenie-styczne', 'rh1-poj-przyspieszenie-dosrodkowe']) {
      expect(cel(id).path, id).toBe('Slownik.md');
    }
    // Ani jednego odsyłacza do wzoru czy rysunku z wykładu — trzeci raz z rzędu.
    expect(tresc()).not.toMatch(/\(\(rh1-4-eq/);
    expect(tresc()).not.toMatch(/\(\(rh1-4-rys(?!13)/);
  });

  it('nie ma notki i nie stawia haseł', () => {
    expect(index.documents.find((x) => x.path === DOK)?.callouts ?? []).toEqual([]);
    expect(bodies['Slownik.md']).not.toContain('@source Pytania rozdz. 4');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
