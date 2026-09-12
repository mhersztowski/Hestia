/**
 * Rząd metod adaptacyjnych — luka wykryta przy walidacji krzyżowej (etap 7).
 *
 * Sanity check cross-walidacji polegał na wstrzyknięciu usterki: zmieniono
 * współczynnik `A21` w tablicy Dormanda–Prince'a z 1/5 na 1/4. **Nie padł ani
 * jeden test** — ani jednostkowy, ani porównanie ze SciPy.
 *
 * Powód jest pouczający i dotyczy każdej metody ze sterowaniem błędem: zepsuty
 * współczynnik obniża rząd metody, ale sterowanie po prostu **skraca krok**, aż
 * błąd zmieści się w tolerancji. Wynik pozostaje dokładny, płaci się pracą.
 * Cała rodzina testów opartych na dokładności wyniku jest więc na ten błąd
 * ślepa — a to jest dokładnie ten rodzaj usterki, który wchodzi do repozytorium
 * po cichu i zostaje na lata.
 *
 * Wykrywa go jedno narzędzie: **pomiar rzędu** z etapu 0, wykonany przy
 * wyłączonej adaptacji.
 */
import { describe, it, expect } from 'vitest';
import { studyConvergence } from './convergence';
import { dopri5 } from './dopri5';
import { rosenbrock } from './rosenbrock';
import type { Derivative } from './trajectory';

/** Oscylator — gładki i niesztywny, więc rząd widać na nim najczyściej. */
const oscylator: Derivative = (_t, [x, v]) => [v, -x];

/**
 * Przebieg ze **stałym** krokiem.
 *
 * Tolerancja ustawiona absurdalnie luźno, a krok ograniczony z góry: przy takich
 * nastawach każdy krok jest akceptowany i ma zadaną długość, więc solver
 * zachowuje się jak metoda o stałym kroku. Bez tego mierzylibyśmy rząd
 * sterowania błędem, a nie rząd metody.
 */
const zeStalymKrokiem = (
  solver: typeof dopri5,
  y0: number[] = [1, 0],
) => (dt: number) => solver(oscylator, y0, [0, 5], {
  rtol: 1e12, atol: 1e12, dt, maxStep: dt,
});

describe('rząd metody, mierzony a nie zakładany', () => {
  it('Dormand–Prince jest piątego rzędu', () => {
    const raport = studyConvergence(zeStalymKrokiem(dopri5), { dt: 0.1, levels: 4 });

    expect(raport.issues).toEqual([]);
    // Zmierzone 5,0; wstrzyknięcie A21 = 1/4 zbija ten wynik do 2 i test pada.
    expect(raport.order).toBeGreaterThan(4.6);
    expect(raport.order).toBeLessThan(5.4);
  });

  it('RODAS3 jest trzeciego rzędu', () => {
    const raport = studyConvergence(zeStalymKrokiem(rosenbrock), { dt: 0.02, levels: 4 });

    expect(raport.issues).toEqual([]);
    // Pierwsza wersja tej metody dawała 1,09 — brakowało mnożnika γ po prawej
    // stronie. Rząd był jedynym sygnałem; każdy pojedynczy wynik wyglądał dobrze.
    expect(raport.order).toBeGreaterThan(2.7);
    expect(raport.order).toBeLessThan(3.3);
  });
});
