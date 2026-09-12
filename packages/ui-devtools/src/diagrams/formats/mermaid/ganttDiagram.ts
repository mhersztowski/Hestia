/**
 * ganttDiagram.ts — Mermaid `gantt` ⇄ model harmonogramu.
 *
 * Cała trudność tego formatu siedzi w jednej linii zadania:
 *
 *     Analiza :done, a1, 2024-01-01, 5d
 *
 * Część po dwukropku to lista pól, a **znaczenie pola wynika z ich liczby**, nie
 * z pozycji bezwzględnej: jedno pole to sam koniec, dwa to początek i koniec,
 * trzy to identyfikator, początek i koniec. Znaczniki (`done`, `crit`…) zdejmuje
 * się z przodu, zanim się cokolwiek policzy — i tylko z przodu, bo dalej to już
 * zwykły tekst.
 *
 * Dlatego rozbiór pozycji jest osobną, wystawioną funkcją (`parseTaskData`):
 * to jedyne miejsce, gdzie ta arytmetyka żyje, i jedyne, które trzeba sprawdzić.
 */
import { emptyDiagram, type DiagramDocument } from '../../model/diagram';
import { emptyGantt, GANTT_TAGS, type GanttChart, type GanttSection, type GanttTag, type GanttTask } from '../../model/gantt';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*gantt\s*$/i;
const SECTION = /^\s*section\s+(.*?)\s*$/i;
/** Etykieta i pozycja rozdzielone pierwszym dwukropkiem. */
const TASK = /^\s*(?<label>[^:]*?)\s*:\s*(?<data>.*?)\s*$/;
/**
 * Linie, które mają dwukropek, ale zadaniem nie są.
 *
 * `click a1 href "https://…"` wygląda jak zadanie o etykiecie `click a1 href
 * "https` — dwukropek w adresie wystarczy, żeby wzorzec zadania zadziałał.
 * Te słowa kluczowe wykluczamy z góry, żeby linia wróciła nietknięta.
 */
const NOT_TASK = /^(?:click|accTitle|accDescr|link|style|classDef|class)\b/i;

/** Ustawienia dokumentu: słowo kluczowe → pole modelu. */
const SETTINGS: Array<[RegExp, keyof GanttChart]> = [
  [/^\s*title\s+(.*?)\s*$/i, 'title'],
  [/^\s*dateFormat\s+(.*?)\s*$/i, 'dateFormat'],
  [/^\s*axisFormat\s+(.*?)\s*$/i, 'axisFormat'],
  [/^\s*tickInterval\s+(.*?)\s*$/i, 'tickInterval'],
  [/^\s*excludes\s+(.*?)\s*$/i, 'excludes'],
  [/^\s*includes\s+(.*?)\s*$/i, 'includes'],
  [/^\s*todayMarker\s+(.*?)\s*$/i, 'todayMarker'],
  [/^\s*weekday\s+(.*?)\s*$/i, 'weekday'],
];

/** Kolejność zapisu ustawień — taka, w jakiej pisze się je w dokumentacji. */
const SETTING_ORDER: Array<[keyof GanttChart, string]> = [
  ['title', 'title'],
  ['dateFormat', 'dateFormat'],
  ['axisFormat', 'axisFormat'],
  ['tickInterval', 'tickInterval'],
  ['weekday', 'weekday'],
  ['excludes', 'excludes'],
  ['includes', 'includes'],
  ['todayMarker', 'todayMarker'],
];

const AFTER = /^after\s+(?<ids>[\w\d\-. ]+)$/i;
const UNTIL = /^until\s+(?<ids>[\w\d\-. ]+)$/i;
/** Czas trwania w zapisie dayjs: `5d`, `2w`, `36h`, `1.5d`. */
const DURATION = /^\d+(?:\.\d+)?(?:ms|[smhdwy])$/i;

function idList(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean);
}

/**
 * Rozbiera część po dwukropku.
 *
 * Zwraca zadanie bez etykiety — tę zna tylko wywołujący. Gdy układ pól nie
 * pasuje do żadnego z trzech wariantów, zapis wraca w `raw` i nie próbujemy
 * zgadywać: przy zapisie oddamy go znak w znak.
 */
