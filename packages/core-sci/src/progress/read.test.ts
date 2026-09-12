/**
 * „Przeczytane" jako osobny rodzaj postępu — Etap statystyk bazy wiedzy.
 *
 * Harmonogram powtórek mierzy **umiejętność**: ile razy zadanie rozwiązano
 * i kiedy wróci. To nie jest ta sama rzecz co przeczytanie podrozdziału, które
 * zdarza się raz i nie ma czego powtarzać. Wrzucenie jednego w drugie
 * popsułoby obie miary: statystyka „opanowanych" liczyłaby przeczytane strony,
 * a lista powtórek podsuwałaby wykład zamiast zadania.
 *
 * Stąd osobne pole, ale ten sam plik postępów — inaczej czytelnik miałby dwa
 * miejsca do zsynchronizowania między urządzeniami.
 */
import { describe, it, expect } from 'vitest';
import { emptyProgress } from './schedule';
import { isRead, markRead, readingStats, unmarkRead } from './read';

const CZAS = 1_700_000_000_000;

describe('oznaczanie przeczytanego', () => {
  it('zapamiętuje dokument razem z chwilą', () => {
    const p = markRead(emptyProgress(), 'knowledge/15-1.md', CZAS);

    expect(isRead(p, 'knowledge/15-1.md')).toBe(true);
    expect(p.read['knowledge/15-1.md'].at).toBe(CZAS);
  });

  it('drugie oznaczenie nie nadpisuje pierwszej daty', () => {
    // Data pierwszego przeczytania jest informacją o nauce; kliknięcie tego
    // samego przycisku dwa razy nie znaczy, że czytelnik czytał dwa razy.
    const raz = markRead(emptyProgress(), 'a.md', CZAS);
    const dwa = markRead(raz, 'a.md', CZAS + 100000);

    expect(dwa.read['a.md'].at).toBe(CZAS);
  });

  it('da się cofnąć — kliknięcie bywa przypadkowe', () => {
    const p = unmarkRead(markRead(emptyProgress(), 'a.md', CZAS), 'a.md');

    expect(isRead(p, 'a.md')).toBe(false);
    expect(p.read).toEqual({});
  });

  it('nie rusza harmonogramu zadań', () => {
    const p = markRead({ ...emptyProgress(), items: { 'a.md:z1': { attempts: 1, streak: 1, lapses: 0, lastAt: 1, dueAt: 2 } } }, 'a.md', CZAS);
    expect(p.items['a.md:z1'].attempts).toBe(1);
  });

  it('nie psuje postępów zapisanych, zanim ta funkcja istniała', () => {
    // Plik z VFS bywa starszy niż kod, który go czyta.
    const stary = { items: {}, version: 1 } as Parameters<typeof markRead>[0];
    expect(isRead(stary, 'a.md')).toBe(false);
    expect(readingStats(stary, ['a.md']).read).toBe(0);
  });
});

describe('statystyki czytania', () => {
  const baza = ['15-1.md', '15-2.md', '15-3.md', '15-4.md'];

  it('liczy przeczytane wobec całej bazy', () => {
    let p = markRead(emptyProgress(), '15-1.md', CZAS);
    p = markRead(p, '15-3.md', CZAS);

    const s = readingStats(p, baza);
    expect(s.read).toBe(2);
    expect(s.total).toBe(4);
    expect(s.percent).toBe(50);
  });

  it('pomija wpisy o dokumentach, których już nie ma w bazie', () => {
    // Dokument mógł zostać przemianowany albo usunięty; jego wpis nie może
    // podbijać procentu powyżej stu.
    const p = markRead(markRead(emptyProgress(), '15-1.md', CZAS), 'usuniety.md', CZAS);

    const s = readingStats(p, baza);
    expect(s.read).toBe(1);
    expect(s.percent).toBe(25);
  });

  it('pusta baza nie daje dzielenia przez zero', () => {
    expect(readingStats(emptyProgress(), []).percent).toBe(0);
  });

  it('podaje ostatnio przeczytane, żeby dało się wrócić do lektury', () => {
    let p = markRead(emptyProgress(), '15-1.md', CZAS);
    p = markRead(p, '15-2.md', CZAS + 5000);
    p = markRead(p, '15-3.md', CZAS + 1000);

    expect(readingStats(p, baza).recent.map((r) => r.path)).toEqual(['15-2.md', '15-3.md', '15-1.md']);
  });
});
