/**
 * ganttSchedule.ts — z opisu harmonogramu na oś czasu.
 *
 * Model trzyma to, co napisał autor („po zadaniu a1", „5 dni"), a rysunek
 * potrzebuje dwóch liczb na zadanie. Zamiana jednego w drugie to osobny krok,
 * bo wymaga **rozwiązania zależności**: `after` może wskazywać zadanie zapisane
 * niżej, a `until` — takie, które samo czeka na inne.
 *
 * Dlatego liczymy iteracyjnie, aż przestanie przybywać rozwiązanych zadań.
 * Cykl i odniesienie do nieistniejącego zadania nie przerywają całości: takie
 * zadanie dostaje `issue` i zostaje bez pozycji, a reszta wykresu liczy się
 * normalnie. Diagram z jednym błędem jest wart pokazania — pusty nie jest.
 *
 * Bez zewnętrznej biblioteki dat: obsługujemy tokeny, których naprawdę używa
 * `dateFormat`, a wszystko poza nimi zgłaszamy zamiast zgadywać.
 */
import { ganttTasks, type GanttChart, type GanttTask } from './gantt';

const DAY = 86_400_000;

/** Mnożniki jednostek czasu trwania w zapisie dayjs. */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: DAY,
  w: 7 * DAY,
  // Rok kalendarzowy zależy od daty; w harmonogramie liczonym w dniach
  // przybliżenie wystarcza, a dokładność i tak ginie przy rysowaniu.
  y: 365 * DAY,
};

const DURATION = /^(\d+(?:\.\d+)?)(ms|[smhdwy])$/i;

/** Czas trwania w milisekundach; `undefined`, gdy to nie jest czas trwania. */
export function parseDuration(text: string): number | undefined {
  const match = DURATION.exec(text.trim());
  if (!match) return undefined;
  return Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
}

/** Tokeny formatu daty w kolejności od najdłuższego — inaczej `YYYY` zjadłoby `YY`. */
const TOKENS: Array<[string, string]> = [
  ['YYYY', '(?<year>\\d{4})'],
  ['MM', '(?<month>\\d{2})'],
  ['DD', '(?<day>\\d{2})'],
  ['HH', '(?<hour>\\d{2})'],
  ['mm', '(?<minute>\\d{2})'],
  ['ss', '(?<second>\\d{2})'],
];

const DEFAULT_FORMAT = 'YYYY-MM-DD';

/**
 * Czyta datę zapisaną w formacie dokumentu.
 *
 * Zwraca `undefined`, gdy napis nie pasuje — to jest sygnał, że pole niesie coś
 * innego (`after a1`, czas trwania), a nie powód do podstawienia dzisiejszej
 * daty, jak robi Mermaid. Ciche podstawienie przesuwa pasek w inne miejsce osi
 * i nikt tego nie zauważa.
 */