export function parseTaskData(data: string): Omit<GanttTask, 'label'> {
  const parts = data.split(',').map((part) => part.trim());

  // Znaczniki stoją z przodu; pierwsze pole, które nim nie jest, kończy listę.
  const tags: GanttTag[] = [];
  while (parts.length && (GANTT_TAGS as readonly string[]).includes(parts[0].toLowerCase())) {
    tags.push(parts.shift()!.toLowerCase() as GanttTag);
  }

  const asEnd = (value: string): GanttTask['end'] => {
    const until = UNTIL.exec(value);
    if (until?.groups) return { kind: 'until', ids: idList(until.groups.ids) };
    if (DURATION.test(value)) return { kind: 'duration', value };
    return { kind: 'date', value };
  };
  const asStart = (value: string): GanttTask['start'] => {
    const after = AFTER.exec(value);
    if (after?.groups) return { kind: 'after', ids: idList(after.groups.ids) };
    return { kind: 'date', value };
  };

  switch (parts.length) {
    case 1:
      // Sam koniec — zadanie rusza tam, gdzie skończyło się poprzednie.
      return { tags, end: asEnd(parts[0]) };
    case 2:
      return { tags, start: asStart(parts[0]), end: asEnd(parts[1]) };
    case 3:
      return { tags, id: parts[0], start: asStart(parts[1]), end: asEnd(parts[2]) };
    default:
      return { tags: [], raw: data };
  }
}

/**
 * Składa pozycję z powrotem.
 *
 * `previousId` jest potrzebne w jednym przypadku: zadanie ma identyfikator, ale
 * nie ma początku. Trzech pól bez początku nie da się zapisać, a dwa Mermaid
 * przeczytałby jako „początek, koniec" i podstawił dzisiejszą datę — pasek
 * przeskoczyłby w inne miejsce osi. Wtedy zapisujemy początek wprost jako
 * `after <poprzednik>`, a gdy poprzednik nie ma nazwy, rezygnujemy z
 * identyfikatora: brak nazwy widać od razu, przesunięty pasek nie.
 */
export function serializeTaskData(task: GanttTask, previousId?: string): string {
  if (task.raw !== undefined) return task.raw;

  const startText = (() => {
    if (!task.start) return undefined;
    return task.start.kind === 'after' ? `after ${task.start.ids.join(' ')}` : task.start.value;
  })();
  const endText = (() => {
    if (!task.end) return undefined;
    if (task.end.kind === 'until') return `until ${task.end.ids.join(' ')}`;
    return task.end.value;
  })();

  const fields: string[] = [...task.tags];
  const start = startText ?? (task.id && previousId ? `after ${previousId}` : undefined);
  if (task.id && start) fields.push(task.id);
  if (start) fields.push(start);
  if (endText) fields.push(endText);

  return fields.join(', ');
}

export function parseGanttDiagram(text: string): ParseResult {
  const doc = emptyDiagram('gantt');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  const chart: GanttChart = emptyGantt();
  let seenHeader = false;

  /** Zadania sprzed pierwszej `section` trafiają do sekcji bez nazwy. */
  const currentSection = (): GanttSection => {
    if (!chart.sections.length) chart.sections.push({ tasks: [] });
    return chart.sections[chart.sections.length - 1];
  };

  front.body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!seenHeader && HEADER.test(line)) { seenHeader = true; return; }
    if (trimmed.startsWith('%%')) { chart.unknown.push({ index, text: line }); return; }

    const section = SECTION.exec(trimmed);
    if (section) { chart.sections.push({ label: section[1], tasks: [] }); return; }

    const setting = SETTINGS.find(([pattern]) => pattern.test(trimmed));
    if (setting) {
      const value = setting[0].exec(trimmed)![1];
      // Wszystkie ustawienia to napisy; typ pola i tak sprawdza `SETTINGS`.
      (chart as unknown as Record<string, string>)[setting[1]] = value;
      return;
    }

    const task = NOT_TASK.test(trimmed) ? null : TASK.exec(trimmed);
    if (task?.groups) {
      currentSection().tasks.push({
        label: task.groups.label,
        ...parseTaskData(task.groups.data),
      });
      return;
    }

    chart.unknown.push({ index, text: line });
  });

  doc.gantt = chart;
  return { document: doc, issues };
}

export function serializeGanttDiagram(doc: DiagramDocument): string {
  const chart = doc.gantt ?? emptyGantt();
  const out: string[] = ['gantt'];

  for (const [key, keyword] of SETTING_ORDER) {
    const value = chart[key];
    if (typeof value === 'string' && value !== '') out.push(`    ${keyword} ${value}`);
  }

  // Odniesienie do poprzednika liczymy przez cały wykres, a nie w obrębie
  // sekcji — Mermaid też tak czyta kolejność zadań.
  let previousId: string | undefined;
  for (const section of chart.sections) {
    if (section.label !== undefined) out.push(`    section ${section.label}`);
    for (const task of section.tasks) {
      const data = serializeTaskData(task, previousId);
      // Zadania w nazwanej sekcji są wcięte głębiej — tak wygląda źródło
      // w dokumentacji Mermaida i tak czyta się je najłatwiej.
      out.push(`${section.label !== undefined ? '        ' : '    '}${task.label} :${data}`);
      if (task.id) previousId = task.id;
    }
  }

  for (const line of [...chart.unknown].sort((a, b) => a.index - b.index)) {
    out.push(`    ${line.text.trim()}`);
  }

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
