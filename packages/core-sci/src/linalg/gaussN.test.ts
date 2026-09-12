/**
 * Eliminacja Gaussa dla układu dowolnego rozmiaru.
 *
 * Wersja 2×2 pokazuje pomysł, ale nie pokazuje **procedury**: przy dwóch
 * równaniach jest jeden krok eliminacji i wybór elementu głównego nie ma czego
 * wybierać. Sens metody — powtarzalny przebieg kolumna po kolumnie i to, po co
 * przestawia się wiersze — widać dopiero od 3×3.
 *
 * Wybór elementu głównego jest tu **treścią lekcji, nie szczegółem
 * numerycznym**: to on tłumaczy, dlaczego układ prawie osobliwy liczy się źle,
 * gdy dzielimy przez małą liczbę.
 */
import { describe, it, expect } from 'vitest';
import { gaussStepsN } from './procedures';

/** Układ o znanym rozwiązaniu `[1, 2, 3]`. */
const A3: number[][] = [
  [2, 1, -1],
  [-3, -1, 2],
  [-2, 1, 2],
];
const B3 = [2 * 1 + 1 * 2 - 1 * 3, -3 * 1 - 1 * 2 + 2 * 3, -2 * 1 + 1 * 2 + 2 * 3];

describe('przebieg', () => {
  const kroki = gaussStepsN(A3, B3);

  it('zaczyna od układu wyjściowego', () => {
    expect(kroki[0].description).toMatch(/wyjściow/i);
    expect(kroki[0].matrix).toEqual(A3);
  });

  it('kończy rozwiązaniem', () => {
    const ostatni = kroki[kroki.length - 1];
    expect(ostatni.solution).toBeDefined();
    ostatni.solution!.forEach((x, i) => expect(x).toBeCloseTo([1, 2, 3][i], 9));
  });

  it('każdy krok ma opis — to on jest treścią lekcji', () => {
    for (const krok of kroki) expect(krok.description.length).toBeGreaterThan(10);
  });

  it('po eliminacji pod przekątną są zera', () => {
    const przedPodstawieniem = kroki.filter((k) => !k.solution).pop()!;
    for (let i = 1; i < 3; i += 1) {
      for (let j = 0; j < i; j += 1) {
        expect(Math.abs(przedPodstawieniem.matrix[i][j])).toBeLessThan(1e-9);
      }
    }
  });

  it('ma więcej kroków niż układ 2×2 — bo eliminacji jest więcej', () => {
    const male = gaussStepsN([[2, 1], [4, 3]], [5, 11]);
    expect(kroki.length).toBeGreaterThan(male.length);
  });
});

describe('wybór elementu głównego', () => {
  it('przestawia wiersze, gdy na przekątnej stoi zero', () => {
    const kroki = gaussStepsN([[0, 1], [1, 0]], [1, 2]);
    expect(kroki.some((k) => /zamieni|przestawi/i.test(k.description))).toBe(true);
    expect(kroki[kroki.length - 1].solution).toEqual([2, 1]);
  });

  it('wybiera największy element w kolumnie, nie pierwszy niezerowy', () => {
    // To jest cała różnica między „działa" a „działa dokładnie": dzielenie
    // przez małą liczbę powiększa błąd zaokrągleń.
    const kroki = gaussStepsN([[0.0001, 1], [1, 1]], [1, 2]);
    expect(kroki.some((k) => /zamieni|przestawi/i.test(k.description))).toBe(true);

    const wynik = kroki[kroki.length - 1].solution!;
    expect(wynik[0]).toBeCloseTo(1.0001, 3);
    expect(wynik[1]).toBeCloseTo(0.9999, 3);
  });

  it('mówi wprost, dlaczego przestawia', () => {
    const kroki = gaussStepsN([[0.0001, 1], [1, 1]], [1, 2]);
    const zamiana = kroki.find((k) => /zamieni|przestawi/i.test(k.description))!;
    expect(zamiana.description).toMatch(/dokładn|błąd|największ/i);
  });
});

describe('układy bez jednego rozwiązania', () => {
  it('sprzeczny mówi, że rozwiązania nie ma', () => {
    const kroki = gaussStepsN([[1, 1], [2, 2]], [1, 3]);
    const ostatni = kroki[kroki.length - 1];
    expect(ostatni.solution).toBeUndefined();
    expect(ostatni.description).toMatch(/sprzeczn|nie ma rozwiąz/i);
  });

  it('nieoznaczony mówi, że rozwiązań jest nieskończenie wiele', () => {
    const kroki = gaussStepsN([[1, 1], [2, 2]], [1, 2]);
    const ostatni = kroki[kroki.length - 1];
    expect(ostatni.solution).toBeUndefined();
    expect(ostatni.description).toMatch(/nieskończenie|nieoznaczon/i);
  });
});

describe('zgodność z wersją 2×2', () => {
  it('daje to samo rozwiązanie co dotychczasowa procedura', () => {
    const kroki = gaussStepsN([[2, 1], [4, 3]], [5, 11]);
    const wynik = kroki[kroki.length - 1].solution!;
    expect(wynik[0]).toBeCloseTo(2, 9);
    expect(wynik[1]).toBeCloseTo(1, 9);
  });
});
