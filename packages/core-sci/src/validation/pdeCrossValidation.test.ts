/**
 * Cross-walidacja pól: nasz schemat kontra metoda linii w SciPy.
 *
 * Dla pól ta warstwa jest ważniejsza niż dla układów ODE. Jawny schemat różnic
 * skończonych ma **warunek stabilności**, a jego błędne wyliczenie nie objawia
 * się komunikatem: wynik albo rozbiega się do nieskończoności, albo — gorzej —
 * wygląda wiarygodnie i jest zły. Po drugiej stronie stoi zupełnie inny pomysł
 * na to samo równanie: siatka zamieniona na wielki układ ODE i całkowana
 * adaptacyjnym solverem z kontrolą błędu.
 *
 * Fixtures powstają osobnym poleceniem (`validation/generate-fixtures.mjs`),
 * nigdy w teście — inaczej porównywalibyśmy wynik z samym sobą.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFormulaBlock } from '../formula/parseFormula';
import { compilePde } from '../pde/grid2d';

interface FieldFixture {
  id: string;
  nx: number;
  ny: number;
  order: 'diffusion' | 'wave';
  parameters: Record<string, number>;
  tSpan: [number, number];
  frames: Array<{ t: number; values: number[] }>;
}

const FIXTURES = join(__dirname, '..', '..', 'validation', 'fixtures');
const DOKUMENTY = join(__dirname, '..', '..', '..', 'sci-blocks', 'dokumenty');

/** Blok pola z dokumentu, z siatką (i ewentualnie warunkiem) z odniesienia. */
function blokPola(dokument: string, id: string, nx: number, ny: number, initial?: string) {
  const markdown = readFileSync(join(DOKUMENTY, dokument), 'utf8');
  const wzorzec = new RegExp('```formula:' + id + '\\n([\\s\\S]*?)```');
  const tresc = wzorzec.exec(markdown)?.[1];
  if (!tresc) throw new Error(`Nie ma bloku formula:${id} w ${dokument}`);

  // Siatka z odniesienia, nie z dokumentu: porównanie ma sens tylko na tej
  // samej siatce, a gęstość dokumentu jest dobrana pod płynność w przeglądarce.
  let zrodlo = tresc.replace(/@grid\s+\d+\s*x\s*\d+/, `@grid ${nx} x ${ny}`);
  // Warunek początkowy z odniesienia, gdy walidacja go podmieniła — patrz
  // komentarz przy scenariuszu fali w `generate-fixtures.mjs`.
  if (initial) zrodlo = zrodlo.replace(/@init\s+.+/, `@init ${initial}`);
  return parseFormulaBlock(id, zrodlo);
}

/** Największa różnica względem zakresu wartości odniesienia. */
function bladWzgledny(nasze: Float32Array, referencja: number[]): number {
  const zakres = Math.max(...referencja.map(Math.abs), 1e-12);
  let najwiekszy = 0;
  for (let i = 0; i < referencja.length; i += 1) {
    najwiekszy = Math.max(najwiekszy, Math.abs(nasze[i] - referencja[i]) / zakres);
  }
  return najwiekszy;
}

/*
 * Tolerancje wynikają z **rzędu schematu**, nie z niepewności pomiaru.
 *
 * Nasz solver jest jawny i pierwszego rzędu w czasie, a krok dobiera z warunku
 * stabilności — czyli bierze tak duży, jak wolno. Wobec adaptacyjnego LSODA
 * daje to kilka procent na jednostkę czasu i jest to cena metody, nie usterka;
 * zmierzone na tych fixtures: ~2% po 0,25 s dyfuzji. Ciaśniejszy próg wywalałby
 * test przy każdej zmianie siatki, luźniejszy przestałby cokolwiek łapać.
 *
 * Fala dostaje więcej, bo błąd fazy przekłada się na dużą różnicę punktową:
 * w tym samym miejscu jedna metoda ma już grzbiet, a druga jeszcze nie.
 */
