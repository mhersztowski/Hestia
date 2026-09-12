import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference, parseCalloutBlock } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const DOK = '3-Pytania.md';
const pliki = [DOK, '3-10-spadek-swobodny.md', '3-11-rownania-spadku.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
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
/** Dokument jest zawijany na 80 kolumn — porównujemy po zwinięciu białych znaków. */
const tekst = () => (widok().container.textContent ?? '').replace(/\s+/g, ' ');

describe('pytania do rozdziału 3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  /**
   * **Numer pozycji jest adresem** — podręcznik odsyła „patrz pytanie 18".
   * Pytanie 21 ma w druku dwa dopisane akapity, które listę przerywają; w
   * rozdziale 15 taki układ (pytanie 18) sprawił, że czytnik zaczynał liczyć od
   * nowa i pytania 19–30 dostawały numery 1–12.
   */
  it('lista biegnie ciągiem od 1 do 21', () => {
    const { container } = widok();
    // Same pytania — uwagi redakcyjne to lista wypunktowana, nie numerowana.
    const pozycje = container.querySelectorAll('ol > li');
    expect(pozycje).toHaveLength(21);
    expect((pozycje[0].textContent ?? '')).toContain('Czy znane jest jakieś zjawisko');
    expect((pozycje[20].textContent ?? '')).toContain('Zgodnie z poglądem Arystotelesa');

    // Rysunek przerywa listę między 18 a 19, więc numeracja musi wznowić się na 19.
    const listy = container.querySelectorAll('ol');
    expect(listy.length).toBeGreaterThan(1);
    expect(listy[listy.length - 1].getAttribute('start')).toBe('19');
  });

  it('dwa dopisane akapity należą do pytania 21, nie są pozycjami', () => {
    const t = tekst();
    expect(t).toContain('Czy jeżeli uznamy rozumowanie Galileusza za poprawne');
    expect(t).toContain('powinien uzasadnić dlaczego');
    // Gdyby markdown wziął je za pozycje, byłoby ich 23.
    expect(widok().container.querySelectorAll('ol > li')).toHaveLength(21);
  });

  it('ma własny rysunek 3-9, w miejscu z druku', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.figures.map((f) => f.id)).toEqual(['rh1-3-rys9']);
    expect(widok().container.querySelectorAll('img')).toHaveLength(1);

    const zrodlo = bodies[DOK];
    const rysunek = zrodlo.indexOf('```figure:rh1-3-rys9');
    expect(zrodlo.indexOf('18. Rurkę o kształcie prostokąta')).toBeLessThan(rysunek);
    expect(zrodlo.indexOf('19. Oczekujemy, że prawdziwe')).toBeGreaterThan(rysunek);
    // Jedyny podpis w rozdziale, który nie opisuje rysunku, tylko mówi, czyj jest.
    expect(tekst()).toContain('Rys. 3-9. Pytanie 18');
  });

  it('pytanie 12 sięga do (3-17) w 3-11', () => {
    const cel = resolveReference(
      'rh1-3-eq17', { anchors: index.anchors, formulaHome: index.formulaHome }, DOK,
    );
    expect(cel.found).toBe(true);
    expect(cel.path).toBe('3-11-rownania-spadku.md');
    expect(cel.sameDocument).toBe(false);
  });

  /**
   * Oba pierwiastki OCR czyta jako „+^2y\ay" — czyli gubi i znak pierwiastka,
   * i nawiasy. Odczytane ze skanu.
   */
  it('pierwiastki z pytania 12 są kompletne', () => {
    const zrodlo = bodies[DOK].split('## Uwagi redakcyjne')[0];
    expect(zrodlo).toContain('$+\\sqrt{2y/a_y}$ oraz $-\\sqrt{2y/a_y}$');
  });

  // Hasło podpinamy tam, gdzie pojęcie jest **tematem** pytania, a nie wszędzie,
  // gdzie się pojawia — „prędkość średnia" pada w czterech pytaniach i nie
  // dostaje odsyłacza w żadnym.
  it('odsyłacze do haseł tylko tam, gdzie hasło jest tematem', () => {
    const uzyte = [...bodies[DOK].matchAll(/\(\(rh1-poj-([a-z-]+)\|/g)].map((m) => m[1]);
    expect([...new Set(uzyte)].sort())
      .toEqual(['przyspieszenie-ziemskie', 'punkt-materialny', 'wymiar']);
    for (const id of uzyte) {
      const cel = resolveReference(`rh1-poj-${id}`, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
      expect(cel.path, id).toBe('Slownik.md');
    }
  });

  /**
   * Pierwsza notka w pliku z pytaniami. Reguła szersza niż ten plik: **notka
   * przy pytaniu nie może być odpowiedzią**. Ta mówi wyłącznie, skąd wzięty jest
   * argument; czy jest poprawny, rozstrzyga samo pytanie.
   */
  it('notka przy pytaniu 21 nie zdradza odpowiedzi', () => {
    const blok = resolveRef('rh1-nota-galileusz-kamienie');
    expect(blok?.kind).toBe('callout');
    const nota = parseCalloutBlock('rh1-nota-galileusz-kamienie', blok!.code!);
    expect(nota.kind).toBe('person');
    expect(nota.issues).toEqual([]);
    expect(nota.body).toContain('Discorsi');
    expect(nota.source).toContain('pyt. 21');

    // Odpowiedzią byłoby rozstrzygnięcie, czy z argumentu wynika równość prędkości.
    expect(nota.body).not.toMatch(/wynika, że|dowodzi, że|nie dowodzi|jest poprawn/);
  });

  // Notka wskazuje notkę z 3-10; ten odsyłacz też musi trafiać.
  it('notka odsyła do podrozdziału 3-10', () => {
    const cel = resolveReference(
      'rh1-sec-3-10', { anchors: index.anchors, formulaHome: index.formulaHome }, DOK,
    );
    expect(cel.found).toBe(true);
    expect(cel.path).toBe('3-10-spadek-swobodny.md');
  });

  // Przecinek między podmiotem a orzeczeniem — potwierdzony na skanie.
  it('usterka druku w pytaniu 19 przetrwała', () => {
    expect(tekst()).toContain('prawdziwe ogólne zależności, powinny być zawsze ważne');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const t = tekst();
    expect(t).not.toMatch(/\(\(rh1-/);
    expect(t).not.toMatch(/\$|```/);
  });
});
