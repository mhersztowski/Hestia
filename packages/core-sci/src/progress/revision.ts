/**
 * revision.ts — co dziś powtórzyć.
 *
 * `schedule.ts` odpowiada na pytanie „kiedy wrócić do **tego** zadania".
 * Tutaj jest pytanie odwrotne i to ono jest pytaniem czytelnika: **czym się
 * teraz zająć**. Odpowiedź zależy od rodzaju czynności, bo cztery rodzaje mają
 * zupełnie inny rytm:
 *
 *  • przeczytanie podrozdziału wraca rzadko — materiał się nie zmienia,
 *  • pytania jakościowe wracają średnio często,
 *  • zadania rachunkowe trzeba robić regularnie, bo to wprawa,
 *  • test z praw i pojęć jest najkrótszy i może wracać co kilka dni.
 *
 * Dlatego odstęp **nie jest jeden**: każdy rodzaj ma własny, ustawiany przez
 * czytelnika. Sztywna liczba w kodzie znaczyłaby, że autor programu wie lepiej
 * od uczącego się, ile mu potrzeba.
 *
 * Dobór pozycji rządzi się jedną zasadą: **nietknięte przed dawno tkniętymi**.
 * Bez tego powtórki podsuwałyby w kółko materiał już znany, bo on jako jedyny
 * ma jakąkolwiek datę, a nowy nie ma żadnej.
 *
 * Czas wchodzi parametrem, nie z zegara — jak w całej warstwie postępów.
 */
import type { Progress } from './schedule';
import type { ProgressWithReading } from './read';

/** Doba w milisekundach — odstępy podajemy w dniach, bo tak się o nich myśli. */
export const DAY = 86_400_000;

/**
 * Rodzaje czynności.
 *
 * Rozdzielone, bo każdy ma inne źródło i inny rytm, a nie dlatego, że tak
 * wygodniej w interfejsie:
 *
 *  • `subsection` — podrozdział wykładu do przeczytania,
 *  • `questions` — pytania jakościowe z końca rozdziału,
 *  • `exercises` — zadania rachunkowe,
 *  • `test` — sprawdzenie się z praw i haseł słownika.
 */
export type ActivityKind = 'subsection' | 'questions' | 'exercises' | 'test';

export const ACTIVITY_KINDS: readonly ActivityKind[] =
  ['subsection', 'questions', 'exercises', 'test'];

export interface RevisionSettings {
  /** Po ilu dniach rodzaj wraca jako wymagalny. */
  intervalDays: Record<ActivityKind, number>;
  /** Ile pozycji pokazać naraz. */
  batchSize: Record<ActivityKind, number>;
  version: 1;
}

/**
 * Wartości domyślne.
 *
 * Nie są wzięte z sufitu: podrozdział czyta się raz na miesiąc, bo tekst się
 * nie zmienia, a zadania co dwa tygodnie, bo to wprawa, która wietrzeje.
 * Czytelnik i tak je zmieni — chodzi o to, żeby pierwsze uruchomienie miało
 * sens bez konfigurowania.
 */
export function defaultRevisionSettings(): RevisionSettings {
  return {
    intervalDays: { subsection: 30, questions: 21, exercises: 14, test: 7 },
    batchSize: { subsection: 3, questions: 1, exercises: 4, test: 8 },
    version: 1,
  };
}

/** Postępy niosą też nastawy powtórek — jeden plik, jak przy śladach czytania. */
export interface ProgressWithRevision extends ProgressWithReading {
  revision?: RevisionSettings;
}

/** Pozycja, którą można powtórzyć. `id` pusty = cały dokument. */
export interface RevisionCandidate {
  path: string;
  id?: string;
  title: string;
}

export interface RevisionSource {
  subsections: RevisionCandidate[];
  questions: RevisionCandidate[];
  exercises: RevisionCandidate[];
  test: RevisionCandidate[];
}

