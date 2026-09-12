/**
 * Liczenie poza wątkiem interfejsu.
 *
 * Testy sprawdzają to, co przy przenoszeniu obliczeń do workera psuje się
 * najczęściej: utratę metod przy klonowaniu i błędy, które gubią numer żądania.
 */
import { describe, it, expect } from 'vitest';
import { computeRequest, handleWorkerMessage, modelFromSource, restoreResult } from './protocol';

const WAHADLO = {
  kind: 'graph' as const,
  formulas: [
    { id: 'ode', body: [
      '@ode', '@state theta, omega', '@d theta = \\omega',
      '@d omega = -\\frac{g}{L}\\sin(\\theta)', '@init theta = \\theta_0, omega = 0',
      '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s',
    ].join('\n') },
    { id: 'okres', body: ['T = 2\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2'].join('\n') },
  ],
};

const SKRYPT = {
  kind: 'script' as const,
  code: `
    return defineModel({
      parameters: [{ name: 'a', unit: 'm/s^2', value: 2 }],
      observables: [{ name: 'droga', kind: 'scalar', unit: 'm' }],
      run: (v: Record<string, number>, tSpan: [number, number]) => ({
        scalars: { droga: 0.5 * v.a * tSpan[1] * tSpan[1] },
        series: {},
      }),
    });
  `,
};

describe('budowanie modelu z opisu', () => {
  it('z wzorów dokumentu', () => {
    const { model } = modelFromSource(WAHADLO);
    expect(model!.parameters.map((p) => p.name).sort()).toEqual(['L', 'g', 'theta_0']);
  });

  it('z kodu skryptu', () => {
    const { model } = modelFromSource(SKRYPT);
    expect(model!.run({ a: 2 }, [0, 3], 0.01).scalars.droga).toBeCloseTo(9, 6);
  });

  it('zepsuty skrypt zwraca powód, nie wyjątek', () => {
    const { model, error } = modelFromSource({ kind: 'script', code: 'const x: = 1;' });
    expect(model).toBeUndefined();
    expect(error).toMatch(/składni/i);
  });
});

describe('żądanie obliczeń', () => {
  const zadanie = {
    id: 7,
    source: WAHADLO,
    values: { L: 1, g: 9.81, theta_0: 0.2 },
    tSpan: [0, 5] as [number, number],
    dt: 0.005,
  };

  it('odpowiedź niesie numer żądania', () => {
    // Odpowiedzi wracają nie po kolei; bez numeru nie da się odrzucić starych.
    expect(computeRequest(zadanie).id).toBe(7);
  });

  it('zwraca wyniki i opis modelu', () => {
    const response = computeRequest(zadanie);
    expect(response.scalars.T).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 9.81), 6);
    expect(response.series.theta.length).toBeGreaterThan(50);
    expect(response.meta.parameters.map((p) => p.name).sort()).toEqual(['L', 'g', 'theta_0']);
    expect(response.error).toBeUndefined();
  });

  it('mierzy czas liczenia', () => {
    let zegar = 1000;
    const response = computeRequest(zadanie, () => (zegar += 25));
    expect(response.elapsedMs).toBeGreaterThan(0);
  });

  it('błąd modelu wraca jako pole, nie jako wyjątek', () => {
    // W workerze rzucony błąd ginie w `onerror` bez numeru żądania — strona nie
    // wiedziałaby, na które pytanie nie ma odpowiedzi.
    const response = computeRequest({
      ...zadanie,
      source: {
        kind: 'script',
        code: 'return defineModel({ parameters: [{name:"a"}], observables: [{name:"x"}], run: () => { throw new Error("bum"); } });',
      },
    });
    expect(response.error).toMatch(/bum/);
    expect(response.id).toBe(7);
  });
});

describe('przenoszenie wyniku przez granicę wątku', () => {
  it('trajektoria odzyskuje metody po odtworzeniu', () => {
    // `postMessage` klonuje dane, ale gubi metody klasy. Bez odtworzenia
    // `trajectory.value()` przestałoby istnieć dokładnie tam, gdzie animacja
    // go potrzebuje.
    const response = computeRequest({
      id: 1, source: WAHADLO, values: { L: 1, g: 9.81, theta_0: 0.2 }, tSpan: [0, 2], dt: 0.005,
    });

    const klon = JSON.parse(JSON.stringify(response));
    expect(typeof klon.trajectory.samples).toBe('object');

    const wynik = restoreResult(klon);
    expect(typeof wynik.trajectory!.value).toBe('function');
    expect(wynik.trajectory!.value('theta', 0)).toBeCloseTo(0.2, 6);
  });

  it('model bez trajektorii nie udaje, że ją ma', () => {
    const response = computeRequest({ id: 1, source: SKRYPT, values: { a: 2 }, tSpan: [0, 3], dt: 0.01 });
    expect(response.trajectory).toBeUndefined();
    expect(restoreResult(response).trajectory).toBeUndefined();
  });

  it('cała odpowiedź przechodzi przez klonowanie strukturalne', () => {
    // To jest dokładnie to, co robi `postMessage` — jeśli w wyniku zostanie
    // funkcja albo klasa, klonowanie rzuci wyjątek.
    const response = computeRequest({
      id: 1, source: WAHADLO, values: { L: 1, g: 9.81, theta_0: 0.1 }, tSpan: [0, 1], dt: 0.01,
    });
    expect(() => structuredClone(response)).not.toThrow();
  });
});

describe('obsługa po stronie workera', () => {
  it('sprowadza się do jednego wywołania', () => {
    const response = handleWorkerMessage({
      id: 3, source: SKRYPT, values: { a: 4 }, tSpan: [0, 2], dt: 0.01,
    });
    expect(response.id).toBe(3);
    expect(response.scalars.droga).toBeCloseTo(8, 6);
  });
});
