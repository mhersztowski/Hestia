/**
 * schedule.ts — kiedy wrócić do zadania.
 *
 * Warstwa postępów z raportu (Etap 5). Zapis wyników jest sprawą hosta (VFS),
 * a tutaj mieszka jedyna rzecz, która wymaga decyzji: **odstęp do następnego
 * powtórzenia**. Rośnie, gdy zadanie wychodzi, i wraca do początku, gdy nie.
 *
 * Algorytm jest uproszczonym SM-2: mnożnik odstępu zależy od jakości
 * odpowiedzi, a nie tylko od tego, czy była poprawna. Wykorzystujemy to, czego
 * inne systemy powtórek nie mają za darmo — **liczbę użytych podpowiedzi**.
 * Rozwiązanie z podpowiedzią nie dowodzi tego samego, co rozwiązanie bez niej,
 * więc wraca szybciej.
 *
 * Czas wchodzi parametrem, nie z zegara: inaczej ani testu nie da się napisać,
 * ani stanu odtworzyć.
 */

/** Jak poszła próba — stopniowanie, nie „dobrze/źle". */
export type Quality = 'perfect' | 'hinted' | 'wrong';

export interface ProgressItem {
  /** Ile razy zadanie było rozwiązywane. */
  attempts: number;
  /** Poprawne odpowiedzi pod rząd. */
  streak: number;
  /** Ile razy zadanie „wypadło" po serii poprawnych — mierzy trudność. */
  lapses: number;
  /** Kiedy ostatnio (ms epoch). */
  lastAt: number;
  /** Kiedy wrócić (ms epoch). */
  dueAt: number;
}

export interface Progress {
  /** Klucz to `dokument:zadanie` — identyfikator zadania w całej bazie. */
  items: Record<string, ProgressItem>;
  /** Wersja formatu; zapis idzie do VFS i będzie odczytywany później. */
  version: 1;
}

export interface Attempt {
  quality: Quality;
  at: number;
}

const DZIEN = 24 * 60 * 60 * 1000;

/**
 * Pierwszy odstęp po poprawnej odpowiedzi.
 *
 * Dziesięć minut, nie doba: pierwsze powtórzenie ma trafić jeszcze tego samego
 * dnia, dopóki rozwiązanie jest świeże.
 */
const PIERWSZY = 10 * 60 * 1000;

/** Odstęp po błędzie — na tyle krótki, żeby wrócić w tej samej sesji nauki. */
const PO_BLEDZIE = 5 * 60 * 1000;

/**
 * O ile rośnie odstęp.
 *
 * Samodzielna odpowiedź rozciąga go mocniej niż odpowiedź po podpowiedzi —
 * stąd dwie wartości zamiast jednej stałej.
 */
const MNOZNIK: Record<Exclude<Quality, 'wrong'>, number> = { perfect: 2.5, hinted: 1.6 };

/** Górna granica odstępu; dalej powtórki przestają cokolwiek przypominać. */
const MAKSYMALNY = 180 * DZIEN;

export function emptyProgress(): Progress {
  return { items: {}, version: 1 };
}

/**
 * Zapisuje próbę i wyznacza następny termin.
 *
 * Zwraca nowy obiekt — postępy trafiają do VFS i do stanu Reacta, a mutacja w
 * miejscu gubiłaby jedno albo drugie.
 */
export function recordAttempt(progress: Progress, id: string, attempt: Attempt): Progress {
  const poprzedni = progress.items[id];
  const attempts = (poprzedni?.attempts ?? 0) + 1;

  if (attempt.quality === 'wrong') {
    return {
      ...progress,
      items: {
        ...progress.items,
        [id]: {
          attempts,
          streak: 0,
          // Wypadnięcie liczymy tylko wtedy, gdy zadanie było już opanowane —
          // inaczej pierwsze podejście zawyżałoby trudność każdego zadania.
          lapses: (poprzedni?.lapses ?? 0) + (poprzedni && poprzedni.streak > 0 ? 1 : 0),
          lastAt: attempt.at,
          dueAt: attempt.at + PO_BLEDZIE,
        },
      },
    };
  }

  const streak = (poprzedni?.streak ?? 0) + 1;
  const baza = poprzedni && poprzedni.streak > 0
    ? Math.max(poprzedni.dueAt - poprzedni.lastAt, PIERWSZY)
    : PIERWSZY;

  // Drugie poprawne rozwiązanie wypycha zadanie poza bieżącą sesję: samo
  // mnożenie dziesięciu minut trzymałoby je w tym samym dniu jeszcze przez
  // kilka powtórzeń, a to już nie sprawdza pamięci, tylko świeży ślad.
  const odstep = Math.min(
    Math.max(baza * MNOZNIK[attempt.quality], streak >= 2 ? DZIEN : 0),
    MAKSYMALNY,
  );

  return {
    ...progress,
    items: {
      ...progress.items,
      [id]: {
        attempts,
        streak,
        lapses: poprzedni?.lapses ?? 0,
        lastAt: attempt.at,
        dueAt: attempt.at + Math.round(odstep),
      },
    },
  };
}

/**
 * Zadania czekające na powtórkę, od najbardziej zaległych.
 *
 * Zadania nigdy nierozwiązywane nie trafiają tu wcale — należą do drogi nauki,
 * nie do powtórek. Mieszanie ich zaciera różnicę między „poznaj" a „przypomnij".
 */
export function dueFor(progress: Progress, now: number): string[] {
  return Object.entries(progress.items)
    .filter(([, item]) => item.dueAt <= now)
    .sort(([, a], [, b]) => a.dueAt - b.dueAt)
    .map(([id]) => id);
}

/**
 * Jakość odpowiedzi wyprowadzona z tego, co wie blok zadania.
 *
 * Trzyma w jednym miejscu regułę „podpowiedź obniża ocenę", żeby nie powielać
 * jej w każdym miejscu, które zapisuje wynik.
 */
export function qualityOf(correct: boolean, hintsUsed: number): Quality {
  if (!correct) return 'wrong';
  return hintsUsed > 0 ? 'hinted' : 'perfect';
}

/** Podsumowanie bazy — ile zadań opanowanych, ile do powtórki, ile trudnych. */
export function summarize(progress: Progress, now: number) {
  const wpisy = Object.values(progress.items);
  return {
    seen: wpisy.length,
    due: wpisy.filter((item) => item.dueAt <= now).length,
    // „Opanowane" znaczy trzy poprawne pod rząd — po tylu odstęp przekracza
    // dobę, więc zadanie przestaje wracać w tej samej sesji.
    mastered: wpisy.filter((item) => item.streak >= 3).length,
    struggling: wpisy.filter((item) => item.lapses >= 2).length,
  };
}
