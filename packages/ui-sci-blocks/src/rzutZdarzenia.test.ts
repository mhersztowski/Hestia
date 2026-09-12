/**
 * Rzut ukośny — sprawdzian etapu 2 na dokumencie.
 *
 * Zasięg jest położeniem **w chwili upadku**, więc dokładność zdarzenia
 * przekłada się wprost na dokładność wyniku fizycznego. Bez oporu powietrza
 * zasięg ma postać zamkniętą (v₀²·sin 2α / g), więc dokument daje się sprawdzić
 * rachunkiem — a przy okazji widać, po co zdarzenie ma być rozwiązywane,
 * a nie wypatrywane.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSimSetup, scanFormulas } from './documentModel';

const DOKUMENT = readFileSync(resolve(__dirname, '../documents/rzut-ukosny.md'), 'utf8');

const setup = (solver: string, nastawy: Record<string, unknown>) => {
  const tekst = DOKUMENT.replace('@solver dopri5', `@solver ${solver}`);
  return buildSimSetup(scanFormulas(tekst), JSON.stringify(nastawy));
};

/** Bez oporu, żeby istniał wzór do porównania. */
// „0" bez jednostki nie przejdzie: analiza wymiarowa nie przyjmuje gołej
// liczby tam, gdzie spodziewa się kg/m — i słusznie, bo zero też ma wymiar.
const BEZ_OPORU = { b: '0 kg/m', m: '1 kg', v_0: '20 m/s', alpha: '45 deg', g: '9.81 m/s^2' };
const ZASIĘG = 20 ** 2 * Math.sin(2 * (Math.PI / 4)) / 9.81;

describe('zasięg rzutu bez oporu', () => {
  it('zgadza się ze wzorem, bo chwila upadku jest rozwiązana, a nie zgadnięta', () => {
    const { model, values } = setup('dopri5', BEZ_OPORU);
    const wynik = model.run(values, [0, 10], 0.01);

    expect(wynik.trajectory!.value('x', wynik.trajectory!.t1)).toBeCloseTo(ZASIĘG, 6);
  });

  it('czas lotu też wychodzi z rachunku: 2·v₀·sin α / g', () => {
    const { model, values } = setup('dopri5', BEZ_OPORU);
    const czas = 2 * 20 * Math.sin(Math.PI / 4) / 9.81;

    expect(model.run(values, [0, 10], 0.01).trajectory!.t1).toBeCloseTo(czas, 8);
  });

  it('zdarzenie jest zapisane w trajektorii wraz z chwilą', () => {
    const { model, values } = setup('dopri5', BEZ_OPORU);
    const zdarzenia = model.run(values, [0, 10], 0.01).trajectory!.events!;

    expect(zdarzenia).toHaveLength(1);
    expect(zdarzenia[0].stopped).toBe(true);
  });

  it('metoda o stałym kroku daje ten sam zasięg tylko w granicy drobnego kroku', () => {
    const { model, values } = setup('rk4', BEZ_OPORU);

    const zgrubny = model.run(values, [0, 10], 0.05).trajectory!;
    const drobny = model.run(values, [0, 10], 0.0005).trajectory!;

    // Zdarzenie wykrywane po kroku: im dłuższy krok, tym dalej za próg wybiega
    // pocisk, zanim symulacja to zauważy.
    const błąd = (t: typeof zgrubny) => Math.abs(t.value('x', t.t1) - ZASIĘG);
    expect(błąd(zgrubny)).toBeGreaterThan(błąd(drobny) * 10);
  });
});

describe('opór powietrza', () => {
  it('skraca zasięg poniżej wartości bez oporu', () => {
    const { model, values } = setup('dopri5', { ...BEZ_OPORU, b: '0.01 kg/m' });
    const wynik = model.run(values, [0, 10], 0.01);

    const zasięg = wynik.trajectory!.value('x', wynik.trajectory!.t1);
    expect(zasięg).toBeGreaterThan(0);
    expect(zasięg).toBeLessThan(ZASIĘG);
  });
});