export function parseDateWithFormat(text: string, format = DEFAULT_FORMAT): Date | undefined {
  const value = text.trim();
  if (format.trim().toUpperCase() === 'X') {
    // Uniksowy znacznik czasu w sekundach — Mermaid dopuszcza `dateFormat X`.
    const seconds = Number(value);
    return Number.isFinite(seconds) && value !== '' ? new Date(seconds * 1000) : undefined;
  }

  let pattern = '';
  let rest = format;
  while (rest.length) {
    const token = TOKENS.find(([name]) => rest.startsWith(name));
    if (token) {
      pattern += token[1];
      rest = rest.slice(token[0].length);
    } else {
      pattern += rest[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rest = rest.slice(1);
    }
  }

  const match = new RegExp(`^${pattern}$`).exec(value);
  if (!match?.groups) return undefined;

  const g = match.groups;
  const year = Number(g.year ?? 1970);
  const month = Number(g.month ?? 1);
  const day = Number(g.day ?? 1);
  const date = new Date(Date.UTC(year, month - 1, day, Number(g.hour ?? 0), Number(g.minute ?? 0), Number(g.second ?? 0)));

  // `Date.UTC` przyjmuje 31 lutego i przesuwa na marzec — sprawdzamy, czy
  // wyszło to, co wpisano, żeby błędna data nie udawała poprawnej.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}

export interface ScheduledTask {
  task: GanttTask;
  /** Miejsce w modelu — po nim wraca się do edycji. */
  sectionIndex: number;
  taskIndex: number;
  start?: Date;
  end?: Date;
  /** Dlaczego zadanie nie trafiło na oś. */
  issue?: string;
}

/** Sekcja z ułożonymi zadaniami — pusta też, bo i ona ma swój wiersz. */
export interface ScheduledSection {
  label?: string;
  tasks: ScheduledTask[];
}

export interface GanttSchedule {
  /** Wszystkie zadania płasko, w kolejności deklaracji — tej kolejności zależy `after`. */
  tasks: ScheduledTask[];
  sections: ScheduledSection[];
  /** Najwcześniejszy początek i najpóźniejszy koniec — zakres osi. */
  from?: Date;
  to?: Date;
}

export interface ScheduleOptions {
  /** Punkt odniesienia dla zadań bez daty; wstrzykiwany, żeby dało się sprawdzić. */
  today?: Date;
}

export function scheduleGantt(chart: GanttChart, options: ScheduleOptions = {}): GanttSchedule {
  const format = chart.dateFormat ?? DEFAULT_FORMAT;
  const today = options.today ?? new Date();

  const scheduled: ScheduledTask[] = [];
  chart.sections.forEach((section, sectionIndex) => {
    section.tasks.forEach((task, taskIndex) => {
      scheduled.push({ task, sectionIndex, taskIndex });
    });
  });

  const byId = new Map<string, ScheduledTask>();
  for (const entry of scheduled) if (entry.task.id) byId.set(entry.task.id, entry);

  /** Zadania odniesienia: wszystkie muszą być już ułożone, żeby dało się liczyć. */
  const resolveRefs = (ids: string[], pick: (entry: ScheduledTask) => Date | undefined) => {
    const dates: Date[] = [];
    for (const id of ids) {
      const entry = byId.get(id);
      if (!entry) return { missing: id };
      const date = pick(entry);
      if (!date) return { pending: true };
      dates.push(date);
    }
    return { dates };
  };

  // Powtarzamy, dopóki przybywa ułożonych zadań. Górne ograniczenie to liczba
  // zadań: każdy przebieg musi rozwiązać co najmniej jedno, inaczej stoimy.
  let progress = true;
  while (progress) {
    progress = false;

    for (let i = 0; i < scheduled.length; i += 1) {
      const entry = scheduled[i];
      if (entry.end || entry.issue) continue;
      const { task } = entry;

      if (task.raw !== undefined) {
        entry.issue = 'Nie rozumiemy zapisu tej pozycji.';
        continue;
      }

      // Początek.
      if (!entry.start) {
        if (!task.start) {
          const previous = scheduled[i - 1];
          if (!previous) entry.start = today;
          else if (previous.end) entry.start = previous.end;
          else if (previous.issue) entry.issue = 'Poprzednie zadanie nie ma miejsca na osi.';
          else continue;
        } else if (task.start.kind === 'date') {
          const date = parseDateWithFormat(task.start.value, format);
          if (!date) entry.issue = `Nie umiemy odczytać daty „${task.start.value}" w formacie ${format}.`;
          else entry.start = date;
        } else {
          const refs = resolveRefs(task.start.ids, (e) => e.end);
          if (refs.missing) entry.issue = `Zadanie „${refs.missing}" nie istnieje.`;
          else if (refs.pending) continue;
          else entry.start = new Date(Math.max(...refs.dates!.map((d) => d.getTime())));
        }
        if (entry.issue) { progress = true; continue; }
        if (!entry.start) continue;
        progress = true;
      }

      // Koniec.
      if (!task.end) {
        entry.end = entry.start;
        progress = true;
        continue;
      }
      if (task.end.kind === 'duration') {
        const ms = parseDuration(task.end.value);
        if (ms === undefined) entry.issue = `Nie umiemy odczytać czasu trwania „${task.end.value}".`;
        else entry.end = new Date(entry.start!.getTime() + ms);
      } else if (task.end.kind === 'date') {
        const date = parseDateWithFormat(task.end.value, format);
        if (!date) entry.issue = `Nie umiemy odczytać daty „${task.end.value}" w formacie ${format}.`;
        else entry.end = date;
      } else {
        const refs = resolveRefs(task.end.ids, (e) => e.start);
        if (refs.missing) entry.issue = `Zadanie „${refs.missing}" nie istnieje.`;
        else if (refs.pending) continue;
        else entry.end = new Date(Math.min(...refs.dates!.map((d) => d.getTime())));
      }
      progress = true;
    }
  }

  // Co zostało nierozwiązane po ustaniu postępu, jest zapętlone.
  for (const entry of scheduled) {
    if (!entry.end && !entry.issue) entry.issue = 'Zależności tego zadania tworzą pętlę.';
  }

  const placed = scheduled.filter((entry) => entry.start && entry.end);
  const from = placed.length ? new Date(Math.min(...placed.map((e) => e.start!.getTime()))) : undefined;
  const to = placed.length ? new Date(Math.max(...placed.map((e) => e.end!.getTime()))) : undefined;

  const sections: ScheduledSection[] = chart.sections.map((section, index) => ({
    label: section.label,
    tasks: scheduled.filter((entry) => entry.sectionIndex === index),
  }));

  return { tasks: scheduled, sections, from, to };
}

/** Ile zadań udało się ułożyć — przydaje się do komunikatu w edytorze. */
export function placedCount(schedule: GanttSchedule): number {
  return schedule.tasks.filter((entry) => entry.start && entry.end).length;
}

/** Wszystkie identyfikatory, do których da się odwołać w `after`/`until`. */
export function referenceableIds(chart: GanttChart): string[] {
  return ganttTasks(chart).map((task) => task.id).filter((id): id is string => !!id);
}
