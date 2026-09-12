import { describe, it, expect } from 'vitest';
import { parseGanttDiagram, serializeGanttDiagram, parseTaskData, serializeTaskData } from './ganttDiagram';
import type { GanttChart } from '../../model/gantt';

const chartOf = (text: string): GanttChart => parseGanttDiagram(text).document.gantt!;

describe('gantt: nagłówek dokumentu', () => {
  it('czyta tytuł i format dat', () => {
    const chart = chartOf([
      'gantt',
      '    title Plan wdrożenia',
      '    dateFormat YYYY-MM-DD',
      '    axisFormat %m-%d',
    ].join('\n'));

    expect(chart.title).toBe('Plan wdrożenia');
    expect(chart.dateFormat).toBe('YYYY-MM-DD');
    expect(chart.axisFormat).toBe('%m-%d');
  });

  it('czyta pozostałe ustawienia osi', () => {
    const chart = chartOf([
      'gantt',
      '    tickInterval 1week',
      '    weekday monday',
      '    excludes weekends',
      '    includes 2024-01-06',
      '    todayMarker off',
    ].join('\n'));

    expect(chart.tickInterval).toBe('1week');
    expect(chart.weekday).toBe('monday');
    expect(chart.excludes).toBe('weekends');
    expect(chart.includes).toBe('2024-01-06');
    expect(chart.todayMarker).toBe('off');
  });
});

describe('gantt: sekcje i zadania', () => {
  it('grupuje zadania w sekcje', () => {
    const chart = chartOf([
      'gantt',
      '    section Projekt',
      '        Analiza :a1, 2024-01-01, 5d',
      '        Makiety :a2, after a1, 3d',
      '    section Budowa',
      '        Szkielet :b1, after a2, 10d',
    ].join('\n'));

    expect(chart.sections).toHaveLength(2);
    expect(chart.sections[0].label).toBe('Projekt');
    expect(chart.sections[0].tasks.map((t) => t.label)).toEqual(['Analiza', 'Makiety']);
    expect(chart.sections[1].label).toBe('Budowa');
    expect(chart.sections[1].tasks).toHaveLength(1);
  });

  it('zadania przed pierwszą sekcją trafiają do sekcji bez nazwy', () => {
    const chart = chartOf([
      'gantt',
      '    Rozruch :2024-01-01, 2d',
      '    section Właściwa praca',
      '        Kodowanie :5d',
    ].join('\n'));

    expect(chart.sections[0].label).toBeUndefined();
    expect(chart.sections[0].tasks[0].label).toBe('Rozruch');
    expect(chart.sections[1].label).toBe('Właściwa praca');
  });

  it('pusta sekcja zostaje w modelu', () => {
    const chart = chartOf(['gantt', '    section Pusta', '    section Druga', '        A :1d'].join('\n'));
    expect(chart.sections.map((s) => s.label)).toEqual(['Pusta', 'Druga']);
    expect(chart.sections[0].tasks).toEqual([]);
  });
});

describe('gantt: rozbiór pozycji po dwukropku', () => {
  it('jedno pole to sam czas trwania — zadanie rusza po poprzednim', () => {
    expect(parseTaskData('5d')).toMatchObject({ tags: [], end: { kind: 'duration', value: '5d' } });
    expect(parseTaskData('5d').id).toBeUndefined();
    expect(parseTaskData('5d').start).toBeUndefined();
  });

  it('dwa pola to początek i koniec', () => {
    expect(parseTaskData('2024-01-01, 5d')).toMatchObject({
      start: { kind: 'date', value: '2024-01-01' },
      end: { kind: 'duration', value: '5d' },
    });
  });

  it('trzy pola to identyfikator, początek i koniec', () => {
    expect(parseTaskData('a1, 2024-01-01, 5d')).toMatchObject({
      id: 'a1',
      start: { kind: 'date', value: '2024-01-01' },
      end: { kind: 'duration', value: '5d' },
    });
  });

  it('data końcowa zamiast czasu trwania', () => {
    expect(parseTaskData('a1, 2024-01-01, 2024-01-08').end).toEqual({ kind: 'date', value: '2024-01-08' });
  });

  it('czyta zależność after z jednym i z wieloma zadaniami', () => {
    expect(parseTaskData('after a1, 3d').start).toEqual({ kind: 'after', ids: ['a1'] });
    expect(parseTaskData('after a1 a2 a3, 3d').start).toEqual({ kind: 'after', ids: ['a1', 'a2', 'a3'] });
  });

  it('until należy do końca, nie do początku', () => {
    const task = parseTaskData('after a1, until b1');
    expect(task.start).toEqual({ kind: 'after', ids: ['a1'] });
    expect(task.end).toEqual({ kind: 'until', ids: ['b1'] });
  });

  it('czyta znaczniki i zdejmuje je z listy pól', () => {
    expect(parseTaskData('done, a1, 2024-01-01, 5d')).toMatchObject({
      tags: ['done'], id: 'a1', start: { kind: 'date', value: '2024-01-01' },
    });
    expect(parseTaskData('crit, active, 2024-01-01, 5d').tags).toEqual(['crit', 'active']);
  });

  it('kamień milowy to znacznik, nie osobny rodzaj zadania', () => {
    const task = parseTaskData('milestone, m1, 2024-02-01, 0d');
    expect(task.tags).toEqual(['milestone']);
    expect(task.id).toBe('m1');
  });

  it('znacznik po identyfikatorze nie jest znacznikiem — kolejność ma znaczenie', () => {
    // Mermaid zdejmuje znaczniki tylko z początku listy; dalej `done` jest
    // zwykłym tekstem i musi trafić do modelu tak, jak stoi.
    const task = parseTaskData('a1, done, 5d');
    expect(task.tags).toEqual([]);
    expect(task.id).toBe('a1');
  });
});

