/**
 * Rezonans zmierzony, a nie narysowany — Etap 6 na dokumencie.
 *
 * Rozdział o drganiach wymuszonych podaje dwa zdania, których czytelnik dotąd
 * musiał autorowi uwierzyć: że amplituda ustalona ma maksimum przy częstości
 * bliskiej własnej i że przy słabym tłumieniu to maksimum jest wysokie.
 * Z widmem i pomiarem okresu oba dają się **policzyć z symulacji**.
 */
import { describe, it, expect } from 'vitest';
import { buildModel, dominantFrequency, periodOf, spectrum } from '@hestia/core-sci';

const oscylator = () => buildModel('oscylator').model!;

/** Amplituda ustalona przy wymuszeniu o częstości Ω — po wygaśnięciu transjentu. */
function amplitudaUstalona(Omega: number, c = 0.2): number {
  const wynik = oscylator().run(
    { m: 1, k: 4, c, F_0: 1, Omega, x_0: 0, v_0: 0 }, [0, 400], 0.005,
  );
  const traj = wynik.trajectory!;

  let max = 0;
  for (let t = 300; t <= 400; t += 0.01) max = Math.max(max, Math.abs(traj.value('x', t)));
  return max;
}

describe('krzywa rezonansowa', () => {
  it('ma maksimum przy częstości własnej', () => {
    // ω₀ = √(k/m) = 2 rad/s. Przy tłumieniu c = 0,2 maksimum leży odrobinę
    // niżej, ale wyraźnie powyżej sąsiadów.
    const przy = amplitudaUstalona(2);
    expect(przy).toBeGreaterThan(amplitudaUstalona(1.2));
    expect(przy).toBeGreaterThan(amplitudaUstalona(3.2));
  }, 60_000);

  it('amplituda w rezonansie zgadza się ze wzorem F₀/(c·ω₀)', () => {
    // Przy Ω = ω₀ reaktancje się znoszą i zostaje samo tłumienie:
    // A = F₀/(c·ω₀) = 1/(0,2·2) = 2,5 m.
    expect(amplitudaUstalona(2)).toBeCloseTo(2.5, 1);
  }, 60_000);

  it('słabsze tłumienie daje wyższy szczyt', () => {
    expect(amplitudaUstalona(2, 0.1)).toBeGreaterThan(amplitudaUstalona(2, 0.4));
  }, 60_000);
});

describe('widmo drgania wymuszonego', () => {
  it('po wygaśnięciu transjentu zostaje częstość wymuszenia, nie własna', () => {
    // Układ drga własną częstością 2 rad/s, ale wymuszamy 3,5 rad/s.
    // Po transjencie w widmie ma zostać wyłącznie wymuszenie.
    const wynik = oscylator().run(
      { m: 1, k: 4, c: 0.3, F_0: 1, Omega: 3.5, x_0: 0, v_0: 0 }, [0, 200], 0.005,
    );
    const traj = wynik.trajectory!;

    const ustalone: Array<[number, number]> = [];
    for (let t = 150; t <= 200; t += 0.01) ustalone.push([t, traj.value('x', t)]);

    const f = dominantFrequency(spectrum(ustalone))!;
    // Częstotliwość w hercach: Ω/(2π) = 0,557 Hz.
    expect(f).toBeCloseTo(3.5 / (2 * Math.PI), 2);
  }, 60_000);

  it('drganie swobodne ma w widmie częstość własną', () => {
    const wynik = oscylator().run(
      { m: 1, k: 4, c: 0, F_0: 0, Omega: 0, x_0: 0.1, v_0: 0 }, [0, 100], 0.005,
    );

    const f = dominantFrequency(spectrum(wynik.series.x ?? []))!;
    expect(f).toBeCloseTo(2 / (2 * Math.PI), 2);
  }, 30_000);
});

describe('okres zmierzony na modelu z biblioteki', () => {
  it('dla wahadła przy małym wychyleniu zgadza się ze wzorem szkolnym', () => {
    const wahadlo = buildModel('wahadlo').model!;
    const wynik = wahadlo.run({ L: 1, g: 9.81, theta_0: 0.05 }, [0, 20], 0.002);

    const zmierzony = periodOf(wynik.series.theta ?? [])!;
    expect(zmierzony.period).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 9.81), 3);
    expect(zmierzony.source).toBe('crossings');
  }, 30_000);

  /**
   * To jest zdanie z podręcznika, które dotąd trzeba było przyjąć na wiarę:
   * przy dużym wychyleniu okres rośnie. Teraz jest **zmierzone**.
   */
  it('dla dużego wychylenia okres jest dłuższy — i o tyle, ile przewiduje teoria', () => {
    const wahadlo = buildModel('wahadlo').model!;
    const wynik = wahadlo.run({ L: 1, g: 9.81, theta_0: 2 }, [0, 40], 0.002);

    const szkolny = 2 * Math.PI * Math.sqrt(1 / 9.81);
    const zmierzony = periodOf(wynik.series.theta ?? [])!.period;

    // Pierwsza poprawka: T ≈ T₀·(1 + θ₀²/16) daje przy θ₀ = 2 rad wzrost o 25 %.
    // Pełny wynik (całka eliptyczna) to około 37 %.
    expect(zmierzony / szkolny).toBeGreaterThan(1.3);
    expect(zmierzony / szkolny).toBeLessThan(1.45);
  }, 30_000);
});

describe('dokument o rezonansie', () => {
  it('prosi o widmo i dostaje je', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { buildSimSetup } = await import('./documentModel');
    const { suggestViews } = await import('@hestia/core-sci');

    const markdown = readFileSync(
      resolve(__dirname, '../documents/rezonans.md'), 'utf8',
    );
    const sim = /```sim(?::[\w-]+)?\n([\s\S]*?)```/.exec(markdown)![1];
    const setup = buildSimSetup(markdown, sim);

    expect(setup.issues).toEqual([]);
    expect(suggestViews(setup.model, setup.spec.view).map((v) => v.kind)).toContain('spectrum');
  });

  it('amplituda ustalona zgadza się ze wzorem podanym w tekście', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { buildSimSetup } = await import('./documentModel');

    const markdown = readFileSync(resolve(__dirname, '../documents/rezonans.md'), 'utf8');
    const sim = /```sim(?::[\w-]+)?\n([\s\S]*?)```/.exec(markdown)![1];
    const setup = buildSimSetup(markdown, sim);

    // Nastawy z dokumentu: ω₀ = √(k/m) = 3,162 rad/s, β = 0,15 1/s.
    // W rezonansie A = F₀/(2·m·β·ω₀) = 1/(2·0,15·3,162) = 1,054 m.
    const omega0 = Math.sqrt(10 / 1);
    const wynik = setup.model.run({ ...setup.values, Omega: omega0 }, [0, 400], 0.005);

    let max = 0;
    for (let t = 300; t <= 400; t += 0.01) max = Math.max(max, Math.abs(wynik.trajectory!.value('x', t)));
    expect(max).toBeCloseTo(1 / (2 * 1 * 0.15 * omega0), 1);
  }, 60_000);
});
