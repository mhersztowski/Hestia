/**
 * Metoda dla układów sztywnych — Etap 3 planu silnika.
 *
 * Sztywność nie znaczy „trudne równanie". Znaczy: w układzie współistnieją dwie
 * skale czasu, z których **szybka już wygasła**, a mimo to narzuca krok. Obwód
 * RC z małą stałą czasową po ułamku sekundy nie robi nic ciekawego, ale metoda
 * jawna musi go dalej liczyć krokiem rzędu tej stałej — nie dla dokładności,
 * tylko dla stabilności, bo inaczej rozwiązanie eksploduje.
 *
 * Metoda niejawna płaci za krok więcej (jakobian i układ równań), ale jej krok
 * nie ma górnego ograniczenia od stabilności. Stąd wynik, który wygląda jak
 * paradoks: dla y' = −10⁶·y jeden krok Rosenbrocka o długości 0,1 s daje wynik,
 * którego metoda jawna nie policzy w stu tysiącach kroków.
 */
import { describe, it, expect } from 'vitest';
import { rosenbrock } from './rosenbrock';
import { dopri5 } from './dopri5';
import type { Derivative } from './trajectory';

/** Rozpad z bardzo krótką stałą czasową — modelowy układ sztywny. */
const szybkiRozpad: Derivative = (_t, [y]) => [-1e6 * y];

/**
 * Klasyczny przykład Hairera: rozwiązanie po transjencie idzie za `cos t`,
 * ale w chwili startu ma składową gasnącą jak e^(−10⁶ t).
 */
const zTransjentem: Derivative = (t, [y]) => [-1e6 * (y - Math.cos(t))];

function counted(f: Derivative) {
  const wrapped = ((t, y) => { wrapped.calls += 1; return f(t, y); }) as Derivative & { calls: number };
  wrapped.calls = 0;
  return wrapped;
}

describe('stabilność przy dużym kroku', () => {
  it('liczy szybki rozpad, którego metoda jawna woli nie liczyć wcale', () => {
    const fNiejawna = counted(szybkiRozpad);
    const traj = rosenbrock(fNiejawna, [1], [0, 0.1], { rtol: 1e-4, dt: 0.01 });

    expect(traj.value('y0', 0.1)).toBeCloseTo(0, 9);
    expect(traj.samples.every((s) => Number.isFinite(s.y[0]))).toBe(true);

    // Zmierzone przed wprowadzeniem detekcji sztywności: metoda niejawna
    // potrzebowała 7,8 tys. wywołań prawej strony, jawna 186 tys. — bo musi
    // trzymać krok poniżej granicy stabilności przez cały przedział, mimo że
    // rozwiązanie od dawna jest zerem. Dziś jawna rozpoznaje to i odmawia,
    // wskazując metodę właściwą.
    expect(fNiejawna.calls).toBeLessThan(20_000);
    expect(() => dopri5(szybkiRozpad, [1], [0, 0.1], { rtol: 1e-4 })).toThrow(/sztywny/i);
  }, 30_000);

  it('wygasza składową szybką monotonicznie co do modułu', () => {
    const traj = rosenbrock(szybkiRozpad, [1], [0, 0.01], { rtol: 1e-3, dt: 0.002 });
    const wartości = traj.samples.map((s) => Math.abs(s.y[0]));

    /**
     * L-stabilność mierzy się **modułem**, nie znakiem.
     *
     * Funkcja stabilności dąży do zera od strony ujemnej, więc kolejne wartości
     * bywają na przemian dodatnie i ujemne — zmierzone: 1 → −1,3·10⁻³ → 1,4·10⁻⁶
     * → −9,8·10⁻¹⁰. To nie są drgania: każda jest o trzy rzędy mniejsza od
     * poprzedniej. Metoda bez L-stabilności zachowywałaby tu **stały** moduł,
     * czyli składowa szybka nigdy by nie znikła.
     */
    for (let i = 1; i < wartości.length; i += 1) {
      expect(wartości[i]).toBeLessThan(wartości[i - 1]);
    }
  });

  it('tam, gdzie metoda jawna się poddaje, ta kończy pracę', () => {
    expect(() => dopri5(zTransjentem, [0], [0, 1], { rtol: 1e-6, maxSteps: 2000 })).toThrow();

    const fNiejawna = counted(zTransjentem);
    const traj = rosenbrock(fNiejawna, [0], [0, 1], { rtol: 1e-6 });

    expect(traj.t1).toBeCloseTo(1, 12);
    // Zmierzone ~22 tys. wywołań; metoda jawna potrzebowałaby ich ponad dwa
    // miliony, bo granica stabilności nie zależy od gładkości rozwiązania —
    // dlatego zamiast liczyć, rozpoznaje sztywność i odsyła tutaj.
    expect(fNiejawna.calls).toBeLessThan(60_000);
  }, 30_000);
});

