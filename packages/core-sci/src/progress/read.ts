/**
 * read.ts — co czytelnik już przeczytał.
 *
 * Harmonogram powtórek (`schedule.ts`) mierzy **umiejętność**: ile razy zadanie
 * rozwiązano i kiedy ma wrócić. Przeczytanie podrozdziału jest czym innym —
 * zdarza się raz i nie ma czego powtarzać. Wrzucenie jednego w drugie popsułoby
 * obie miary: statystyka „opanowanych" liczyłaby przeczytane strony, a lista
 * powtórek podsuwałaby wykład zamiast zadania.
 *
 * Stąd osobne pole, ale **ten sam plik postępów**: dwa pliki znaczyłyby dwa
 * miejsca do zsynchronizowania między telefonem a komputerem, a to jest
 * dokładnie ten rodzaj złożoności, który kończy się rozjazdem danych.
 */
import type { Progress } from './schedule';

/**
 * Ślad przeczytania.
 *
 * `at` to **pierwsze** przeczytanie i nigdy się nie zmienia — to informacja
 * o nauce, a nie licznik. Ale powtórki (`revision.ts`) pytają o coś innego:
 * kiedy czytelnik był tu **ostatnio**. Jedna data nie odpowiada na oba pytania,
 * więc ślad niesie trzy liczby zamiast jednej.
 *
 * Starsze pliki mają samo `at` i to jest w porządku — odczyt bierze wtedy `at`
 * jako ostatni raz, co dla pojedynczego czytania jest prawdą.
 */
export interface ReadMark {
  /** Pierwsze przeczytanie; nie nadpisujemy. */
  at: number;
  /** Ostatnie przeczytanie — po nim ustawia się kolejka powtórek. */
  lastAt?: number;
  /** Ile razy; „najrzadziej czytane" to pytanie o liczbę, nie tylko o datę. */
  count?: number;
}

/** Postępy rozszerzone o czytanie; starsze pliki nie mają tego pola. */
export interface ProgressWithReading extends Progress {
  read?: Record<string, ReadMark>;
}

/**
 * Oznacza dokument jako przeczytany.
 *
 * Powtórne oznaczenie **nie nadpisuje daty pierwszego czytania** — ta jest
 * informacją o nauce. Przesuwa natomiast `lastAt` i podbija `count`, bo
 * powtórki muszą wiedzieć, kiedy czytelnik był tu ostatnio; bez tego raz
 * przeczytany podrozdział nigdy by już nie wrócił do kolejki.
 */
export function markRead<T extends ProgressWithReading>(progress: T, path: string, at: number): T {
  const read = progress.read ?? {};
  const slad = read[path];
  const nowy: ReadMark = slad
    ? { at: slad.at, lastAt: at, count: (slad.count ?? 1) + 1 }
    : { at, lastAt: at, count: 1 };
  return { ...progress, read: { ...read, [path]: nowy } };
}

/** Cofa oznaczenie — kliknięcie bywa przypadkowe, a wyniku nie da się inaczej naprawić. */
export function unmarkRead<T extends ProgressWithReading>(progress: T, path: string): T {
  if (!progress.read?.[path]) return progress;
  const read = { ...progress.read };
  delete read[path];
  return { ...progress, read };
}

export function isRead(progress: ProgressWithReading, path: string): boolean {
  return !!progress.read?.[path];
}

export interface ReadingStats {
  read: number;
  total: number;
  /** Procent bazy, zaokrąglony — ułamek procenta nikogo nie interesuje. */
  percent: number;
  /** Ostatnio przeczytane, od najnowszego; do powrotu do lektury. */
  recent: Array<{ path: string; at: number }>;
}

/**
 * Statystyka czytania wobec **obecnej** zawartości bazy.
 *
 * Liczymy przecięcie z listą dokumentów, a nie same wpisy: dokument mógł zostać
 * przemianowany albo usunięty, a jego ślad podbijałby wtedy wynik powyżej stu
 * procent. Wpisu nie kasujemy — gdyby plik wrócił pod tą samą ścieżką, ślad
 * lektury ma wrócić razem z nim.
 */
export function readingStats(
  progress: ProgressWithReading,
  documents: string[],
  limit = 5,
): ReadingStats {
  const read = progress.read ?? {};
  const wBazie = documents.filter((path) => read[path]);

  const recent = wBazie
    .map((path) => ({ path, at: read[path].at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);

  return {
    read: wBazie.length,
    total: documents.length,
    percent: documents.length ? Math.round((wBazie.length / documents.length) * 100) : 0,
    recent,
  };
}
