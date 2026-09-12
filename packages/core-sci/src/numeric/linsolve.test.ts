/**
 * Układ równań liniowych — Etap 3 planu silnika.
 *
 * Metoda niejawna różni się od jawnej dokładnie tym, że w każdym kroku musi
 * **rozwiązać układ**, a nie tylko policzyć prawą stronę. To jest cena za
 * stabilność przy układach sztywnych i jednocześnie powód, dla którego nie
 * używa się jej wszędzie.
 *
 * `linalg/procedures.ts` ma już eliminację Gaussa, ale zwraca **listę kroków
 * z opisem**, bo tam treścią lekcji jest droga. Tutaj potrzeba czegoś
 * odwrotnego: samego wyniku, liczonego setki razy na sekundę.
 */
import { describe, it, expect } from 'vitest';
import { solveLinear } from './linsolve';

describe('rozwiązywanie układu', () => {
  it('rozwiązuje układ 2×2', () => {
    // 2x + y = 5, x − y = 1 → x = 2, y = 1.
    const x = solveLinear([[2, 1], [1, -1]], [5, 1])!;
    expect(x[0]).toBeCloseTo(2, 12);
    expect(x[1]).toBeCloseTo(1, 12);
  });

  it('radzi sobie z zerem na przekątnej dzięki przestawianiu wierszy', () => {
    // Bez wyboru elementu głównego pierwszy krok dzieliłby przez zero.
    const x = solveLinear([[0, 2], [3, 1]], [4, 5])!;
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });

  it('rozwiązuje układ większy, sprawdzalny przez podstawienie', () => {
    const A = [
      [4, -2, 1, 0],
      [-2, 4, -2, 1],
      [1, -2, 4, -2],
      [0, 1, -2, 4],
    ];
    const oczekiwane = [1, -2, 3, 0.5];
    const b = A.map((row) => row.reduce((sum, a, j) => sum + a * oczekiwane[j], 0));

    const x = solveLinear(A, b)!;
    for (let i = 0; i < 4; i += 1) expect(x[i]).toBeCloseTo(oczekiwane[i], 10);
  });

  it('nie psuje macierzy wołającego', () => {
    const A = [[2, 1], [1, -1]];
    const kopia = A.map((row) => [...row]);
    solveLinear(A, [5, 1]);
    expect(A).toEqual(kopia);
  });

  it('zwraca undefined dla układu osobliwego zamiast nieskończoności', () => {
    // Drugi wiersz jest wielokrotnością pierwszego — rozwiązania nie ma
    // albo jest ich nieskończenie wiele. Cicha odpowiedź z NaN byłaby gorsza.
    expect(solveLinear([[1, 2], [2, 4]], [3, 7])).toBeUndefined();
  });
});
