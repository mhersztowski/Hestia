/**
 * Testy krzywych uwikłanych i nierówności.
 *
 * Tu nie ma funkcji, którą da się przebiec po osi — jest warunek na całej
 * płaszczyźnie. Sprawdzamy więc trzy rzeczy naraz: czy kontur leży tam, gdzie
 * powinien, czy obszar nierówności jest po właściwej stronie, i czy zmiana
 * znaku **przez nieskończoność** nie tworzy krzywej, której nie ma.
 */

import { describe, it, expect } from 'vitest';
import { marchImplicit, type ImplicitResult } from './implicit';

const OKNO = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };

/** Punkty ze wszystkich odcinków konturu. */
function punkty(wynik: ImplicitResult): Array<[number, number]> {
  return wynik.segments.flatMap(([a, b]) => [a, b]);
}

describe('kontur', () => {
  it('okrąg leży w stałej odległości od środka', () => {
    // f(x,y) = x² + y² − 4 zeruje się dokładnie na okręgu o promieniu 2.
    const wynik = marchImplicit((x, y) => x * x + y * y - 4, OKNO);
    expect(wynik.segments.length).toBeGreaterThan(20);

    for (const [x, y] of punkty(wynik)) {
      expect(Math.hypot(x, y)).toBeCloseTo(2, 1);
    }
  });

  it('prosta zapisana uwikłanie jest prosta', () => {
    const wynik = marchImplicit((x, y) => y - x, OKNO);
    for (const [x, y] of punkty(wynik)) expect(y).toBeCloseTo(x, 1);
  });

  it('hiperbola ma dwie gałęzie po przeciwnych stronach', () => {
    const wynik = marchImplicit((x, y) => x * y - 1, OKNO);
    const znaki = new Set(punkty(wynik).map(([x]) => Math.sign(x)));
    expect(znaki.has(1)).toBe(true);
    expect(znaki.has(-1)).toBe(true);
  });

  it('warunek nigdzie niespełniony daje pusty wynik', () => {
    // x² + y² + 1 jest zawsze dodatnie — nie ma czego rysować.
    expect(marchImplicit((x, y) => x * x + y * y + 1, OKNO).segments).toEqual([]);
  });

  it('kontur nie powstaje tam, gdzie funkcja jest nieokreślona', () => {
    // Cała lewa półpłaszczyzna bez wartości: krzywa nie ma prawa się tam pojawić.
    const wynik = marchImplicit((x, y) => (x < 0 ? Number.NaN : y - x), OKNO);
    expect(punkty(wynik).every(([x]) => x >= -0.5)).toBe(true);
  });
});

describe('fałszywe krzywe przy nieciągłości', () => {
  it('zmiana znaku przez nieskończoność nie tworzy krzywej', () => {
    /*
     * To jest pułapka tej metody. `1/x − y` zmienia znak przy przejściu przez
     * x = 0, bo funkcja skacze z minus nieskończoności do plus — a nie dlatego,
     * że przecina zero. Marching squares sam z siebie narysowałby tam pionową
     * prostą przez cały ekran, której w równaniu nie ma.
     */
    const wynik = marchImplicit((x, y) => 1 / x - y, OKNO);
    const przyZerze = punkty(wynik).filter(([x]) => Math.abs(x) < 0.2);
    expect(przyZerze).toHaveLength(0);
  });

  it('prawdziwe gałęzie hiperboli zostają', () => {
    // Odrzucenie nieciągłości nie może wyciąć samej krzywej.
    const wynik = marchImplicit((x, y) => 1 / x - y, OKNO);
    expect(wynik.segments.length).toBeGreaterThan(5);
  });
});

describe('nierówności', () => {
  it('obszar leży po stronie, gdzie warunek jest spełniony', () => {
    // x² + y² < 4 — wnętrze koła.
    const wynik = marchImplicit((x, y) => x * x + y * y - 4, OKNO, { fill: 'negative' });
    expect(wynik.fills.length).toBeGreaterThan(0);

    for (const komorka of wynik.fills) {
      // Środek każdego wypełnionego kawałka musi spełniać warunek.
      const cx = komorka.x + komorka.width / 2;
      const cy = komorka.y + komorka.height / 2;
      expect(cx * cx + cy * cy).toBeLessThan(4.6);
    }
  });

  it('przeciwna nierówność daje przeciwny obszar', () => {
    const wnetrze = marchImplicit((x, y) => x * x + y * y - 4, OKNO, { fill: 'negative' });
    const zewnetrze = marchImplicit((x, y) => x * x + y * y - 4, OKNO, { fill: 'positive' });

    const poleW = wnetrze.fills.reduce((s, k) => s + k.width * k.height, 0);
    const poleZ = zewnetrze.fills.reduce((s, k) => s + k.width * k.height, 0);
    // Okno ma pole 100, koło około 12,6 — zewnętrze musi być znacznie większe.
    expect(poleZ).toBeGreaterThan(poleW * 3);
  });

  it('pole obszaru zgadza się z geometrią', () => {
    // Koło o promieniu 2 ma pole 4π ≈ 12,57. Wypełnienie komórkami daje
    // przybliżenie, ale rząd wielkości musi się zgadzać — inaczej obszar jest
    // po złej stronie albo w złym miejscu.
    const wynik = marchImplicit((x, y) => x * x + y * y - 4, OKNO, { fill: 'negative' });
    const pole = wynik.fills.reduce((s, k) => s + k.width * k.height, 0);
    expect(pole).toBeGreaterThan(9);
    expect(pole).toBeLessThan(17);
  });

  it('bez prośby o wypełnienie zwraca sam kontur', () => {
    expect(marchImplicit((x, y) => x * x + y * y - 4, OKNO).fills).toEqual([]);
  });

  it('obszar nie wchodzi tam, gdzie funkcja jest nieokreślona', () => {
    const wynik = marchImplicit((x, y) => (x < 0 ? Number.NaN : x * x + y * y - 4), OKNO, { fill: 'negative' });
    expect(wynik.fills.every((k) => k.x >= -0.5)).toBe(true);
  });
});

describe('koszt', () => {
  it('liczba wywołań funkcji jest ograniczona', () => {
    /*
     * Siatka rośnie z kwadratem rozdzielczości, a zagęszczanie przy krawędzi
     * dokłada swoje. Bez twardego limitu okrąg na dużym oknie potrafi zająć
     * kilkaset tysięcy wywołań i zablokować kartę na sekundy.
     */
    let wywolania = 0;
    marchImplicit((x, y) => { wywolania += 1; return x * x + y * y - 4; }, OKNO);
    expect(wywolania).toBeLessThan(60000);
  });

  it('gładka krzywa nie wymaga najgłębszego podziału wszędzie', () => {
    // Zagęszczamy tylko przy krawędzi; wnętrze i dalekie tło zostają rzadkie.
    let wywolania = 0;
    marchImplicit((x, y) => { wywolania += 1; return y - x; }, OKNO);
    expect(wywolania).toBeLessThan(20000);
  });
});
