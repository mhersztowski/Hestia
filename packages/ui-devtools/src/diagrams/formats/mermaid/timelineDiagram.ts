/**
 * timelineDiagram.ts — Mermaid `timeline` ⇄ model osi wydarzeń.
 *
 * Format jest krótki, ale ma jedną własną sztuczkę: **dwukropek rozdziela
 * wydarzenia**, a linia zaczynająca się od dwukropka dokłada je do poprzedniego
 * okresu. Dwa zapisy znaczą więc dokładnie to samo:
 *
 *     2021 : Koronawirus : Zoom
 *
 *     2021 : Koronawirus
 *          : Zoom
 *
 * Model nie pamięta, który wybrał autor — pamiętanie łamania wierszy niczego by
 * nie wniosło, a przy każdej edycji trzeba by je odtwarzać. Zapisujemy zawsze
 * jednym wierszem.
 *
 * Konsekwencja tej składni: dwukropka nie da się umieścić w treści wydarzenia.
 * Nie obchodzimy tego cudzysłowem, bo Mermaid go nie zna — „Uwaga: ważne"
 * rozpada się na dwa wydarzenia i tak też wraca przy zapisie.
 */
import { emptyDiagram, type DiagramDocument } from '../../model/diagram';
import { emptyTimeline, type Timeline, type TimelineSection } from '../../model/timeline';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*timeline\s*$/i;
const TITLE = /^\s*title\s+(.*?)\s*$/i;
const SECTION = /^\s*section\s+(.*?)\s*$/i;

/** Rozbija wiersz na części rozdzielone dwukropkami, bez pustych. */
function splitParts(text: string): string[] {
  return text.split(':').map((part) => part.trim()).filter((part) => part !== '');
}

export function parseTimelineDiagram(text: string): ParseResult {
  const doc = emptyDiagram('timeline');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  const timeline: Timeline = emptyTimeline();

  const currentSection = (): TimelineSection => {
    if (!timeline.sections.length) timeline.sections.push({ periods: [] });
    return timeline.sections[timeline.sections.length - 1];
  };

  front.body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (HEADER.test(line)) return;
    if (trimmed.startsWith('%%')) { timeline.unknown.push({ index, text: line }); return; }

    const title = TITLE.exec(trimmed);
    if (title) { timeline.title = title[1]; return; }

    const section = SECTION.exec(trimmed);
    if (section) { timeline.sections.push({ label: section[1], periods: [] }); return; }

    // Kontynuacja: wydarzenia bez własnego okresu należą do ostatniego.
    if (trimmed.startsWith(':')) {
      const section = currentSection();
      const last = section.periods[section.periods.length - 1];
      if (!last) { timeline.unknown.push({ index, text: line }); return; }
      last.events.push(...splitParts(trimmed));
      return;
    }

    const [label, ...events] = splitParts(trimmed);
    if (label === undefined) { timeline.unknown.push({ index, text: line }); return; }
    currentSection().periods.push({ label, events });
  });

  doc.timeline = timeline;
  return { document: doc, issues };
}

export function serializeTimelineDiagram(doc: DiagramDocument): string {
  const timeline = doc.timeline ?? emptyTimeline();
  const out: string[] = ['timeline'];

  if (timeline.title) out.push(`    title ${timeline.title}`);

  for (const section of timeline.sections) {
    if (section.label !== undefined) out.push(`    section ${section.label}`);
    for (const period of section.periods) {
      // Okresy w nazwanej sekcji są wcięte głębiej — jak w dokumentacji Mermaida.
      const indent = section.label !== undefined ? '        ' : '    ';
      const events = period.events.length ? ` : ${period.events.join(' : ')}` : '';
      out.push(`${indent}${period.label}${events}`);
    }
  }

  for (const line of [...timeline.unknown].sort((a, b) => a.index - b.index)) {
    out.push(`    ${line.text.trim()}`);
  }

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