const PRZYPADKI: Array<[plik: string, dokument: string, tolerancja: number, initial?: string]> = [
  ['cieplo-pole', 'rownanie-ciepla.md', 0.04],
  // Moda własna zamiast plamki z dokumentu — uzasadnienie przy scenariuszu
  // w `generate-fixtures.mjs`. Tu oba silniki mają rozwiązanie zamknięte, więc
  // próg może być ciasny.
  ['fala-pole', 'rownanie-ciepla.md', 0.05, '\\sin(\\pi x) \\cdot \\sin(\\pi y)'],
];

describe('pola kontra SciPy', () => {
  for (const [plik, dokument, tolerancja, initial] of PRZYPADKI) {
    const sciezka = join(FIXTURES, `${plik}.json`);

    it(`${plik}: odniesienie istnieje`, () => {
      // Brak pliku nie może uciszać sprawdzenia — to byłby najgorszy rodzaj
      // zielonego testu.
      expect(existsSync(sciezka), `brakuje ${plik}.json — uruchom generate-fixtures.mjs`).toBe(true);
    });

    it(`${plik}: zgadza się z niezależnym silnikiem`, () => {
      const fixture = JSON.parse(readFileSync(sciezka, 'utf8')) as FieldFixture;
      const model = compilePde(blokPola(dokument, fixture.id, fixture.nx, fixture.ny, initial));
      expect(model.issues).toEqual([]);

      const wynik = model.run(fixture.parameters, fixture.tSpan, fixture.frames.length);
      expect(wynik.frames.length).toBe(fixture.frames.length);

      for (let i = 0; i < fixture.frames.length; i += 1) {
        const blad = bladWzgledny(wynik.frames[i].data, fixture.frames[i].values);
        expect(blad, `klatka ${i} (t = ${fixture.frames[i].t})`).toBeLessThan(tolerancja);
      }
    });
  }
});

describe('zbieżność schematu', () => {
  /*
   * Sama tolerancja nie wystarczy: dobrana luźno przepuści błąd w schemacie,
   * a dobrana ciasno wywali się przy każdej zmianie siatki. Zbieżność mówi coś,
   * czego tolerancja nie powie — że przy gęstszej siatce (a więc mniejszym
   * kroku z warunku stabilności) wynik **zbliża się** do odniesienia.
   *
   * To jest sprawdzian samego pomysłu, a nie pojedynczego przebiegu: schemat
   * z błędem w mnożniku albo w warunku brzegowym potrafi trafić w tolerancję
   * na jednej siatce i rozjechać się na drugiej.
   */
  it('gęstsza siatka daje wynik bliższy odniesienia', () => {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURES, 'cieplo-pole.json'), 'utf8'),
    ) as FieldFixture;
    const ostatnia = fixture.frames[fixture.frames.length - 1];

    const bladNaSiatce = (n: number) => {
      const model = compilePde(blokPola('rownanie-ciepla.md', fixture.id, n, n));
      const wynik = model.run(fixture.parameters, fixture.tSpan, fixture.frames.length);
      const klatka = wynik.frames[wynik.frames.length - 1];

      // Odniesienie jest na siatce `fixture.nx`; przy innej porównujemy
      // **środek pola**, bo tylko on odpowiada temu samemu punktowi przestrzeni.
      const srodekNasz = klatka.data[Math.floor(n / 2) * n + Math.floor(n / 2)];
      const srodekRef = ostatnia.values[Math.floor(fixture.ny / 2) * fixture.nx + Math.floor(fixture.nx / 2)];
      return Math.abs(srodekNasz - srodekRef) / Math.abs(srodekRef);
    };

    const rzadka = bladNaSiatce(12);
    const gesta = bladNaSiatce(48);
    expect(gesta, `rzadka ${rzadka}, gęsta ${gesta}`).toBeLessThan(rzadka);
  });
});
