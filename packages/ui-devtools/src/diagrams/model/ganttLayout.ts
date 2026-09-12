/**
 * ganttLayout.ts — z osi czasu na piksele.
 *
 * Dwie decyzje niosą tu cały ciężar:
 *
 *  • **Podziałka dobiera się do zakresu.** Harmonogram na trzy dni i taki na
 *    dwa lata to ten sam rysunek w innej skali; sztywny krok dzienny dałby
 *    tysiąc kresek albo trzy. Wybieramy najmniejszy krok z listy, przy którym
 *    podziałek jest jeszcze niewiele.
 *
 *  • **Zadanie bez miejsca na osi też dostaje wiersz.** Nie da się narysować
 *    paska, ale wiersz z etykietą i ostrzeżeniem mówi, że coś jest nie tak —
 *    zniknięcie zadania z rysunku wygląda jak jego brak w dokumencie.
 *
 * Czysta geometria, bez DOM-u.
 */
import { isMilestone } from './gantt';
import type { GanttSchedule, ScheduledTask } from './ganttSchedule';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface GanttLayoutOptions {
  /** Szerokość kolumny z etykietami zadań. */
  labelWidth?: number;
  rowHeight?: number;
  /** Szerokość samego pasa czasu (bez etykiet). */
  chartWidth?: number;
  /** Wysokość paska z podziałką. */
  headerHeight?: number;
  /** Wysokość wiersza z nazwą sekcji. */
  sectionHeight?: number;
  /** „Dziś" — pionowa kreska; wstrzykiwane, żeby dało się sprawdzić. */
  today?: Date;
}

export interface GanttRow {
  kind: 'section' | 'task';
  y: number;
  height: number;
  label: string;
  /** Dla wiersza zadania — miejsce w modelu. */
  sectionIndex: number;
  taskIndex?: number;
  entry?: ScheduledTask;
}

export interface GanttBar {
  taskIndex: number;
  sectionIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  milestone: boolean;
  tags: string[];
  label: string;
}

export interface GanttTick {
  x: number;
  label: string;
  /** Kreska główna dostaje mocniejszą linię — np. początek miesiąca. */
  major: boolean;
}

export interface GanttLayout {
  rows: GanttRow[];
  bars: GanttBar[];
  ticks: GanttTick[];
  labelWidth: number;
  chartWidth: number;
  headerHeight: number;
  width: number;
  height: number;
  /** Pozycja pionowej kreski „dziś"; brak, gdy dzisiaj wypada poza zakresem. */
  todayX?: number;
}

/** Kroki podziałki od najgęstszego; pierwszy, który daje mało kresek, wygrywa. */
const STEPS: Array<{ ms: number; label: (date: Date) => string; major: (date: Date) => boolean }> = [
  { ms: HOUR, label: (d) => `${pad(d.getUTCHours())}:00`, major: (d) => d.getUTCHours() === 0 },
  { ms: 6 * HOUR, label: (d) => `${pad(d.getUTCHours())}:00`, major: (d) => d.getUTCHours() === 0 },
  { ms: DAY, label: (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`, major: (d) => d.getUTCDate() === 1 },
  { ms: 2 * DAY, label: (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`, major: (d) => d.getUTCDate() === 1 },
  { ms: 7 * DAY, label: (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`, major: (d) => d.getUTCDate() <= 7 },
  { ms: 14 * DAY, label: (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`, major: (d) => d.getUTCDate() <= 7 },
  { ms: 30 * DAY, label: (d) => `${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`, major: (d) => d.getUTCMonth() === 0 },
  { ms: 90 * DAY, label: (d) => `${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`, major: (d) => d.getUTCMonth() === 0 },
  { ms: 365 * DAY, label: (d) => String(d.getUTCFullYear()), major: () => true },
];

const MAX_TICKS = 14;

/**
 * Zapas po prawej stronie pasa czasu.
 *
 * Kamień milowy na ostatniej dacie ma środek dokładnie na krawędzi — bez
 * zapasu połowa rombu zostaje przycięta razem z krawędzią SVG.
 */
const RIGHT_PADDING = 12;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Krok podziałki dla danego zakresu — najgęstszy, który nie zasypie osi. */
export function pickTickStep(span: number): typeof STEPS[number] {
  return STEPS.find((step) => span / step.ms <= MAX_TICKS) ?? STEPS[STEPS.length - 1];
}

export function layoutGantt(schedule: GanttSchedule, options: GanttLayoutOptions = {}): GanttLayout {
  const labelWidth = options.labelWidth ?? 170;
  const rowHeight = options.rowHeight ?? 26;
  const chartWidth = options.chartWidth ?? 720;
  const headerHeight = options.headerHeight ?? 28;
  const sectionHeight = options.sectionHeight ?? 22;

  const from = schedule.from?.getTime();
  const to = schedule.to?.getTime();
  // Harmonogram jednodniowy miałby zerową szerokość — dajemy mu dzień zapasu.
  const span = from !== undefined && to !== undefined ? Math.max(to - from, DAY) : undefined;
  const scale = (time: number) => (span === undefined ? 0 : ((time - from!) / span) * chartWidth);

  const rows: GanttRow[] = [];
  const bars: GanttBar[] = [];
  let y = headerHeight;

  schedule.sections.forEach((section, sectionIndex) => {
    // Sekcja bez nazwy to zadania sprzed pierwszej `section` — nie ma nagłówka,
    // ale sama pusta sekcja z nazwą wiersz dostaje: inaczej zniknęłaby z widoku
    // i nie dałoby się do niej nic dołożyć.
    if (section.label !== undefined) {
      rows.push({ kind: 'section', y, height: sectionHeight, label: section.label, sectionIndex });
      y += sectionHeight;
    }

    for (const entry of section.tasks) {
      rows.push({
        kind: 'task',
        y,
        height: rowHeight,
        label: entry.task.label,
        sectionIndex: entry.sectionIndex,
        taskIndex: entry.taskIndex,
        entry,
      });

      if (entry.start && entry.end) {
        const x = scale(entry.start.getTime());
        const width = Math.max(scale(entry.end.getTime()) - x, 2);
        bars.push({
          sectionIndex: entry.sectionIndex,
          taskIndex: entry.taskIndex,
          x,
          y: y + 4,
          width,
          height: rowHeight - 8,
          milestone: isMilestone(entry.task),
          tags: entry.task.tags,
          label: entry.task.label,
        });
      }
      y += rowHeight;
    }
  });

  const ticks: GanttTick[] = [];
  if (span !== undefined) {
    const step = pickTickStep(span);
    // Zaczynamy od równej wielokrotności kroku, żeby kreski wypadały na pełnych
    // godzinach i dniach, a nie w losowych momentach zależnych od pierwszej daty.
    const first = Math.floor(from! / step.ms) * step.ms;
    for (let time = first; time <= to!; time += step.ms) {
      if (time < from!) continue;
      const date = new Date(time);
      ticks.push({ x: scale(time), label: step.label(date), major: step.major(date) });
    }
  }

  const today = options.today?.getTime();
  const todayX = span !== undefined && today !== undefined && today >= from! && today <= to!
    ? scale(today)
    : undefined;

  return {
    rows,
    bars,
    ticks,
    labelWidth,
    chartWidth,
    headerHeight,
    width: labelWidth + chartWidth + RIGHT_PADDING,
    height: Math.max(y, headerHeight + rowHeight),
    todayX,
  };
}
