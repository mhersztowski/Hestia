/**
 * timeline.ts — model osi wydarzeń.
 *
 * Z pozoru to ten sam gatunek co Gantt, ale niesie co innego: Gantt mówi **jak
 * długo**, oś wydarzeń mówi **kiedy i co**. Okres nie ma tu daty ani czasu
 * trwania — jest etykietą („2002", „XVII wiek", „Faza wstępna"), a wszystko, co
 * do niego należy, to lista wydarzeń. Dlatego żadnego rozwiązywania zależności
 * ani skali czasu: kolejność w dokumencie jest kolejnością na rysunku.
 *
 * Sekcja grupuje okresy; okresy sprzed pierwszej `section` należą do sekcji bez
 * nazwy — tak samo jak w harmonogramie.
 */

export interface TimelinePeriod {
  /** Etykieta okresu — dowolny tekst, nie data. */
  label: string;
  events: string[];
}

export interface TimelineSection {
  /** Brak etykiety znaczy okresy sprzed pierwszej sekcji. */
  label?: string;
  periods: TimelinePeriod[];
}

export interface Timeline {
  title?: string;
  sections: TimelineSection[];
  /** Nierozpoznane linie z numerem, żeby wróciły na swoje miejsce. */
  unknown: Array<{ index: number; text: string }>;
}

export function emptyTimeline(): Timeline {
  return { sections: [], unknown: [] };
}

export function periodCount(timeline: Timeline): number {
  return timeline.sections.reduce((sum, section) => sum + section.periods.length, 0);
}

export function eventCount(timeline: Timeline): number {
  return timeline.sections.reduce(
    (sum, section) => sum + section.periods.reduce((inner, period) => inner + period.events.length, 0),
    0,
  );
}
