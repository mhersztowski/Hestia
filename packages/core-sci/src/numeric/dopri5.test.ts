/**
 * Dormand–Prince 5(4) — Etap 1 planu silnika.
 *
 * Pierwszy solver w tym pakiecie, któremu **nie podaje się kroku, tylko
 * tolerancję**. To jest różnica gatunkowa, a nie ulepszenie: dotąd autor
 * dokumentu odpowiadał na pytanie „jak gęsto liczyć", na które nie zna
 * odpowiedzi. Teraz odpowiada na pytanie „jak dokładnie", które jest jego
 * pytaniem — a gęstość dobiera solver, i to osobno w każdym miejscu
 * trajektorii.
 *
 * Wzorce jak zawsze analityczne: oscylator, rozpad wykładniczy i orbita
 * ekscentryczna (ta ostatnia dlatego, że wymaga drobnego kroku w peryhelium
 * i grubego w aphelium — czyli dokładnie tego, czego stały krok nie umie).
 */
import { describe, it, expect } from 'vitest';
import { dopri5 } from './dopri5';
import { rk4 } from './solvers';
import { Trajectory } from './trajectory';
import type { Derivative, StepHook } from './trajectory';

const oscillator: Derivative = (_t, [x, v]) => [v, -x];
const exact = (t: number) => Math.cos(t);

/** Opakowanie liczące wywołania prawej strony — to jest prawdziwy koszt. */
function counted(f: Derivative) {
  const wrapped = ((t, y) => { wrapped.calls += 1; return f(t, y); }) as Derivative & { calls: number };
  wrapped.calls = 0;
  return wrapped;
}

describe('dokładność sterowana tolerancją', () => {
  it('trafia w rozwiązanie dokładne bez podanego kroku', () => {
    const traj = dopri5(oscillator, [1, 0], [0, 10], { rtol: 1e-8, atol: 1e-10 });

    for (const t of [0.5, 3, 7, 10]) {
      expect(traj.value('y0', t)).toBeCloseTo(exact(t), 6);
    }
  });

  it('zaostrzenie tolerancji zmniejsza błąd', () => {
    const errorFor = (rtol: number) => {
      const traj = dopri5(oscillator, [1, 0], [0, 20], { rtol, atol: rtol / 1000 });
      return Math.abs(traj.value('y0', 20) - exact(20));
    };

    const luźny = errorFor(1e-4);
    const ciasny = errorFor(1e-8);
    expect(ciasny).toBeLessThan(luźny / 100);
  });

  it('kończy dokładnie na końcu przedziału, nie za nim', () => {
    const traj = dopri5(oscillator, [1, 0], [0, 7.3], { rtol: 1e-6 });
    expect(traj.t1).toBeCloseTo(7.3, 12);
  });

  it('radzi sobie z rozpadem wykładniczym, gdzie krok może rosnąć', () => {
    const traj = dopri5((_t, [y]) => [-0.5 * y], [1], [0, 20], { rtol: 1e-9, atol: 1e-12 });
    expect(traj.value('y0', 20)).toBeCloseTo(Math.exp(-10), 10);
  });
});

describe('adaptacja kroku', () => {
  it('na orbicie ekscentrycznej liczy taniej niż stały krok o tej samej dokładności', () => {
    // Orbita o mimośrodzie ~0,7: w peryhelium potrzeba drobnego kroku, w
    // aphelium wystarcza gruby. Stały krok musi wszędzie użyć tego z peryhelium.
    const kepler: Derivative = (_t, [x, y, vx, vy]) => {
      const r = Math.hypot(x, y);
      const a = -1 / (r * r * r);
      return [vx, vy, a * x, a * y];
    };
    const y0 = [0.3, 0, 0, Math.sqrt((2 / 0.3) - 1)];
    const koniec: [number, number] = [0, 30];

    const fAdapt = counted(kepler);
    const adaptacyjna = dopri5(fAdapt, y0, koniec, { rtol: 1e-9, atol: 1e-12 });

    // Stały krok dobrany tak, żeby RK4 dał porównywalną dokładność końcową.
    const fStaly = counted(kepler);
    const stała = rk4(fStaly, y0, koniec, { dt: 0.0005 });

    const błąd = (traj: Trajectory) => Math.hypot(
      traj.value('y0', 30) - adaptacyjna.value('y0', 30),
      traj.value('y1', 30) - adaptacyjna.value('y1', 30),
    );
    // Sanity: obie liczą to samo zjawisko i się zgadzają.
    expect(błąd(stała)).toBeLessThan(1e-3);

    expect(fAdapt.calls).toBeLessThan(fStaly.calls / 3);
  });

  it('gęstość próbek idzie za zjawiskiem, nie za zegarem', () => {
    const kepler: Derivative = (_t, [x, y, vx, vy]) => {
      const r = Math.hypot(x, y);
      return [vx, vy, -x / r ** 3, -y / r ** 3];
    };
    const traj = dopri5(kepler, [0.3, 0, 0, Math.sqrt((2 / 0.3) - 1)], [0, 20], { rtol: 1e-8 });

    // Odstępy między próbkami muszą się wyraźnie różnić — inaczej nic się nie
    // zaadaptowało i mamy stały krok pod inną nazwą.
    const odstępy = traj.samples.slice(1).map((s, i) => s.t - traj.samples[i].t);
    expect(Math.max(...odstępy) / Math.min(...odstępy)).toBeGreaterThan(5);
  });
});

