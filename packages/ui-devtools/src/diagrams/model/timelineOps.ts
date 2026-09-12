/**
 * timelineOps.ts — zmiany na osi wydarzeń.
 *
 * Czyste funkcje `dokument → dokument`. W przeciwieństwie do harmonogramu nic
 * tu nie odwołuje się do niczego — okres nie ma identyfikatora, więc usunięcie
 * czegokolwiek nie może zerwać cudzej zależności. Wszystkie operacje sprowadzają
 * się do przestawiania pozycji na listach.
 */
import type { DiagramDocument } from './diagram';
import { emptyTimeline, type Timeline, type TimelineSection } from './timeline';

function withTimeline(doc: DiagramDocument, change: (timeline: Timeline) => Timeline): DiagramDocument {
  return { ...doc, timeline: change(doc.timeline ?? emptyTimeline()) };
}

function mapSection(timeline: Timeline, index: number, change: (section: TimelineSection) => TimelineSection): Timeline {
  return { ...timeline, sections: timeline.sections.map((section, i) => (i === index ? change(section) : section)) };
}

export function addTimelineSection(doc: DiagramDocument, label: string, afterIndex?: number): DiagramDocument {
  return withTimeline(doc, (timeline) => {
    const sections = [...timeline.sections];
    sections.splice(afterIndex === undefined ? sections.length : afterIndex + 1, 0, { label, periods: [] });
    return { ...timeline, sections };
  });
}

export function updateTimelineSection(doc: DiagramDocument, index: number, label: string): DiagramDocument {
  return withTimeline(doc, (timeline) => mapSection(timeline, index, (section) => ({ ...section, label })));
}

export function removeTimelineSection(doc: DiagramDocument, index: number): DiagramDocument {
  return withTimeline(doc, (timeline) => ({ ...timeline, sections: timeline.sections.filter((_, i) => i !== index) }));
}

export function moveTimelineSection(doc: DiagramDocument, from: number, to: number): DiagramDocument {
  return withTimeline(doc, (timeline) => {
    if (to < 0 || to >= timeline.sections.length) return timeline;
    const sections = [...timeline.sections];
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved);
    return { ...timeline, sections };
  });
}

export function addPeriod(doc: DiagramDocument, sectionIndex: number, label: string, afterIndex?: number): DiagramDocument {
  return withTimeline(doc, (timeline) => {
    // Bez żadnej sekcji zakładamy tę bez nazwy — dokument bez `section` jest
    // poprawny i najczęstszy.
    if (!timeline.sections.length) return { ...timeline, sections: [{ periods: [{ label, events: [] }] }] };
    return mapSection(timeline, sectionIndex, (section) => {
      const periods = [...section.periods];
      periods.splice(afterIndex === undefined ? periods.length : afterIndex + 1, 0, { label, events: [] });
      return { ...section, periods };
    });
  });
}

export function updatePeriod(doc: DiagramDocument, sectionIndex: number, periodIndex: number, label: string): DiagramDocument {
  return withTimeline(doc, (timeline) => mapSection(timeline, sectionIndex, (section) => ({
    ...section,
    periods: section.periods.map((period, i) => (i === periodIndex ? { ...period, label } : period)),
  })));
}

export function removePeriod(doc: DiagramDocument, sectionIndex: number, periodIndex: number): DiagramDocument {
  return withTimeline(doc, (timeline) => mapSection(timeline, sectionIndex, (section) => ({
    ...section,
    periods: section.periods.filter((_, i) => i !== periodIndex),
  })));
}

export function movePeriod(doc: DiagramDocument, sectionIndex: number, from: number, to: number): DiagramDocument {
  return withTimeline(doc, (timeline) => mapSection(timeline, sectionIndex, (section) => {
    if (to < 0 || to >= section.periods.length) return section;
    const periods = [...section.periods];
    const [moved] = periods.splice(from, 1);
    periods.splice(to, 0, moved);
    return { ...section, periods };
  }));
}

/** Przenosi okres do innej sekcji, na jej koniec — razem z wydarzeniami. */
export function movePeriodToSection(
  doc: DiagramDocument,
  fromSection: number,
  periodIndex: number,
  toSection: number,
): DiagramDocument {
  return withTimeline(doc, (timeline) => {
    const period = timeline.sections[fromSection]?.periods[periodIndex];
    if (!period || !timeline.sections[toSection] || fromSection === toSection) return timeline;

    return {
      ...timeline,
      sections: timeline.sections.map((section, i) => {
        if (i === fromSection) return { ...section, periods: section.periods.filter((_, j) => j !== periodIndex) };
        if (i === toSection) return { ...section, periods: [...section.periods, period] };
        return section;
      }),
    };
  });
}

function mapPeriod(
  doc: DiagramDocument,
  sectionIndex: number,
  periodIndex: number,
  change: (events: string[]) => string[],
): DiagramDocument {
  return withTimeline(doc, (timeline) => mapSection(timeline, sectionIndex, (section) => ({
    ...section,
    periods: section.periods.map((period, i) => (i === periodIndex ? { ...period, events: change(period.events) } : period)),
  })));
}

export function addEvent(doc: DiagramDocument, sectionIndex: number, periodIndex: number, text: string, afterIndex?: number): DiagramDocument {
  return mapPeriod(doc, sectionIndex, periodIndex, (events) => {
    const next = [...events];
    next.splice(afterIndex === undefined ? next.length : afterIndex + 1, 0, text);
    return next;
  });
}

export function updateEvent(doc: DiagramDocument, sectionIndex: number, periodIndex: number, eventIndex: number, text: string): DiagramDocument {
  return mapPeriod(doc, sectionIndex, periodIndex, (events) => events.map((e, i) => (i === eventIndex ? text : e)));
}

export function removeEvent(doc: DiagramDocument, sectionIndex: number, periodIndex: number, eventIndex: number): DiagramDocument {
  return mapPeriod(doc, sectionIndex, periodIndex, (events) => events.filter((_, i) => i !== eventIndex));
}

export function moveEvent(doc: DiagramDocument, sectionIndex: number, periodIndex: number, from: number, to: number): DiagramDocument {
  return mapPeriod(doc, sectionIndex, periodIndex, (events) => {
    if (to < 0 || to >= events.length) return events;
    const next = [...events];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

export function setTimelineTitle(doc: DiagramDocument, title: string): DiagramDocument {
  return withTimeline(doc, (timeline) => {
    const next = { ...timeline };
    if (title.trim() === '') delete next.title;
    else next.title = title;
    return next;
  });
}