export interface RevisionItem extends RevisionCandidate {
  kind: ActivityKind;
  /** Kiedy ostatnio; 0 = nigdy. */
  lastAt: number;
  /** Czy minął odstęp dla tego rodzaju (nigdy nietknięte jest wymagalne). */
  due: boolean;
}

export type RevisionPlan = Record<ActivityKind, RevisionItem[]>;

/** Kiedy ostatnio czytano dokument. Starsze pliki mają samo `at`. */
function ostatnieCzytanie(progress: ProgressWithRevision, path: string): number {
  const slad = progress.read?.[path];
  if (!slad) return 0;
  return slad.lastAt ?? slad.at;
}

/** Kiedy ostatnio próbowano pozycji — klucz jak w `schedule.ts`. */
function ostatniaProba(progress: Progress, path: string, id?: string): number {
  return progress.items[`${path}:${id ?? ''}`]?.lastAt ?? 0;
}

function wybierz(
  kandydaci: RevisionCandidate[],
  kiedy: (c: RevisionCandidate) => number,
  kind: ActivityKind,
  settings: RevisionSettings,
  now: number,
): RevisionItem[] {
  const prog = settings.intervalDays[kind] * DAY;
  return kandydaci
    .map((c) => ({ ...c, kind, lastAt: kiedy(c) }))
    // Nietknięte (lastAt = 0) wychodzą na początek same z siebie.
    .sort((a, b) => a.lastAt - b.lastAt)
    .slice(0, Math.max(0, settings.batchSize[kind]))
    .map((x) => ({ ...x, due: x.lastAt === 0 || now - x.lastAt >= prog }));
}

/**
 * Układa plan powtórek dla wszystkich czterech rodzajów.
 *
 * Zadania są wyjątkiem: bierzemy je **z jednego dokumentu**, tego najdawniej
 * ruszanego. Wymieszanie zadań z pięciu rozdziałów daje listę bez tematu,
 * a powtórka ma wracać do materiału, nie do przypadkowych rachunków.
 */
export function planRevision(
  source: RevisionSource,
  progress: ProgressWithRevision,
  settings: RevisionSettings,
  now: number,
): RevisionPlan {
  const zadaniaZJednegoDokumentu = () => {
    if (!source.exercises.length) return [];
    // „Najdawniej ruszany" to dokument o najstarszej **ostatniej** próbie:
    // dokument tknięty wczoraj jest świeży, choćby większość zadań w nim
    // czekała nietknięta.
    const wgDokumentu = new Map<string, RevisionCandidate[]>();
    for (const z of source.exercises) {
      const lista = wgDokumentu.get(z.path) ?? [];
      lista.push(z);
      wgDokumentu.set(z.path, lista);
    }
    let wybrany = '';
    let najstarszy = Number.POSITIVE_INFINITY;
    for (const [path, lista] of wgDokumentu) {
      const ostatni = Math.max(...lista.map((z) => ostatniaProba(progress, z.path, z.id)));
      if (ostatni < najstarszy) { najstarszy = ostatni; wybrany = path; }
    }
    return wgDokumentu.get(wybrany) ?? [];
  };

  return {
    subsection: wybierz(
      source.subsections, (c) => ostatnieCzytanie(progress, c.path), 'subsection', settings, now,
    ),
    questions: wybierz(
      source.questions, (c) => ostatnieCzytanie(progress, c.path), 'questions', settings, now,
    ),
    exercises: wybierz(
      zadaniaZJednegoDokumentu(),
      (c) => ostatniaProba(progress, c.path, c.id), 'exercises', settings, now,
    ),
    test: wybierz(
      source.test, (c) => ostatniaProba(progress, c.path, c.id), 'test', settings, now,
    ),
  };
}

/** Ile pozycji czeka — liczba na przycisk, bez otwierania listy. */
export function dueCount(plan: RevisionPlan): Record<ActivityKind, number> {
  return {
    subsection: plan.subsection.filter((x) => x.due).length,
    questions: plan.questions.filter((x) => x.due).length,
    exercises: plan.exercises.filter((x) => x.due).length,
    test: plan.test.filter((x) => x.due).length,
  };
}
