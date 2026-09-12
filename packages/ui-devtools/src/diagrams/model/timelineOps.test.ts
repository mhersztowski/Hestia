import { describe, it, expect } from 'vitest';
import { parseTimelineDiagram, serializeTimelineDiagram } from '../formats/mermaid/timelineDiagram';
import {
  addTimelineSection, updateTimelineSection, removeTimelineSection, moveTimelineSection,
  addPeriod, updatePeriod, removePeriod, movePeriod, movePeriodToSection,
  addEvent, updateEvent, removeEvent, moveEvent, setTimelineTitle,
} from './timelineOps';
import type { DiagramDocument } from './diagram';

const docOf = (lines: string[]): DiagramDocument => parseTimelineDiagram(lines.join('\n')).document;

const BASE = [
  'timeline',
  '    title Dzieje',
  '    section Początki',
  '        2002 : LinkedIn',
  '        2004 : Facebook : Google',
  '    section Rozkwit',
  '        2005 : YouTube',
];

describe('sekcje', () => {
  it('dokłada, zmienia nazwę, przesuwa i usuwa', () => {
    expect(addTimelineSection(docOf(BASE), 'Środek', 0).timeline!.sections.map((s) => s.label))
      .toEqual(['Początki', 'Środek', 'Rozkwit']);
    expect(updateTimelineSection(docOf(BASE), 1, 'Nowa').timeline!.sections[1].label).toBe('Nowa');
    expect(moveTimelineSection(docOf(BASE), 1, 0).timeline!.sections.map((s) => s.label)).toEqual(['Rozkwit', 'Początki']);
    expect(removeTimelineSection(docOf(BASE), 0).timeline!.sections).toHaveLength(1);
  });
});

describe('okresy', () => {
  it('nowy okres nie ma wydarzeń', () => {
    expect(addPeriod(docOf(BASE), 0, '2003').timeline!.sections[0].periods[2]).toEqual({ label: '2003', events: [] });
  });

  it('wstawia okres pod wskazanym', () => {
    const labels = addPeriod(docOf(BASE), 0, '2003', 0).timeline!.sections[0].periods.map((p) => p.label);
    expect(labels).toEqual(['2002', '2003', '2004']);
  });

  it('zmienia etykietę i kolejność', () => {
    expect(updatePeriod(docOf(BASE), 0, 0, '2001').timeline!.sections[0].periods[0].label).toBe('2001');
    expect(movePeriod(docOf(BASE), 0, 1, 0).timeline!.sections[0].periods.map((p) => p.label)).toEqual(['2004', '2002']);
  });

  it('przenosi okres do innej sekcji razem z wydarzeniami', () => {
    const next = movePeriodToSection(docOf(BASE), 0, 1, 1);
    expect(next.timeline!.sections[0].periods.map((p) => p.label)).toEqual(['2002']);
    expect(next.timeline!.sections[1].periods[1]).toEqual({ label: '2004', events: ['Facebook', 'Google'] });
  });

  it('usuwa okres', () => {
    expect(removePeriod(docOf(BASE), 0, 0).timeline!.sections[0].periods.map((p) => p.label)).toEqual(['2004']);
  });

  it('okres bez sekcji zakłada sekcję bez nazwy', () => {
    const doc = parseTimelineDiagram('timeline').document;
    const next = addPeriod(doc, 0, '2000');
    expect(next.timeline!.sections[0].label).toBeUndefined();
    expect(serializeTimelineDiagram(next)).toBe(['timeline', '    2000'].join('\n'));
  });
});

describe('wydarzenia', () => {
  it('dokłada na koniec i pod wskazanym', () => {
    expect(addEvent(docOf(BASE), 0, 1, 'Flickr').timeline!.sections[0].periods[1].events)
      .toEqual(['Facebook', 'Google', 'Flickr']);
    expect(addEvent(docOf(BASE), 0, 1, 'Flickr', 0).timeline!.sections[0].periods[1].events)
      .toEqual(['Facebook', 'Flickr', 'Google']);
  });

  it('zmienia treść, kolejność i usuwa', () => {
    expect(updateEvent(docOf(BASE), 0, 0, 0, 'LinkedIn (start)').timeline!.sections[0].periods[0].events)
      .toEqual(['LinkedIn (start)']);
    expect(moveEvent(docOf(BASE), 0, 1, 1, 0).timeline!.sections[0].periods[1].events).toEqual(['Google', 'Facebook']);
    expect(removeEvent(docOf(BASE), 0, 1, 0).timeline!.sections[0].periods[1].events).toEqual(['Google']);
  });

  it('usunięcie ostatniego wydarzenia zostawia sam okres', () => {
    const next = removeEvent(docOf(BASE), 1, 0, 0);
    expect(next.timeline!.sections[1].periods[0]).toEqual({ label: '2005', events: [] });
    expect(serializeTimelineDiagram(next)).toContain('        2005');
  });
});

describe('tytuł', () => {
  it('ustawia i kasuje', () => {
    expect(setTimelineTitle(docOf(BASE), 'Inny').timeline!.title).toBe('Inny');
    expect(setTimelineTitle(docOf(BASE), '  ').timeline!.title).toBeUndefined();
  });
});