describe('dokładność', () => {
  it('idzie za rozwiązaniem wolnej składowej po wygaśnięciu transjentu', () => {
    const traj = rosenbrock(zTransjentem, [0], [0, 2], { rtol: 1e-8, atol: 1e-10 });

    // Rozwiązanie ustalone to A·cos t + B·sin t z A = λ²/(1+λ²) i B = −λ/(1+λ²),
    // czyli cos t z poprawką rzędu 10⁻⁶ — dlatego porównanie z samym cosinusem
    // ma sens tylko do czterech cyfr. Zbieżność sprawdza test niżej.
    for (const t of [0.5, 1, 2]) {
      expect(traj.value('y0', t)).toBeCloseTo(Math.cos(t), 4);
    }
  });

  it('zbiega do rozwiązania ustalonego, gdy zaostrza się tolerancję', () => {
    const lambda = -1e6;
    const A = lambda ** 2 / (1 + lambda ** 2);
    const B = -lambda / (1 + lambda ** 2);
    const ustalone = (t: number) => A * Math.cos(t) + B * Math.sin(t);

    const błąd = (rtol: number) => Math.abs(
      rosenbrock(zTransjentem, [0], [0, 2], { rtol, atol: rtol / 100 }).value('y0', 1) - ustalone(1),
    );

    // Zmierzone: 1,4·10⁻² → 6,4·10⁻⁶ → 8,2·10⁻¹⁰ dla kolejnych tolerancji.
    expect(błąd(1e-8)).toBeLessThan(błąd(1e-6) / 100);
    expect(błąd(1e-10)).toBeLessThan(błąd(1e-8) / 100);
  }, 30_000);

  it('odtwarza rozpad wykładniczy z zadaną tolerancją', () => {
    const traj = rosenbrock((_t, [y]) => [-1000 * y], [1], [0, 0.01], { rtol: 1e-9, atol: 1e-12 });
    expect(traj.value('y0', 0.01)).toBeCloseTo(Math.exp(-10), 8);
  });

  it('zaostrzenie tolerancji zmniejsza błąd', () => {
    const błąd = (rtol: number) => Math.abs(
      rosenbrock((_t, [y]) => [-1000 * y], [1], [0, 0.01], { rtol, atol: rtol / 1000 })
        .value('y0', 0.01) - Math.exp(-10),
    );

    expect(błąd(1e-9)).toBeLessThan(błąd(1e-4) / 20);
  });

  it('radzi sobie z układem, w którym sztywność siedzi w sprzężeniu', () => {
    // Dwa równania: szybkie gaśnięcie różnicy i wolny ruch sumy. Jakobian nie
    // jest diagonalny, więc sprawdza to również rozwiązywanie układu.
    const sprzężony: Derivative = (_t, [a, b]) => [
      -1000 * (a - b),
      -0.5 * b,
    ];
    const traj = rosenbrock(sprzężony, [1, 1], [0, 3], { rtol: 1e-8, atol: 1e-10 });

    // Składowa wolna: b(t) = e^(−t/2).
    expect(traj.value('y1', 3)).toBeCloseTo(Math.exp(-1.5), 7);

    /**
     * Składowa szybka **nie** dąży do b, tylko do stanu quasi-ustalonego.
     *
     * Z warunku a = C·b i ȧ = −1000(a − b) wychodzi C = 1000/999,5, a nie
     * przybliżone 1 + 0,0005 — te dwie liczby różnią się o 2,5·10⁻⁷ względnie
     * i test przy tolerancji 10⁻⁸ tę różnicę widzi. Odchyłka jest systematyczna
     * i nie znika przy zaostrzaniu tolerancji, bo nie jest błędem metody, tylko
     * fizyką układu z opóźnieniem.
     */
    expect(traj.value('y0', 3)).toBeCloseTo(Math.exp(-1.5) * (1000 / 999.5), 7);
  });
});

