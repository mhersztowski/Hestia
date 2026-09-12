import { describe, it, expect } from 'vitest';
import { punktyLamania, stronaDlaOffsetu } from './lamanieStron';

/** Akapity jeden pod drugim, bez przerw — najprostszy dokument. */
const ciag = (wysokosci: number[]) => {
  let top = 0;
  return wysokosci.map((height) => {
    const el = { top, height };
    top += height;
    return el;
  });
};

describe('gdzie kończy się strona', () => {
  it('mieszczące się elementy zostają na jednej stronie', () => {
    expect(punktyLamania(ciag([100, 100, 100]), 400, 300)).toEqual([0]);
  });

  it('strona zaczyna się od elementu, który się nie zmieścił — nie w jego połowie', () => {
    // Trzeci akapit zaczyna się na 200 i sięga 350; przy widoku 300 nie mieści
    // się w całości, więc otwiera nową stronę zamiast być przecięty.
    const punkty = punktyLamania(ciag([100, 100, 150]), 300, 350);
    expect(punkty).toEqual([0, 200]);
  });

  it('nie tnie bloku wysokiego na pół, gdy da się go przenieść w całości', () => {
    // Blok 250 px zaczyna się na 120 — na pierwszej stronie zostałoby z niego
    // 180 px, a reszta wylądowałaby na drugiej.
    const punkty = punktyLamania(ciag([120, 250, 80]), 300, 450);
    expect(punkty[0]).toBe(0);
    expect(punkty[1]).toBe(120);
    // Cały blok mieści się między 120 a 420, czyli w jednej stronie.
    expect(punkty[1] + 300).toBeGreaterThanOrEqual(120 + 250);

    // Ostatni akapit (370..450) nie zmieściłby się już na tej stronie, więc
    // dostaje własną — lepiej pusta przestrzeń niż ucięty wiersz.
    expect(punkty[2]).toBe(370);
  });

  it('element wyższy niż widok dzieli się mimo wszystko — inaczej zniknąłby', () => {
    const punkty = punktyLamania(ciag([50, 700]), 300, 750);
    expect(punkty[0]).toBe(0);
    expect(punkty[1]).toBe(50);
    // 700 px przy widoku 300 to trzy kawałki: 50, 350, 650.
    expect(punkty).toEqual([0, 50, 350, 650]);
  });

  it('po podzielonym bloku kolejne elementy dopełniają ostatnią stronę', () => {
    const punkty = punktyLamania(ciag([700, 100]), 300, 800);
    expect(punkty).toEqual([0, 300, 600]);
  });

  it('nie zostawia pustej strony na końcu', () => {
    // Treść kończy się dokładnie na granicy — dawniej licznik pokazywałby
    // „3 / 3" na stronie bez ani jednego wiersza.
    expect(punktyLamania(ciag([300, 300]), 300, 600)).toEqual([0, 300]);
  });

  it('brak treści to jedna strona, nie zero', () => {
    expect(punktyLamania([], 500, 0)).toEqual([0]);
  });

  it('widok o zerowej wysokości nie zapętla liczenia', () => {
    expect(punktyLamania(ciag([100, 100]), 0, 200)).toEqual([0]);
  });

  it('odstępy między elementami należą do strony, która je poprzedza', () => {
    // Odstęp 14 px między akapitami — element trzeci zaczyna się na 228.
    const elementy = [{ top: 0, height: 100 }, { top: 114, height: 100 }, { top: 228, height: 100 }];
    expect(punktyLamania(elementy, 300, 328)).toEqual([0, 228]);
  });
});

describe('która strona zawiera dane miejsce', () => {
  const punkty = [0, 300, 700, 1200];

  it('początek dokumentu to pierwsza strona', () => {
    expect(stronaDlaOffsetu(punkty, 0)).toBe(0);
  });

  it('miejsce wewnątrz strony wskazuje tę stronę, nie następną', () => {
    expect(stronaDlaOffsetu(punkty, 450)).toBe(1);
    expect(stronaDlaOffsetu(punkty, 699)).toBe(1);
  });

  it('dokładny początek strony należy do niej', () => {
    expect(stronaDlaOffsetu(punkty, 700)).toBe(2);
  });

  it('ułamek z pomiaru układu nie przesuwa granicy', () => {
    // Pomiar zwraca 699,97 dla miejsca, które jest początkiem strony trzeciej.
    expect(stronaDlaOffsetu(punkty, 699.97)).toBe(2);
  });

  it('miejsce za końcem ostatniej strony zostaje na ostatniej', () => {
    expect(stronaDlaOffsetu(punkty, 99999)).toBe(3);
  });

  it('ujemne przewinięcie (odbicie na telefonie) nie wychodzi przed pierwszą stronę', () => {
    expect(stronaDlaOffsetu(punkty, -80)).toBe(0);
  });
});
