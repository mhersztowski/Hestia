/**
 * gantt.ts — model wykresu Gantta.
 *
 * Kolejny gatunek: nie graf, nie przebieg, nie tablica, tylko **harmonogram**.
 * Znaczenie niesie położenie zadania w czasie, a to położenie bywa opisane
 * dwojako — datą albo zależnością od innego zadania (`after`, `until`).
 *
 * Dlatego początek i koniec trzymamy jako **pojęcia**, nie jako napisy ani
 * gotowe znaczniki czasu:
 *
 *  • `{ kind: 'date' }` — data wpisana wprost,
 *  • `{ kind: 'after' }` / `{ kind: 'until' }` — odniesienie do innych zadań,
 *  • `{ kind: 'duration' }` — czas trwania, bez własnej daty,
 *  • brak początku — zadanie rusza po poprzednim.
 *
 * Zamiana tego na oś czasu to osobny krok (`ganttSchedule.ts`): wymaga
 * rozwiązania zależności i znajomości formatu dat, a te są własnością
 * dokumentu, nie pojedynczego zadania. Gdyby model trzymał od razu daty, każda
 * zmiana `dateFormat` albo przesunięcie poprzednika wymagałyby przeliczenia
 * całości przy zapisie — i zapis przestałby odpowiadać temu, co napisał autor.
 */

/** Znacznik zadania: stan wykonania, krytyczność, kamień milowy. */
export type GanttTag = 'done' | 'active' | 'crit' | 'milestone';

export const GANTT_TAGS: readonly GanttTag[] = ['done', 'active', 'crit', 'milestone'];

/** Początek zadania. */
export type GanttStart =
  /** Data w formacie dokumentu (`dateFormat`). */
  | { kind: 'date'; value: string }
  /** Po zakończeniu wskazanych zadań — Mermaid dopuszcza kilka naraz. */
  | { kind: 'after'; ids: string[] };

/**
 * Koniec zadania.
 *
 * `until` należy do końca, a nie do początku: „rób to, aż ruszy tamto".
 */
export type GanttEnd =
  | { kind: 'duration'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'until'; ids: string[] };

export interface GanttTask {
  /** Identyfikator — potrzebny tylko wtedy, gdy ktoś się do zadania odwołuje. */
  id?: string;
  label: string;
  tags: GanttTag[];
  start?: GanttStart;
  end?: GanttEnd;
  /**
   * Zapis źródłowy części po dwukropku, gdy rozbiór się nie powiódł.
   *
   * Ta sama zasada co wszędzie: albo rozumiemy pozycję w całości, albo
   * oddajemy ją nietkniętą.
   */
  raw?: string;
}

export interface GanttSection {
  /** Brak etykiety znaczy zadania sprzed pierwszej sekcji. */
  label?: string;
  tasks: GanttTask[];
}

export interface GanttChart {
  title?: string;
  /** Jak czytać daty wpisane w zadaniach, np. `YYYY-MM-DD`. */
  dateFormat?: string;
  /** Jak podpisywać oś, np. `%m-%d`. */
  axisFormat?: string;
  /** Odstęp podziałki osi, np. `1week`. */
  tickInterval?: string;
  /** Dni pomijane w liczeniu czasu, np. `weekends`. */
  excludes?: string;
  /** Dni przywracane mimo `excludes`. */
  includes?: string;
  /** `off` chowa pionową linię „dziś". */
  todayMarker?: string;
  /** Od którego dnia zaczyna się tydzień przy `tickInterval: 1week`. */
  weekday?: string;
  sections: GanttSection[];
  /** Nierozpoznane linie z numerem, żeby wróciły na swoje miejsce. */
  unknown: Array<{ index: number; text: string }>;
}

export function emptyGantt(): GanttChart {
  return { sections: [], unknown: [] };
}

/** Wszystkie zadania w kolejności deklaracji — tej kolejności zależy `after`. */
export function ganttTasks(chart: GanttChart): GanttTask[] {
  return chart.sections.flatMap((section) => section.tasks);
}

/** Znajduje zadanie po identyfikatorze; `undefined`, gdy nie ma takiego. */
export function findTaskById(chart: GanttChart, id: string): GanttTask | undefined {
  return ganttTasks(chart).find((task) => task.id === id);
}

export function taskCount(chart: GanttChart): number {
  return chart.sections.reduce((sum, section) => sum + section.tasks.length, 0);
}

/** Czy zadanie jest kamieniem milowym — rysuje się rombem, nie paskiem. */
export function isMilestone(task: GanttTask): boolean {
  return task.tags.includes('milestone');
}