describe('zgodność z resztą pakietu', () => {
  it('zwraca trajektorię z nazwami zmiennych i odczytem po czasie', () => {
    const traj = rosenbrock((_t, [y]) => [-y], [1], [0, 1], { rtol: 1e-8, stateNames: ['u'] });

    expect(traj.stateNames).toEqual(['u']);
    expect(traj.value('u', 1)).toBeCloseTo(Math.exp(-1), 6);
  });

  it('odczyt między próbkami jest lepszy niż cięciwa', () => {
    const traj = rosenbrock((_t, [y]) => [-y], [1], [0, 4], { rtol: 1e-3, atol: 1e-6 });
    const t = (traj.samples[0].t + traj.samples[1].t) / 2;

    // Interpolacja Hermite'a korzysta z pochodnych w węzłach, więc na wypukłej
    // krzywej wykładniczej wypada wyraźnie bliżej niż odcinek.
    const cięciwa = traj.samples[0].y[0]
      + (traj.samples[1].y[0] - traj.samples[0].y[0]) * 0.5;
    expect(Math.abs(traj.value('y0', t) - Math.exp(-t)))
      .toBeLessThan(Math.abs(cięciwa - Math.exp(-t)) / 3);
  });

  it('kończy dokładnie na końcu przedziału', () => {
    expect(rosenbrock((_t, [y]) => [-y], [1], [0, 2.7], { rtol: 1e-6 }).t1).toBeCloseTo(2.7, 12);
  });

  it('przyjmuje jakobian podany wprost, gdy autor go zna', () => {
    // Jakobian liczony różnicami kosztuje n wywołań `f` na krok; podany wprost
    // jest dokładniejszy i tańszy.
    const f = counted((_t, [y]) => [-1000 * y]);
    const traj = rosenbrock(f, [1], [0, 0.01], { rtol: 1e-9, jacobian: () => [[-1000]] });

    expect(traj.value('y0', 0.01)).toBeCloseTo(Math.exp(-10), 8);
  });
});

describe('rozpoznanie sztywności przez metodę jawną', () => {
  it('melduje sztywność szybko, zamiast liczyć do wyczerpania limitu', () => {
    let wywołania = 0;
    const f: Derivative = (_t, [y]) => { wywołania += 1; return [-1e6 * y]; };

    expect(() => dopri5(f, [1], [0, 1], { rtol: 1e-6 })).toThrow(/sztywny/i);
    // Rozpoznanie po kilkudziesięciu krokach, nie po dwustu tysiącach.
    expect(wywołania).toBeLessThan(1000);
  });

  it('wskazuje metodę, której należy użyć', () => {
    expect(() => dopri5((_t, [y]) => [-1e6 * y], [1], [0, 1], { rtol: 1e-6 }))
      .toThrow(/rosenbrock/i);
  });

  it('nie oskarża o sztywność układu, który po prostu szybko zakręca', () => {
    // Orbita ekscentryczna wymaga drobnego kroku w peryhelium, ale z powodu
    // dokładności — i tam metoda jawna jest właściwym wyborem.
    const kepler: Derivative = (_t, [x, y, vx, vy]) => {
      const r = Math.hypot(x, y);
      return [vx, vy, -x / r ** 3, -y / r ** 3];
    };

    expect(() => dopri5(kepler, [0.3, 0, 0, Math.sqrt((2 / 0.3) - 1)], [0, 30], { rtol: 1e-9 }))
      .not.toThrow();
  });
});
