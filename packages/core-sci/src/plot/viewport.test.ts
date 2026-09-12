/**
 * Testy widoku: przeliczanie współrzędnych, przesuwanie, skalowanie i podziałki.
 *
 * To warstwa, w której błąd nie daje wyjątku, tylko wykres przesunięty o kilka
 * pikseli albo oś opisaną liczbami 0,30000000000000004. Stąd nacisk na
 * przypadki graniczne i na własności, które muszą zachodzić zawsze:
 * przeliczenie tam i z powrotem, punkt nieruchomy przy skalowaniu.
 */

import { describe, it, expect } from 'vitest';
import {
  worldToScreen, screenToWorld, panByPixels, zoomAt, fitAspect, niceTicks, minorStep,
  type Viewport,
} from './viewport';

const V: Viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
const SIZE = { width: 400, height: 400 };

describe('przeliczanie współrzędnych', () => {
  it('środek świata trafia na środek płótna', () => {
    expect(worldToScreen(V, SIZE, { x: 0, y: 0 })).toEqual({ x: 200, y: 200 });
  });

  it('oś y rośnie w górę, a piksele w dół', () => {
    // Najczęstsza pomyłka w rysowaniu wykresów: wykres do góry nogami.
    const gora = worldToScreen(V, SIZE, { x: 0, y: 10 });
    const dol = worldToScreen(V, SIZE, { x: 0, y: -10 });
    expect(gora.y).toBe(0);
    expect(dol.y).toBe(400);
  });

  it('przeliczenie tam i z powrotem wraca do punktu wyjścia', () => {
    for (const point of [{ x: 0, y: 0 }, { x: 3.7, y: -2.1 }, { x: -9.99, y: 9.99 }]) {
      const wrocil = screenToWorld(V, SIZE, worldToScreen(V, SIZE, point));
      expect(wrocil.x).toBeCloseTo(point.x, 9);
      expect(wrocil.y).toBeCloseTo(point.y, 9);
    }
  });

  it('radzi sobie z widokiem nieskupionym na zerze', () => {
    const przesuniety: Viewport = { xMin: 100, xMax: 200, yMin: -5, yMax: 5 };
    expect(worldToScreen(przesuniety, SIZE, { x: 150, y: 0 })).toEqual({ x: 200, y: 200 });
  });
});

describe('przesuwanie', () => {
  it('przeciągnięcie w prawo przesuwa świat w lewo', () => {
    // Chwytamy płótno, nie osie: treść ma iść za palcem.
    const po = panByPixels(V, SIZE, 20, 0);
    expect(po.xMin).toBeCloseTo(-11);
    expect(po.xMax).toBeCloseTo(9);
  });

  it('przeciągnięcie w dół zwiększa wartości y', () => {
    const po = panByPixels(V, SIZE, 0, 20);
    expect(po.yMin).toBeCloseTo(-9);
    expect(po.yMax).toBeCloseTo(11);
  });

  it('punkt pod kursorem zostaje pod kursorem', () => {
    const kursor = { x: 120, y: 300 };
    const przed = screenToWorld(V, SIZE, kursor);
    const po = panByPixels(V, SIZE, 37, -14);
    const nowy = screenToWorld(po, SIZE, { x: kursor.x + 37, y: kursor.y - 14 });
    expect(nowy.x).toBeCloseTo(przed.x, 9);
    expect(nowy.y).toBeCloseTo(przed.y, 9);
  });

  it('nie zmienia rozpiętości widoku', () => {
    const po = panByPixels(V, SIZE, 55, -33);
    expect(po.xMax - po.xMin).toBeCloseTo(V.xMax - V.xMin);
    expect(po.yMax - po.yMin).toBeCloseTo(V.yMax - V.yMin);
  });
});

describe('skalowanie', () => {
  it('punkt pod kursorem nie ucieka', () => {
    // To jedyna własność, która decyduje, czy zoom kołem myszy jest znośny:
    // skalujemy wokół kursora, a nie wokół środka płótna.
    const kursor = { x: 90, y: 310 };
    const przed = screenToWorld(V, SIZE, kursor);
    const po = zoomAt(V, SIZE, 0.5, kursor);
    const potem = screenToWorld(po, SIZE, kursor);

    expect(potem.x).toBeCloseTo(przed.x, 9);
    expect(potem.y).toBeCloseTo(przed.y, 9);
  });

  it('współczynnik mniejszy od jedności przybliża', () => {
    const po = zoomAt(V, SIZE, 0.5, { x: 200, y: 200 });
    expect(po.xMax - po.xMin).toBeCloseTo(10);
  });

  it('współczynnik większy od jedności oddala', () => {
    const po = zoomAt(V, SIZE, 2, { x: 200, y: 200 });
    expect(po.xMax - po.xMin).toBeCloseTo(40);
  });

  it('skaluje tylko wskazaną oś, gdy poproszono', () => {
    // Desmos pozwala rozciągnąć samą oś y — przydaje się przy funkcjach
    // o bardzo różnych rzędach wielkości.
    const po = zoomAt(V, SIZE, 2, { x: 200, y: 200 }, { x: false, y: true });
    expect(po.xMax - po.xMin).toBeCloseTo(20);
    expect(po.yMax - po.yMin).toBeCloseTo(40);
  });

  it('nie pozwala zejść poniżej rozdzielczości liczb', () => {
    // Przy zbyt głębokim przybliżeniu różnica krańców przestaje być
    // reprezentowalna i wykres zamienia się w szum.
    let v = V;
    for (let i = 0; i < 200; i += 1) v = zoomAt(v, SIZE, 0.5, { x: 200, y: 200 });
    expect(v.xMax - v.xMin).toBeGreaterThan(0);
    expect(Number.isFinite(v.xMin)).toBe(true);
  });

  it('nie pozwala oddalić się w nieskończoność', () => {
    let v = V;
    for (let i = 0; i < 200; i += 1) v = zoomAt(v, SIZE, 2, { x: 200, y: 200 });
    expect(Number.isFinite(v.xMax - v.xMin)).toBe(true);
  });
});

