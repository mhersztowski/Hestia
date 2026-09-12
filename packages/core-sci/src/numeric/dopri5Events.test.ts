/**
 * Zdarzenia rozwiązywane wewnątrz kroku — Etap 2, druga połowa.
 *
 * Wzorce są tu wyjątkowo mocne, bo spadek swobodny i odbicie sprężyste mają
 * rozwiązania w postaci zamkniętej: czas lotu z wysokości h to √(2h/g), a piłka
 * odbita ze współczynnikiem restytucji e wraca na wysokość e²h. Obie liczby
 * **nie zależą od kroku całkowania** — i to jest dokładnie ta własność, której
 * dotąd nie mieliśmy.
 */
import { describe, it, expect } from 'vitest';
import { dopri5 } from './dopri5';
import type { EventSpec } from './events';

/** Spadek swobodny: stan [y, v], g = 10. */
const spadek = (_t: number, [, v]: number[]) => [v, -10];

/** Zdarzenie „dotknięcie ziemi" — funkcja zdarzenia to po prostu wysokość. */
const ziemia = (extra: Partial<EventSpec> = {}): EventSpec => ({
  name: 'y = 0',
  g: (_t, [y]) => y,
  direction: 'down',
  ...extra,
});

describe('chwila zdarzenia', () => {
  it('wychodzi dokładnie tam, gdzie przewiduje wzór', () => {
    // Spadek z 5 m przy g = 10 trwa dokładnie 1 s.
    const traj = dopri5(spadek, [5, 0], [0, 10], {
      rtol: 1e-8,
      events: [ziemia({ stop: true })],
    });

    expect(traj.t1).toBeCloseTo(1, 9);
  });

  it('nie zależy od kroku startowego ani od tolerancji', () => {
    const czas = (rtol: number, dt: number) => dopri5(spadek, [5, 0], [0, 10], {
      rtol, dt, events: [ziemia({ stop: true })],
    }).t1;

    // Metoda liczy wielomian bezbłędnie przy każdej tolerancji, więc gdyby
    // zdarzenie było wykrywane po kroku, każda z tych liczb byłaby inna.
    expect(czas(1e-4, 2)).toBeCloseTo(1, 9);
    expect(czas(1e-10, 0.001)).toBeCloseTo(1, 9);
  });

  it('ostatnia próbka trajektorii leży w chwili zdarzenia', () => {
    const traj = dopri5(spadek, [5, 0], [0, 10], { rtol: 1e-8, events: [ziemia({ stop: true })] });
    const ostatnia = traj.samples[traj.samples.length - 1];

    expect(ostatnia.t).toBeCloseTo(1, 9);
    // W chwili dotknięcia ziemi wysokość jest zerem — z dokładnością szukania.
    expect(Math.abs(ostatnia.y[0])).toBeLessThan(1e-8);
  });

  it('zapisuje zdarzenia w trajektorii, z nazwą i stanem', () => {
    const traj = dopri5(spadek, [5, 0], [0, 10], { rtol: 1e-8, events: [ziemia({ stop: true })] });

    expect(traj.events).toHaveLength(1);
    expect(traj.events![0].name).toBe('y = 0');
    expect(traj.events![0].t).toBeCloseTo(1, 9);
    // Prędkość uderzenia: v = −g·t = −10 m/s.
    expect(traj.events![0].y[1]).toBeCloseTo(-10, 6);
    expect(traj.events![0].stopped).toBe(true);
  });
});

describe('odbicie — zdarzenie, które zmienia stan zamiast kończyć', () => {
  const odbicie = (e: number): EventSpec => ({
    name: 'odbicie',
    g: (_t, [y]) => y,
    direction: 'down',
    apply: (_t, [y, v]) => [y, -e * v],
  });

  it('wysokość po odbiciu zgadza się z e²h i nie zależy od tolerancji', () => {
    const wysokość = (rtol: number) => {
      const traj = dopri5(spadek, [5, 0], [0, 1.9], { rtol, events: [odbicie(0.8)] });
      // Szczyt **po odbiciu**: e²·h = 0,64 · 5 = 3,2 m. Maksimum liczone po
      // chwili odbicia, bo inaczej wygrałaby wysokość początkowa.
      const odbicieT = traj.events![0].t;
      let max = 0;
      for (let t = odbicieT; t <= traj.t1; t += 0.001) max = Math.max(max, traj.value('y0', t));
      return max;
    };

    expect(wysokość(1e-6)).toBeCloseTo(3.2, 3);
    expect(wysokość(1e-10)).toBeCloseTo(3.2, 6);
  });

  it('kolejne odbicia następują w chwilach przewidzianych przez wzór', () => {
    const traj = dopri5(spadek, [5, 0], [0, 5], { rtol: 1e-10, events: [odbicie(0.8)] });

    // Pierwsze odbicie po 1 s; każdy następny lot trwa e razy krócej niż
    // podwojony czas spadku, czyli t_n = 1 + 2·(0,8 + 0,8² + …).
    const czasy = traj.events!.map((h) => h.t);
    expect(czasy[0]).toBeCloseTo(1, 8);
    expect(czasy[1]).toBeCloseTo(1 + 2 * 0.8, 7);
    expect(czasy[2]).toBeCloseTo(1 + 2 * (0.8 + 0.64), 6);
  });

  it('nie melduje tego samego odbicia dwa razy pod rząd', () => {
    const traj = dopri5(spadek, [5, 0], [0, 1.5], { rtol: 1e-8, events: [odbicie(0.8)] });

    // Stan tuż po odbiciu leży dokładnie na progu; bez zabezpieczenia solver
    // wpadłby w pętlę meldunków w tym samym punkcie.
    expect(traj.events).toHaveLength(1);
  });
});

describe('kierunek przejścia', () => {
  it('rozróżnia przecięcie progu w górę i w dół', () => {
    // Rzut w górę z 0 m: wysokość przechodzi przez 3 m dwa razy — raz w górę,
    // raz w dół. Zdarzenie „w dół" ma złapać wyłącznie to drugie.
    const rzut = (_t: number, [, v]: number[]) => [v, -10];
    const próg = (direction: 'up' | 'down'): EventSpec => ({
      g: (_t, [y]) => y - 3, direction, stop: true,
    });

    const wGóre = dopri5(rzut, [0, 10], [0, 3], { rtol: 1e-9, events: [próg('up')] });
    const wDół = dopri5(rzut, [0, 10], [0, 3], { rtol: 1e-9, events: [próg('down')] });

    // y = 10t − 5t² = 3 dla t ≈ 0,3675 (w górę) i t ≈ 1,6325 (w dół).
    // 5t² − 10t + 3 = 0 daje t = 1 ∓ √40/10.
    expect(wGóre.t1).toBeCloseTo(1 - Math.sqrt(40) / 10, 7);
    expect(wDół.t1).toBeCloseTo(1 + Math.sqrt(40) / 10, 7);
  });
});

describe('kilka zdarzeń naraz', () => {
  it('wybiera to, które zachodzi wcześniej', () => {
    const traj = dopri5(spadek, [5, 0], [0, 10], {
      rtol: 1e-9,
      events: [
        // Ziemia jest o pół sekundy później niż przekroczenie 1,25 m.
        ziemia({ stop: true }),
        { name: 'y = 1.25', g: (_t, [y]) => y - 1.25, direction: 'down', stop: true },
      ],
    });

    // y = 5 − 5t² = 1,25 dla t = √0,75 ≈ 0,866.
    expect(traj.t1).toBeCloseTo(Math.sqrt(0.75), 8);
    expect(traj.events![0].name).toBe('y = 1.25');
  });
});
