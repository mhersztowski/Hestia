import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-Zadania.md';
const pliki = [DOK, '3-Pytania.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const zrodlo = bodies[DOK].split('## Uwagi redakcyjne')[0];
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />,
);
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

/** Numery zadań w kolejności wystąpienia w pliku. */
const numery = [...zrodlo.matchAll(/^```exercise:rh1-zad-3-(\d+)$/gm)].map((m) => Number(m[1]));

describe('zadania do rozdziału 3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * Numeracja biegnie **ciągiem przez wszystkie grupy** — nagłówek „Paragraf
   * 3-8" jej nie zeruje. Gdyby zerował, „patrz zadanie 31" wskazywałoby na inne
   * zadanie niż w książce.
   */
  it('46 zadań, numeracja ciągiem od 1 do 46', () => {
    expect(numery).toEqual(Array.from({ length: 46 }, (_, i) => i + 1));
    expect(index.documents.find((x) => x.path === DOK)?.exercises).toHaveLength(46);
  });

  /**
   * Grupy nie pokrywają wszystkich podrozdziałów: 3-1, 3-2, 3-4, 3-5 i 3-10 nie
   * mają ani jednego zadania, a 3-8 i 3-11 mają razem 34 z 46. To jest stan
   * z książki, nie brak w przepisaniu.
   */
  it('sześć grup, w kolejności z druku', () => {
    const grupy = [...zrodlo.matchAll(/^### Paragraf (\S+)$/gm)].map((m) => m[1]);
    expect(grupy).toEqual(['3-3', '3-6', '3-7', '3-8', '3-9', '3-11']);
  });

  it('odpowiedź ma 21 zadań, na tych numerach co w druku', () => {
    const zOdp = [...zrodlo.matchAll(/```exercise:rh1-zad-3-(\d+)\n([\s\S]*?)```/g)]
      .filter(([, , tresc]) => tresc.includes('@expected'))
      .map(([, nr]) => Number(nr));
    expect(zOdp).toEqual([1, 3, 5, 7, 9, 13, 15, 17, 19, 21, 23, 25, 29, 31, 33, 35, 37, 39, 41, 43, 45]);
  });

  it('trzy rysunki, każdy w miejscu z druku', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-3-rys10', 'rh1-3-rys11', 'rh1-3-rys12']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(3);

    const poz = (s: string) => zrodlo.indexOf(s);
    // 3-10 stoi po zadaniu 9, choć powołują się na niego zadania 7 i 8.
    expect(poz('```exercise:rh1-zad-3-9')).toBeLessThan(poz('```figure:rh1-3-rys10'));
    expect(poz('```figure:rh1-3-rys10')).toBeLessThan(poz('```exercise:rh1-zad-3-10'));
    expect(poz('```exercise:rh1-zad-3-10')).toBeLessThan(poz('```figure:rh1-3-rys11'));
    expect(poz('```figure:rh1-3-rys11')).toBeLessThan(poz('```exercise:rh1-zad-3-11'));
    // 3-12 książka wstawia w środek zadania 21; bloku nie da się przerwać
    // blokiem, więc rysunek stoi tuż przed nim.
    expect(poz('```figure:rh1-3-rys12')).toBeLessThan(poz('```exercise:rh1-zad-3-21'));
  });

  it('odsyłacze do rysunków trafiają w cel', () => {
    for (const id of ['rh1-3-rys10', 'rh1-3-rys11', 'rh1-3-rys12']) {
      const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
      expect(cel.found, id).toBe(true);
      expect(cel.sameDocument, id).toBe(true);
    }
  });

  /**
   * **Tabela markdown nie renderuje się w treści bloku `exercise`** — pionowe
   * kreski wychodzą surowe. Sprawdzone przed napisaniem dokumentu. Dane
   * zadania 6 idą więc jako `array` LaTeX-a, co i tak jest bliższe drukowi:
   * tam są to dwa wyrównane wiersze liczb, bez ramki.
   */
  it('dane zadania 6 składają się, a nie wypisują', () => {
    expect(zrodlo).toContain('\\begin{array}{lrrrrrrr}');
    const t = tekst();
    expect(t).not.toContain('|---|');
    // Wartości muszą być w tekście — inaczej zadania nie da się rozwiązać.
    expect(t).toContain('0,080');
    expect(t).toContain('0,20');
  });

  it('usterki druku przetrwały', () => {
    const t = tekst();
    // zad. 9 — brak „k" w „szybkość".
    expect(t).toContain('opisuje szybość zmian');
    // zad. 20 — brak „p" w „przyspieszenie".
    expect(t).toContain('(a) przysieszenie pociągu');
    // zad. 45 — przecinek przed wartością.
    expect(t).toContain('z przyspieszeniem, 1,2 m/s²');
    // zad. 13 — jedyna z 21 odpowiedzi bez dwukropka po „Odp.".
    expect(zrodlo).toContain('@expected Oba przyspieszenia są równe');
  });

  /**
   * OCR czyta w zadaniu 27 „vx" zamiast $v_1$, przez co warunek wyglądałby na
   * zapisany w mieszanych oznaczeniach. W druku stoją dwa pociągi: $v_1$ i $v_2$.
   */
  it('zadanie 27 używa v₁ i v₂, nie vₓ', () => {
    const zad = /```exercise:rh1-zad-3-27\n([\s\S]*?)```/.exec(zrodlo)![1];
    expect(zad).toContain('$v_1$');
    expect(zad).toContain('$v_2$');
    expect(zad).not.toContain('v_x');
    expect(zad).toContain('\\frac{(v_1-v_2)^2}{2a}');
  });

  // Zadania rozdziału 3 nie powołują się na żadne równanie z wykładu — inaczej
  // niż w rozdziale 15. Odsyłacze idą tylko do rysunków i do dwóch haseł.
  it('odsyła do słownika, ale do żadnego równania', () => {
    const uzyte = [...zrodlo.matchAll(/\(\(rh1-poj-([a-z-]+)\|/g)].map((m) => m[1]);
    expect([...new Set(uzyte)].sort()).toEqual(['przyspieszenie-ziemskie', 'wymiar']);
    for (const id of uzyte) {
      const cel = resolveReference(`rh1-poj-${id}`, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
      expect(cel.path, id).toBe('Slownik.md');
    }
    expect(zrodlo).not.toMatch(/\(\(\(?rh1-3-eq/);
  });

  // „Patrz pytanie 8" w zadaniu 24 zostaje tekstem — pozycje list nie mają
  // identyfikatorów, tak samo jak w rozdziale 15.
  it('odsyłacz do numeru pytania zostaje tekstem', () => {
    expect(tekst()).toContain('Patrz pytanie 8.');
    expect(zrodlo).not.toContain('rh1-pyt-3|');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
