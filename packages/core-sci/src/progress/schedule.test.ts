/**
 * Powtórki rozłożone w czasie.
 *
 * Raport (Etap 5) chce warstwy postępów: wyniki w VFS i powtórki. Sedno nie
 * leży w zapisie, tylko w tym, **kiedy** wrócić do zadania. Testy opisują
 * zachowanie, którego oczekujemy od odstępów, a nie konkretny wzór — dzięki
 * temu wymiana algorytmu nie wymaga przepisywania testów.
 *
 * Czas wchodzi parametrem, nie z zegara: inaczej test „za dwa tygodnie" trwałby
 * dwa tygodnie.
 */
import { describe, it, expect } from 'vitest';
import { recordAttempt, dueFor, emptyProgress, type Progress } from './schedule';

const DZIEN = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

/** Skrót: n poprawnych odpowiedzi pod rząd, każda w terminie powtórki. */
function seria(razy: number, quality: 'perfect' | 'hinted' = 'perfect'): Progress {
  let progress = emptyProgress();
  let czas = START;
  for (let i = 0; i < razy; i += 1) {
    progress = recordAttempt(progress, 'wahadlo:okres', { quality, at: czas });
    czas = progress.items['wahadlo:okres'].dueAt;
  }
  return progress;
}

describe('recordAttempt', () => {
  it('pierwsza poprawna odpowiedź wyznacza termin powtórki', () => {
    const progress = recordAttempt(emptyProgress(), 'wahadlo:okres', { quality: 'perfect', at: START });
    const wpis = progress.items['wahadlo:okres'];

    expect(wpis.dueAt).toBeGreaterThan(START);
    expect(wpis.streak).toBe(1);
    expect(wpis.attempts).toBe(1);
  });

  it('odstępy rosną, gdy zadanie wychodzi za każdym razem', () => {
    // Sens powtórek: to, co umiesz, wraca coraz rzadziej. Bez tego po miesiącu
    // codzienna lista powtórek jest dłuższa niż doba.
    const odstepy = [1, 2, 3, 4, 5].map((n) => {
      const p = seria(n);
      const wpis = p.items['wahadlo:okres'];
      return wpis.dueAt - wpis.lastAt;
    });

    for (let i = 1; i < odstepy.length; i += 1) {
      expect(odstepy[i]).toBeGreaterThan(odstepy[i - 1]);
    }
  });

  it('błędna odpowiedź kasuje serię i przywraca krótki odstęp', () => {
    const dobrze = seria(4);
    const odstepDlugi = dobrze.items['wahadlo:okres'].dueAt - dobrze.items['wahadlo:okres'].lastAt;

    const po = recordAttempt(dobrze, 'wahadlo:okres', {
      quality: 'wrong',
      at: dobrze.items['wahadlo:okres'].dueAt,
    });
    const wpis = po.items['wahadlo:okres'];

    expect(wpis.streak).toBe(0);
    expect(wpis.dueAt - wpis.lastAt).toBeLessThan(odstepDlugi);
    // Historia prób zostaje — po niej widać, że zadanie sprawia kłopot.
    expect(wpis.attempts).toBe(5);
    expect(wpis.lapses).toBe(1);
  });

  it('odpowiedź po podpowiedzi liczy się słabiej niż samodzielna', () => {
    // Podpowiedzi są w dokumencie po to, żeby pomóc — ale rozwiązanie z
    // podpowiedzią nie dowodzi tego samego, co rozwiązanie bez niej.
    const samodzielnie = seria(3, 'perfect').items['wahadlo:okres'];
    const zPodpowiedzia = seria(3, 'hinted').items['wahadlo:okres'];

    expect(zPodpowiedzia.dueAt - zPodpowiedzia.lastAt)
      .toBeLessThan(samodzielnie.dueAt - samodzielnie.lastAt);
  });

  it('nie gubi postępów innych zadań', () => {
    let progress = recordAttempt(emptyProgress(), 'a', { quality: 'perfect', at: START });
    progress = recordAttempt(progress, 'b', { quality: 'wrong', at: START });

    expect(Object.keys(progress.items).sort()).toEqual(['a', 'b']);
  });
});

describe('dueFor', () => {
  const progress = (() => {
    let p = emptyProgress();
    p = recordAttempt(p, 'dzisiaj', { quality: 'wrong', at: START });
    p = recordAttempt(p, 'za-tydzien', { quality: 'perfect', at: START });
    p = recordAttempt(p, 'za-tydzien', { quality: 'perfect', at: p.items['za-tydzien'].dueAt });
    p = recordAttempt(p, 'za-tydzien', { quality: 'perfect', at: p.items['za-tydzien'].dueAt });
    return p;
  })();

  it('podaje zadania, których termin minął', () => {
    const dzis = dueFor(progress, START + 2 * DZIEN);
    expect(dzis).toContain('dzisiaj');
    expect(dzis).not.toContain('za-tydzien');
  });

  it('najbardziej zaległe idą pierwsze', () => {
    let p = emptyProgress();
    p = recordAttempt(p, 'stare', { quality: 'wrong', at: START });
    p = recordAttempt(p, 'nowsze', { quality: 'wrong', at: START + 3 * DZIEN });

    expect(dueFor(p, START + 30 * DZIEN)[0]).toBe('stare');
  });

  it('zadanie nigdy nierozwiązywane nie jest powtórką', () => {
    // Powtórka to powrót do czegoś, co się już widziało. Nowe zadania należą
    // do drogi nauki, nie do listy powtórek — mieszanie ich zaciera różnicę.
    expect(dueFor(emptyProgress(), START)).toEqual([]);
  });
});