describe('dense output — odczyt między krokami', () => {
  it('interpoluje wielomianowo, a nie po cięciwie', () => {
    // Luźna tolerancja daje długie kroki; wtedy różnica między interpolacją
    // wielomianową a liniową jest widoczna gołym okiem.
    const traj = dopri5(oscillator, [1, 0], [0, 10], { rtol: 1e-4, atol: 1e-6 });
    const liniowa = new Trajectory(traj.samples, traj.stateNames);

    // Środek najdłuższego kroku — tam cięciwa myli się najbardziej.
    let najdłuższy = 0;
    for (let i = 1; i < traj.samples.length; i += 1) {
      if (traj.samples[i].t - traj.samples[i - 1].t > traj.samples[najdłuższy + 1].t - traj.samples[najdłuższy].t) {
        najdłuższy = i - 1;
      }
    }
    const t = (traj.samples[najdłuższy].t + traj.samples[najdłuższy + 1].t) / 2;

    const błądDense = Math.abs(traj.value('y0', t) - exact(t));
    const błądLiniowy = Math.abs(liniowa.value('y0', t) - exact(t));

    expect(błądDense).toBeLessThan(błądLiniowy / 20);
  });

  it('w węzłach daje dokładnie to, co policzył solver', () => {
    const traj = dopri5(oscillator, [1, 0], [0, 5], { rtol: 1e-6 });
    const próbka = traj.samples[3];
    expect(traj.at(próbka.t)).toEqual(próbka.y);
  });

  it('poza przedziałem nadal nie ekstrapoluje', () => {
    const traj = dopri5(oscillator, [1, 0], [0, 5], { rtol: 1e-6 });
    expect(traj.value('y0', 99)).toBe(traj.value('y0', 5));
  });
});

describe('kiedy solver się poddaje', () => {
  it('melduje przekroczenie limitu kroków zamiast liczyć w nieskończoność', () => {
    // Układ sztywny: jawna metoda musi trzymać krok mikroskopijny ze względu
    // na stabilność, choć rozwiązanie jest gładkie. To jest zapowiedź etapu 3.
    expect(() => dopri5((_t, [y]) => [-1e6 * (y - Math.cos(_t))], [0], [0, 10], {
      rtol: 1e-6, maxSteps: 500,
    })).toThrow(/kroków|sztywn/i);
  });

  it('melduje, gdy krok musiałby zejść poniżej sensownej granicy', () => {
    // Pierwiastek w zerze: pochodna rośnie nieograniczenie i żaden krok nie
    // spełni tolerancji. Cicha odpowiedź byłaby tu gorsza od błędu.
    expect(() => dopri5((_t, [y]) => [1 / Math.max(y, 0) ** 2], [0], [0, 1], {
      rtol: 1e-12, atol: 1e-14, minStep: 1e-10,
    })).toThrow(/krok/i);
  });
});

describe('zgodność z resztą pakietu', () => {
  it('nazywa zmienne stanu tak jak pozostałe solvery', () => {
    const traj = dopri5(oscillator, [1, 0], [0, 1], { rtol: 1e-6, stateNames: ['x', 'v'] });
    expect(traj.stateNames).toEqual(['x', 'v']);
    expect(traj.value('x', 1)).toBeCloseTo(Math.cos(1), 6);
  });

  it('obsługuje zdarzenia tym samym haczykiem co reszta', () => {
    const traj = dopri5((_t, [, v]) => [v, -10], [5, 0], [0, 10], {
      rtol: 1e-8,
      onStep: (_t, [y]) => (y <= 0 ? 'stop' : undefined),
    });

    // Hak zatrzymuje całkowanie — przedziału do końca nie policzył.
    expect(traj.t1).toBeLessThan(10);
    expect(traj.at(traj.t1)[0]).toBeLessThanOrEqual(0);
  });

  /**
   * Granica tego etapu, nazwana wprost.
   *
   * Spadek swobodny jest wielomianem stopnia 2, więc metoda piątego rzędu
   * liczy go **bez błędu** — sterowanie widzi zero i rozciąga krok do granic
   * możliwości. Zdarzenie „y = 0" zostaje wtedy przestrzelone o cały, bardzo
   * długi krok: układ nie robi się przez to mniej dokładny, ale chwila zdarzenia
   * jest zmyślona.
   *
   * Nie jest to usterka do obejścia, tylko powód, dla którego etap 2 istnieje:
   * zdarzenie trzeba **rozwiązać** wewnątrz kroku (dense output daje do tego
   * wszystko, czego potrzeba), a nie wypatrywać na jego końcu.
   */
  it('sam hak nie trafia w chwilę zdarzenia, gdy krok jest długi — to zadanie etapu 2', () => {
    const spadek = (_t: number, [, v]: number[]) => [v, -10];
    const stop: StepHook = (_t, [y]) => (y <= 0 ? 'stop' : undefined);

    const swobodny = dopri5(spadek, [5, 0], [0, 10], { rtol: 1e-8, onStep: stop });
    // Spadek z 5 m przy g = 10 trwa dokładnie 1 s; solver melduje go grubo później.
    expect(swobodny.t1).toBeGreaterThan(2);

    // Ograniczenie kroku z góry jest doraźnym obejściem: kosztuje wywołania `f`
    // i daje dokładność samego kroku, nie tolerancji.
    const zOgraniczeniem = dopri5(spadek, [5, 0], [0, 10], { rtol: 1e-8, maxStep: 0.05, onStep: stop });
    expect(zOgraniczeniem.t1).toBeGreaterThan(0.95);
    expect(zOgraniczeniem.t1).toBeLessThan(1.06);
  });
});