describe('gantt: pozycja, której nie rozumiemy', () => {
  it('zostaje w całości i wraca nietknięta', () => {
    const source = ['gantt', '    section S', '        Dziwne :a, b, c, d, e'].join('\n');
    const chart = chartOf(source);
    const task = chart.sections[0].tasks[0];

    expect(task.raw).toBe('a, b, c, d, e');
    expect(serializeGanttDiagram(parseGanttDiagram(source).document)).toContain('Dziwne :a, b, c, d, e');
  });

  it('opis dostępności nie jest zadaniem, choć ma dwukropek', () => {
    const source = ['gantt', '    accTitle: Harmonogram wdrożenia', '    section S', '        A :1d'].join('\n');
    const chart = chartOf(source);
    expect(chart.sections[0].tasks.map((t) => t.label)).toEqual(['A']);
    expect(serializeGanttDiagram(parseGanttDiagram(source).document)).toContain('accTitle: Harmonogram wdrożenia');
  });

  it('linia niebędąca ani ustawieniem, ani zadaniem wraca na swoje miejsce', () => {
    const source = ['gantt', '    click a1 href "https://przyklad.pl"', '    section S', '        A :1d'].join('\n');
    const written = serializeGanttDiagram(parseGanttDiagram(source).document);
    expect(written).toContain('click a1 href "https://przyklad.pl"');
  });
});

describe('gantt: zapis', () => {
  const roundTrip = (text: string) => serializeGanttDiagram(parseGanttDiagram(text).document);

  it('odtwarza dokument w tej samej postaci', () => {
    const source = [
      'gantt',
      '    title Plan wdrożenia',
      '    dateFormat YYYY-MM-DD',
      '    axisFormat %m-%d',
      '    excludes weekends',
      '    section Projekt',
      '        Analiza :done, a1, 2024-01-01, 5d',
      '        Makiety :active, a2, after a1, 3d',
      '        Przegląd :crit, a3, after a2, until b1',
      '    section Budowa',
      '        Szkielet :b1, 2024-01-15, 10d',
      '        Odbiór :milestone, m1, 2024-02-01, 0d',
    ].join('\n');

    expect(roundTrip(source)).toBe(source);
  });

  it('drugi zapis niczego nie zmienia', () => {
    const source = ['gantt', '    dateFormat YYYY-MM-DD', '    section S', '        A :a1, 2024-01-01, 5d', '        B :3d'].join('\n');
    const once = roundTrip(source);
    expect(roundTrip(once)).toBe(once);
  });

  it('zadanie bez identyfikatora nie dostaje wymyślonego', () => {
    const written = roundTrip(['gantt', '    section S', '        A :2024-01-01, 5d'].join('\n'));
    expect(written).toContain('A :2024-01-01, 5d');
  });

  it('sekcja bez nazwy nie zapisuje nagłówka section', () => {
    const written = roundTrip(['gantt', '    A :1d', '    section Druga', '        B :2d'].join('\n'));
    expect(written).not.toMatch(/section\s*$/m);
    expect(written.indexOf('A :1d')).toBeLessThan(written.indexOf('section Druga'));
  });
});

describe('gantt: składanie pozycji z powrotem', () => {
  it('pomija identyfikator, gdy zadanie go nie ma', () => {
    expect(serializeTaskData({ label: 'A', tags: [], start: { kind: 'date', value: '2024-01-01' }, end: { kind: 'duration', value: '5d' } }))
      .toBe('2024-01-01, 5d');
  });

  it('sam czas trwania, gdy nie ma ani identyfikatora, ani początku', () => {
    expect(serializeTaskData({ label: 'A', tags: [], end: { kind: 'duration', value: '5d' } })).toBe('5d');
  });

  it('identyfikator bez początku podpina się pod poprzednika', () => {
    // Trzy pola znaczą „id, początek, koniec"; przy dwóch Mermaid wziąłby
    // identyfikator za datę i cicho podstawił dzisiejszy dzień. Skoro brak
    // początku znaczy „po poprzednim", zapisujemy to wprost.
    const written = serializeTaskData({ label: 'A', id: 'a1', tags: [], end: { kind: 'duration', value: '5d' } }, 'a0');
    expect(written).toBe('a1, after a0, 5d');
  });

  it('bez poprzednika z identyfikatorem woli stracić identyfikator niż datę', () => {
    // Zapis `a1, 5d` Mermaid zrozumiałby jako „start = a1" i wstawił dzisiejszą
    // datę — zadanie wylądowałoby w zupełnie innym miejscu osi. Utrata nazwy
    // jest widoczna, przesunięty pasek nie.
    expect(serializeTaskData({ label: 'A', id: 'a1', tags: [], end: { kind: 'duration', value: '5d' } })).toBe('5d');
  });

  it('oddaje zapis źródłowy, gdy rozbiór się nie powiódł', () => {
    expect(serializeTaskData({ label: 'A', tags: [], raw: 'cokolwiek, tu, było' })).toBe('cokolwiek, tu, było');
  });
});
