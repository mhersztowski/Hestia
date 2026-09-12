/**
 * Event templates — saved lists of relative events that the user can insert
 * in bulk into a markdown document. Each template item carries a *day offset*
 * (relative to a base date) and an optional time-of-day, so the same template
 * can be reused for many concrete days.
 *
 * The base date is normally derived from the file path itself — daily journals
 * live at `Calendar/{yyyy}/{mm}/{dd}.md`, so opening `2026/06/05.md` and
 * applying a template starting at offset 0 produces events on 2026-06-05.
 * For non-dated files we fall back to "today" (and let the user pick another
 * date manually before inserting).
 *
 * Persisted per-user as JSON at `mdeditor/event-templates.json` so they sync
 * across devices like any other VFS-backed setting (notes, favorites, etc.).
 */

import type { EditorFiles } from './capabilities';

export interface EventTemplateItem {
  /** Display name of the event — the title that will appear on the card. */
  name: string;
  /** Days from the base date. 0 = same day, 1 = next day, -1 = day before. */
  dayOffset: number;
  /** Local time-of-day `HH:mm` (24h). Empty string = all-day event. */
  time: string;
  /** Duration in minutes — if > 0 the end time is rendered, otherwise omitted. */
  durationMinutes?: number;
  description?: string;
  /** Optional task link, mirrors EventBlockAttrs. We keep all three fields so
   *  the linkage survives template reuse even if the task was deleted in the
   *  meantime (the saved name/project still render on the card). */
  taskId?: string;
  taskName?: string;
  projectName?: string;
}

export interface EventTemplate {
  id: string;
  name: string;
  description?: string;
  items: EventTemplateItem[];
}

interface EventTemplatesFile {
  templates: EventTemplate[];
}

const TEMPLATES_PATH = 'mdeditor/event-templates.json';

/**
 * The store is the host's, through `EditorFiles`. MyCastle reached for its own
 * `readUserJson(userName, path)`, which put the user in the path; here the host
 * resolves whose drive this is, so the path is all that crosses over.
 *
 * No store means no templates — not an empty list that looks like "you have
 * none saved".
 */
export async function loadTemplates(files: EditorFiles | null): Promise<EventTemplate[]> {
  if (!files) return [];
  try {
    const file = await files.readFile(TEMPLATES_PATH);
    const data = file?.content ? JSON.parse(file.content) as EventTemplatesFile : null;
    if (!data || !Array.isArray(data.templates)) return [];
    // Defensive: drop malformed entries instead of throwing — older files
    // might be missing fields if we evolve the shape later.
    return data.templates.filter(t => t && t.id && Array.isArray(t.items));
  } catch (err) {
    console.warn('[eventTemplates] load failed:', err);
    return [];
  }
}

export async function saveTemplates(
  files: EditorFiles | null,
  templates: EventTemplate[],
): Promise<void> {
  if (!files) return;
  await files.writeFile(TEMPLATES_PATH, JSON.stringify({ templates }, null, 2));
}

/** Generate a stable-enough template id. Crypto.randomUUID is universally
 *  available in modern browsers, but we fall back to a timestamp+random for
 *  robustness in jsdom/old contexts. */
export function makeTemplateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Try to derive a base date from a file path that follows the daily-journal
 * convention `…/{yyyy}/{mm}/{dd}.md` (or without `.md`). Tolerant of:
 *   - leading path segments (Calendar/, drive/Calendar/, etc.)
 *   - one- or two-digit month/day (`6/5` and `06/05` both parse)
 *   - URL-encoded segments (already-decoded path expected)
 *
 * Returns null when the path doesn't match — caller falls back to today.
 */
export function parseDateFromPath(path: string | undefined | null): Date | null {
  if (!path) return null;
  const m = path.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\.md)?$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  // Reject invalid combinations (e.g. 2026-02-30 → 2026-03-02 after rollover)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/** Date → `YYYY-MM-DD` for `<input type="date">`. */
export function dateToInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` → Date at local midnight. Returns null on parse failure. */
export function inputValueToDate(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return isNaN(date.getTime()) ? null : date;
}

/** Date + `HH:mm` time → datetime-local string `YYYY-MM-DDTHH:mm`. */
function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface ResolvedEvent {
  name: string;
  /** datetime-local string `YYYY-MM-DDTHH:mm` (always present for dated events,
   *  date-only at midnight for all-day items). */
  start: string;
  /** Empty when no duration is set. */
  end: string;
  description: string;
  taskId: string;
  taskName: string;
  projectName: string;
}

/**
 * Apply a base date to a template — turns every relative item into a concrete
 * event with `start`/`end` strings the EventDialog and EventBlock accept.
 *
 * `time === ''` produces an all-day event (start at 00:00, no end). When the
 * caller renders this in the editor it's still useful because the day shows up
 * in the date label.
 */
export function applyTemplate(
  template: EventTemplate,
  baseDate: Date,
): ResolvedEvent[] {
  return template.items.map(item => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (item.dayOffset || 0));
    let start = '';
    let end = '';
    if (item.time) {
      const [hh, mm] = item.time.split(':').map(x => parseInt(x, 10));
      if (!isNaN(hh) && !isNaN(mm)) {
        d.setHours(hh, mm, 0, 0);
        start = formatLocalDateTime(d);
        if (item.durationMinutes && item.durationMinutes > 0) {
          const e = new Date(d);
          e.setMinutes(e.getMinutes() + item.durationMinutes);
          end = formatLocalDateTime(e);
        }
      }
    }
    // All-day fallback — still emit a start so the resulting card has a date.
    if (!start) {
      d.setHours(0, 0, 0, 0);
      start = formatLocalDateTime(d);
    }
    return {
      name: item.name,
      start,
      end,
      description: item.description ?? '',
      taskId: item.taskId ?? '',
      taskName: item.taskName ?? '',
      projectName: item.projectName ?? '',
    };
  });
}

/** Human-friendly offset label: "ten dzień" / "+1 dzień" / "-2 dni". */
export function offsetLabel(offset: number): string {
  if (offset === 0) return 'ten dzień';
  if (offset > 0) return `+${offset} ${offset === 1 ? 'dzień' : 'dni'}`;
  const abs = Math.abs(offset);
  return `-${abs} ${abs === 1 ? 'dzień' : 'dni'}`;
}
