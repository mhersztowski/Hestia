/**
 * Badanie zbieżności — Etap 0 planu silnika.
 *
 * Sprawdzamy narzędzie, które ma odpowiadać na pytanie „czy ten wynik jest
 * dobry" **bez znajomości rozwiązania analitycznego**. Testy mają więc dwie
 * warstwy: raport musi trafić w znany rząd metody, a oszacowany błąd musi
 * zgadzać się z błędem prawdziwym tam, gdzie ten drugi da się policzyć.
 */
import { describe, it, expect } from 'vitest';
import { euler, rk4, verlet } from './solvers';
import { studyConvergence, richardson } from './convergence';

/** Oscylator harmoniczny: y = [x, v], x'' = -ω²x. */
const oscillator = (omega: number) => (_t: number, [x, v]: number[]) => [v, -omega * omega * x];
/** Rozwiązanie dokładne dla x(0)=1, v(0)=0. */
const exact = (omega: number, t: number) => Math.cos(omega * t);

const runRk4 = (dt: number) => rk4(oscillator(1), [1, 0], [0, 10], { dt });
const runEuler = (dt: number) => euler(oscillator(1), [1, 0], [0, 5], { dt });
const runVerlet = (dt: number) => verlet(
  (_t, x) => x.map((xi) => -xi), [1], [0], [0, 10], { dt },
);

describe('rząd metody odczytany z zagęszczania kroku', () => {
  it('rozpoznaje RK4 jako metodę czwartego rzędu', () => {
    const report = studyConvergence(runRk4, { dt: 0.2 });
    expect(report.order).toBeGreaterThan(3.6);
    expect(report.order).toBeLessThan(4.4);
  });

  it('rozpoznaje Eulera jako metodę pierwszego rzędu', () => {
    const report = studyConvergence(runEuler, { dt: 0.02 });
    expect(report.order).toBeGreaterThan(0.8);
    expect(report.order).toBeLessThan(1.3);
  });

  it('rozpoznaje Verleta jako metodę drugiego rzędu', () => {
    const report = studyConvergence(runVerlet, { dt: 0.05 });
    expect(report.order).toBeGreaterThan(1.7);
    expect(report.order).toBeLessThan(2.4);
  });
});

describe('oszacowanie błędu', () => {
  it('zgadza się z błędem prawdziwym, choć nie zna rozwiązania', () => {
    const report = studyConvergence(runRk4, { dt: 0.2 });

    // Błąd prawdziwy najgęstszego przebiegu — ten, którego raport dotyczy.
    const finest = report.levels[report.levels.length - 1];
    const prawdziwy = Math.abs(finest.state[0] - exact(1, 10));

    // Ekstrapolacja Richardsona nie jest dokładna, ale ma trafić w rząd
    // wielkości; luźniejsza granica byłaby bezużyteczna, ciaśniejsza krucha.
    expect(report.error).toBeGreaterThan(prawdziwy / 3);
    expect(report.error).toBeLessThan(prawdziwy * 3);
  });

  it('maleje razem z krokiem — mniejszy krok to pewniejszy wynik', () => {
    const zgrubny = studyConvergence(runRk4, { dt: 0.4 });
    const dokładny = studyConvergence(runRk4, { dt: 0.1 });
    expect(dokładny.error).toBeLessThan(zgrubny.error!);
  });

  it('podaje błąd względny obok bezwzględnego', () => {
    const report = studyConvergence(runRk4, { dt: 0.2 });
    // Amplituda oscylatora to 1, więc obie miary są tego samego rzędu.
    expect(report.relative).toBeGreaterThan(0);
    expect(report.relative).toBeLessThan(1);
  });

  it('rozbija błąd na zmienne stanu, po nazwach z trajektorii', () => {
    const report = studyConvergence(runRk4, { dt: 0.2 });
    expect(report.perVariable.map((v) => v.name)).toEqual(['y0', 'y1']);
    for (const variable of report.perVariable) {
      expect(Number.isFinite(variable.error)).toBe(true);
    }
  });
});

describe('przypadki, w których rzędu nie da się odczytać', () => {
  it('melduje precyzję maszynową zamiast zmyślać rząd', () => {
    // Ruch jednostajnie przyspieszony leży w klasie, którą RK4 odtwarza bez
    // błędu metody — różnice między siatkami to sam szum arytmetyki.
    const report = studyConvergence(
      (dt) => rk4((_t, [, v]) => [v, 3], [0, 0], [0, 2], { dt }),
      { dt: 0.1 },
    );

    expect(report.order).toBeUndefined();
    expect(report.issues.join(' ')).toMatch(/precyzj/i);
  });

  it('melduje rozbieżność zamiast zwracać NaN jako wynik', () => {
    // Krok dobrany tak, że jawna metoda przy tej sztywności eksploduje.
    const report = studyConvergence(
      (dt) => euler((_t, [y]) => [-1e6 * y], [1], [0, 1], { dt }),
      { dt: 0.01 },
    );

    expect(report.order).toBeUndefined();
    expect(report.issues.join(' ')).toMatch(/rozbieg|nieskończon/i);
  });

  it('melduje niezgodne długości stanu zamiast porównywać co popadnie', () => {
    const report = studyConvergence(
      (dt) => rk4(oscillator(1), dt > 0.05 ? [1, 0] : [1, 0, 0], [0, 1], { dt }),
      { dt: 0.1 },
    );
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.order).toBeUndefined();
  });
});

describe('nastawy badania', () => {
  it('domyślnie porównuje stan na końcu przedziału', () => {
    const report = studyConvergence(runRk4, { dt: 0.2 });
    expect(report.at).toBe(10);
    expect(report.levels[0].state[0]).toBeCloseTo(exact(1, 10), 1);
  });

  it('pozwala wskazać inną chwilę', () => {
    const report = studyConvergence(runRk4, { dt: 0.2, at: 2 });
    expect(report.at).toBe(2);
    expect(report.levels[0].state[0]).toBeCloseTo(exact(1, 2), 3);
  });

  it('zagęszcza siatkę tyle razy, ile poproszono', () => {
    const report = studyConvergence(runRk4, { dt: 0.2, levels: 4 });
    expect(report.levels.map((l) => l.dt)).toEqual([0.2, 0.1, 0.05, 0.025]);
  });

  it('bez trzeciej siatki nie ma z czego policzyć rzędu', () => {
    const report = studyConvergence(runRk4, { dt: 0.2, levels: 2 });
    expect(report.order).toBeUndefined();
    // Błąd wciąż da się oszacować, o ile rząd metody jest znany z zewnątrz.
    expect(report.error).toBeUndefined();
    expect(report.issues.join(' ')).toMatch(/trzech|trzy/i);
  });
});

describe('ekstrapolacja Richardsona', () => {
  it('składa dwa przybliżenia w dokładniejsze', () => {
    // Przybliżenia rzędu 2: f(h) = 1 + h², więc f(0.1)=1.01, f(0.05)=1.0025.
    const better = richardson(1.01, 1.0025, 2);
    expect(better).toBeCloseTo(1, 12);
  });

  it('dla rzędu 1 sprowadza się do zwykłej ekstrapolacji liniowej', () => {
    expect(richardson(1.2, 1.1, 1)).toBeCloseTo(1, 12);
  });
});