describe('proporcje', () => {
  it('oś zachowywana zostaje, druga dostaje zakres z proporcji płótna', () => {
    // Płótno dwa razy szersze niż wyższe: przy zachowanym x zakres y musi być
    // dwa razy węższy, żeby jednostka miała ten sam rozmiar w pikselach.
    const dopasowany = fitAspect(V, { width: 800, height: 400 }, 'x');
    expect(dopasowany.xMax - dopasowany.xMin).toBeCloseTo(20);
    expect(dopasowany.yMax - dopasowany.yMin).toBeCloseTo(10);
  });

  it('jednostka ma ten sam rozmiar w pikselach w obu osiach', () => {
    // To jest własność, o którą naprawdę chodzi: okrąg ma wyglądać jak okrąg.
    const size = { width: 1040, height: 1715 };
    const d = fitAspect(V, size, 'x');
    expect((d.xMax - d.xMin) / size.width).toBeCloseTo((d.yMax - d.yMin) / size.height, 9);
  });

  it('odtwarza zakres, który Desmos pokazuje na tym samym płótnie', () => {
    // Na zrzucie przy −10 ≤ x ≤ 10 stoi −16,4873 ≤ y ≤ 16,4873. To nie jest
    // przypadkowa liczba, tylko skutek tej samej reguły — przy obszarze
    // wykresu około 1040×1715 px wychodzi 16,49.
    const d = fitAspect(V, { width: 1040, height: 1715 }, 'x');
    expect(d.yMax).toBeCloseTo(16.49, 1);
  });

  it('zachowuje środek widoku', () => {
    const dopasowany = fitAspect({ xMin: 0, xMax: 20, yMin: 0, yMax: 20 }, { width: 800, height: 400 }, 'x');
    expect((dopasowany.xMin + dopasowany.xMax) / 2).toBeCloseTo(10);
    expect((dopasowany.yMin + dopasowany.yMax) / 2).toBeCloseTo(10);
  });

  it('kwadratowe płótno niczego nie zmienia', () => {
    expect(fitAspect(V, SIZE, 'x')).toEqual(V);
  });
});

describe('podziałki', () => {
  it('daje okrągłe liczby, a nie ułamki z dzielenia', () => {
    // Podziałka co 3,3333 jest nie do przeczytania; ludzie liczą po 1, 2 i 5.
    // Krok bierze się z zamówionej liczby podziałek: przy dziesięciu wypada
    // co 2, przy czterech co 5 — obie wartości są „ładne", żadna nie jest
    // ilorazem zakresu przez cokolwiek.
    expect(niceTicks(-10, 10, 10)).toEqual([-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-10, 10, 4)).toEqual([-10, -5, 0, 5, 10]);
  });

  it('krok jest zawsze jedynką, dwójką albo piątką razy potęga dziesięciu', () => {
    for (const [min, max, count] of [[-10, 10, 10], [0, 7, 5], [-33, 128, 8], [0, 0.03, 6]] as const) {
      const ticks = niceTicks(min, max, count);
      const step = ticks[1] - ticks[0];
      const normalized = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5]).toContain(Math.round(normalized));
    }
  });

  it('nie gubi się przy bardzo małym zakresie', () => {
    const ticks = niceTicks(0.0001, 0.0002, 5);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => t >= 0.0001 && t <= 0.0002)).toBe(true);
  });

  it('nie gubi się przy bardzo dużym zakresie', () => {
    const ticks = niceTicks(-1e9, 1e9, 10);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks).toContain(0);
  });

  it('liczba podziałek trzyma się zamówionej z grubsza', () => {
    for (const [min, max] of [[-1, 1], [0, 7], [-33, 128], [1.5, 1.7]] as const) {
      const ticks = niceTicks(min, max, 10);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(21);
    }
  });

  it('wartości nie mają śmieci z arytmetyki zmiennoprzecinkowej', () => {
    // 0.1 + 0.2 = 0.30000000000000004 — na osi to widać gołym okiem.
    for (const t of niceTicks(0, 1, 10)) {
      expect(String(t).length).toBeLessThan(8);
    }
  });

  it('zakres zerowej szerokości nie zapętla programu', () => {
    expect(niceTicks(5, 5, 10)).toEqual([5]);
  });

  it('krok drobnej siatki dzieli krok główny', () => {
    for (const step of [1, 2, 5, 0.5, 100]) {
      const minor = minorStep(step);
      expect(minor).toBeLessThan(step);
      expect(Math.round(step / minor)).toBeCloseTo(step / minor, 9);
    }
  });
});
