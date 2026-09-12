import { describe, it, expect } from 'vitest';
import { parseGanttDiagram, serializeGanttDiagram } from '../formats/mermaid/ganttDiagram';
import {
  addSection, updateSection, removeSection, moveSection,
  addTask, updateTask, toggleTag, removeTask, moveTask, moveTaskToSection, setGanttSetting,
} from './ganttOps';
import type { DiagramDocument } from './diagram';

const docOf = (lines: string[]): DiagramDocument => parseGanttDiagram(lines.join('\n')).document;

const BASE = [
  'gantt',
  '    dateFormat YYYY-MM-DD',
  '    section Projekt',
  '        Analiza :a1, 2024-01-01, 5d',
  '        Makiety :a2, after a1, 3d',
  '    section Budowa',
  '        Szkielet :b1, after a2, 10d',
];

describe('sekcje', () => {
  it('dokłada sekcję po wskazanej', () => {
    const next = addSection(docOf(BASE), 'Testy', 0);
    expect(next.gantt!.sections.map((s) => s.label)).toEqual(['Projekt', 'Testy', 'Budowa']);
  });

  it('zmienia nazwę i przesuwa sekcję', () => {
    expect(updateSection(docOf(BASE), 1, 'Realizacja').gantt!.sections[1].label).toBe('Realizacja');
    expect(moveSection(docOf(BASE), 1, 0).gantt!.sections.map((s) => s.label)).toEqual(['Budowa', 'Projekt']);
  });

  it('usuwa sekcję razem z zadaniami', () => {
    const next = removeSection(docOf(BASE), 0);
    expect(next.gantt!.sections).toHaveLength(1);
    expect(next.gantt!.sections[0].label).toBe('Budowa');
  });
});

describe('zadania', () => {
  it('nowe zadanie ma sam czas trwania — rusza po poprzednim', () => {
    const task = addTask(docOf(BASE), 0, 'Nowe').gantt!.sections[0].tasks[2];
    expect(task).toEqual({ label: 'Nowe', tags: [], end: { kind: 'duration', value: '1d' } });
  });

  it('wstawia zadanie pod wskazanym', () => {
    const tasks = addTask(docOf(BASE), 0, 'Wstawione', 0).gantt!.sections[0].tasks;
    expect(tasks.map((t) => t.label)).toEqual(['Analiza', 'Wstawione', 'Makiety']);
  });

  it('przesuwa zadanie w obrębie sekcji', () => {
    const tasks = moveTask(docOf(BASE), 0, 1, 0).gantt!.sections[0].tasks;
    expect(tasks.map((t) => t.label)).toEqual(['Makiety', 'Analiza']);
  });

  it('przenosi zadanie do innej sekcji z całym opisem', () => {
    const next = moveTaskToSection(docOf(BASE), 0, 0, 1);
    expect(next.gantt!.sections[0].tasks.map((t) => t.label)).toEqual(['Makiety']);
    expect(next.gantt!.sections[1].tasks[1]).toEqual({
      label: 'Analiza', tags: [], id: 'a1',
      start: { kind: 'date', value: '2024-01-01' },
      end: { kind: 'duration', value: '5d' },
    });
  });

  it('przełącza znacznik w obie strony', () => {
    const once = toggleTag(docOf(BASE), 0, 0, 'done');
    expect(once.gantt!.sections[0].tasks[0].tags).toEqual(['done']);
    expect(toggleTag(once, 0, 0, 'done').gantt!.sections[0].tasks[0].tags).toEqual([]);
  });

  it('edycja pozycji, której nie rozumieliśmy, kasuje zapis źródłowy', () => {
    const doc = docOf(['gantt', '    section S', '        Dziwne :a, b, c, d, e']);
    expect(doc.gantt!.sections[0].tasks[0].raw).toBeDefined();

    const next = updateTask(doc, 0, 0, { end: { kind: 'duration', value: '2d' } });
    expect(next.gantt!.sections[0].tasks[0].raw).toBeUndefined();
    expect(serializeGanttDiagram(next)).toContain('Dziwne :2d');
  });
});

describe('usunięcie zadania nie zrywa harmonogramu', () => {
  it('zadanie czekające na usunięte przejmuje jego zależność', () => {
    const next = removeTask(docOf(BASE), 0, 1); // usuwa `Makiety` (a2, after a1)
    const szkielet = next.gantt!.sections[1].tasks[0];
    expect(szkielet.start).toEqual({ kind: 'after', ids: ['a1'] });
  });

  it('gdy usunięte zaczynało się datą, odniesienie znika i zadanie rusza po poprzedniku', () => {
    const doc = docOf(['gantt', '    section S', '        A :a1, 2024-01-01, 5d', '        B :b1, after a1, 2d']);
    const next = removeTask(doc, 0, 0);
    expect(next.gantt!.sections[0].tasks[0].start).toBeUndefined();
    expect(serializeGanttDiagram(next)).toContain('B :2d');
  });

  it('after z kilkoma zadaniami traci tylko usunięte', () => {
    const doc = docOf([
      'gantt', '    section S',
      '        A :a1, 2024-01-01, 5d',
      '        B :b1, 2024-01-01, 3d',
      '        C :c1, after a1 b1, 1d',
    ]);
    const next = removeTask(doc, 0, 1);
    expect(next.gantt!.sections[0].tasks[1].start).toEqual({ kind: 'after', ids: ['a1'] });
  });

  it('until też jest naprawiane', () => {
    const doc = docOf([
      'gantt', '    section S',
      '        A :a1, 2024-01-01, until b1',
      '        B :b1, after a1, 3d',
    ]);
    const next = removeTask(doc, 0, 1);
    expect(next.gantt!.sections[0].tasks[0].end).toBeUndefined();
  });

  it('dziedziczenie nie tworzy odniesienia do samego siebie', () => {
    // Zapętlone zależności same w sobie są błędem, ale usuwanie nie ma prawa
    // zamienić ich na zadanie czekające na własny koniec.
    const doc = docOf(['gantt', '    section S', '        A :a1, after b1, 2d', '        B :b1, after a1, 2d']);
    const next = removeTask(doc, 0, 1);
    expect(next.gantt!.sections[0].tasks[0].start).toBeUndefined();
  });
});

describe('ustawienia dokumentu', () => {
  it('ustawia i kasuje wartość', () => {
    const withTitle = setGanttSetting(docOf(BASE), 'title', 'Plan');
    expect(withTitle.gantt!.title).toBe('Plan');
    expect(setGanttSetting(withTitle, 'title', '  ').gantt!.title).toBeUndefined();
  });

  it('kasowanie formatu dat nie psuje zapisu', () => {
    const next = setGanttSetting(docOf(BASE), 'dateFormat', '');
    expect(serializeGanttDiagram(next)).not.toContain('dateFormat');
    expect(serializeGanttDiagram(next)).toContain('Analiza :a1, 2024-01-01, 5d');
  });
});
