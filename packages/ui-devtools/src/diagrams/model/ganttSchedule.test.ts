import { describe, it, expect } from 'vitest';
import { parseGanttDiagram } from '../formats/mermaid/ganttDiagram';
import { scheduleGantt, parseDateWithFormat, parseDuration } from './ganttSchedule';

const scheduleOf = (lines: string[], today = new Date('2024-06-01T00:00:00Z')) =>
  scheduleGantt(parseGanttDiagram(lines.join('\n')).document.gantt!, { today });

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('czytanie daty według formatu dokumentu', () => {
  it('domyślny YYYY-MM-DD', () => {
    expect(iso(parseDateWithFormat('2024-01-15', 'YYYY-MM-DD')!)).toBe('2024-01-15');
  });

  it('inny układ pól', () => {
    expect(iso(parseDateWithFormat('15/01/2024', 'DD/MM/YYYY')!)).toBe('2024-01-15');
  });

  it('data z godziną', () => {
    const date = parseDateWithFormat('2024-01-15 14:30', 'YYYY-MM-DD HH:mm')!;
    expect(date.toISOString()).toBe('2024-01-15T14:30:00.000Z');
  });

  it('napis niepasujący do formatu nie jest datą', () => {
    expect(parseDateWithFormat('after a1', 'YYYY-MM-DD')).toBeUndefined();
    expect(parseDateWithFormat('2024-13-40', 'YYYY-MM-DD')).toBeUndefined();
  });
});

describe('czytanie czasu trwania', () => {
  it('dni, tygodnie, godziny', () => {
    expect(parseDuration('5d')).toBe(5 * 86400_000);
    expect(parseDuration('2w')).toBe(14 * 86400_000);
    expect(parseDuration('36h')).toBe(36 * 3600_000);
  });

  it('ułamek i zero', () => {
    expect(parseDuration('1.5d')).toBe(1.5 * 86400_000);
    expect(parseDuration('0d')).toBe(0);
  });

  it('nierozpoznany zapis nie jest czasem trwania', () => {
    expect(parseDuration('kiedyś')).toBeUndefined();
  });
});

describe('układanie zadań na osi', () => {
  it('data początkowa i czas trwania', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'section S', 'A :a1, 2024-01-01, 5d']);
    expect(iso(s.tasks[0].start!)).toBe('2024-01-01');
    expect(iso(s.tasks[0].end!)).toBe('2024-01-06');
  });

  it('data końcowa zamiast czasu trwania', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'A :a1, 2024-01-01, 2024-01-11']);
    expect(iso(s.tasks[0].end!)).toBe('2024-01-11');
  });

  it('brak początku znaczy „po poprzednim"', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'A :a1, 2024-01-01, 5d', 'B :3d']);
    expect(iso(s.tasks[1].start!)).toBe('2024-01-06');
    expect(iso(s.tasks[1].end!)).toBe('2024-01-09');
  });

  it('after czeka na koniec wskazanego zadania', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'A :a1, 2024-01-01, 5d', 'B :b1, after a1, 2d']);
    expect(iso(s.tasks[1].start!)).toBe('2024-01-06');
  });

  it('after z kilkoma zadaniami czeka na ostatnie z nich', () => {
    const s = scheduleOf([
      'gantt', 'dateFormat YYYY-MM-DD',
      'A :a1, 2024-01-01, 5d',
      'B :b1, 2024-01-01, 12d',
      'C :c1, after a1 b1, 1d',
    ]);
    expect(iso(s.tasks[2].start!)).toBe('2024-01-13');
  });

  it('until kończy zadanie tam, gdzie rusza wskazane', () => {
    const s = scheduleOf([
      'gantt', 'dateFormat YYYY-MM-DD',
      'A :a1, 2024-01-01, until b1',
      'B :b1, 2024-01-20, 3d',
    ]);
    expect(iso(s.tasks[0].end!)).toBe('2024-01-20');
  });

  it('zależność w przód też się rozwiązuje', () => {
    // `after` wskazujące zadanie zapisane niżej jest legalne; rozwiązujemy
    // harmonogram do skutku, a nie w jednym przebiegu od góry.
    const s = scheduleOf([
      'gantt', 'dateFormat YYYY-MM-DD',
      'A :a1, after b1, 2d',
      'B :b1, 2024-01-10, 5d',
    ]);
    expect(iso(s.tasks[0].start!)).toBe('2024-01-15');
  });

  it('pierwsze zadanie bez daty rusza dziś', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'A :5d'], new Date('2024-06-01T00:00:00Z'));
    expect(iso(s.tasks[0].start!)).toBe('2024-06-01');
  });

  it('kamień milowy jest punktem, nie odcinkiem', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'M :milestone, m1, 2024-02-01, 0d']);
    expect(s.tasks[0].start!.getTime()).toBe(s.tasks[0].end!.getTime());
  });
});

describe('harmonogram, którego nie da się ułożyć', () => {
  it('cykl zależności zostaje zgłoszony, a reszta wykresu się liczy', () => {
    const s = scheduleOf([
      'gantt', 'dateFormat YYYY-MM-DD',
      'A :a1, after b1, 2d',
      'B :b1, after a1, 2d',
      'C :c1, 2024-03-01, 1d',
    ]);
    expect(s.tasks[0].issue).toBeDefined();
    expect(s.tasks[1].issue).toBeDefined();
    expect(iso(s.tasks[2].start!)).toBe('2024-03-01');
  });

  it('odniesienie do nieistniejącego zadania zostaje zgłoszone', () => {
    const s = scheduleOf(['gantt', 'dateFormat YYYY-MM-DD', 'A :a1, after nieznane, 2d']);
    expect(s.tasks[0].issue).toContain('nieznane');
    expect(s.tasks[0].start).toBeUndefined();
  });

  it('pozycja, której nie rozumiemy, nie trafia na oś', () => {
    const s = scheduleOf(['gantt', 'section S', 'Dziwne :a, b, c, d, e']);
    expect(s.tasks[0].start).toBeUndefined();
    expect(s.tasks[0].issue).toBeDefined();
  });
});

describe('zakres osi', () => {
  it('obejmuje wszystkie ułożone zadania', () => {
    const s = scheduleOf([
      'gantt', 'dateFormat YYYY-MM-DD',
      'A :a1, 2024-01-01, 5d',
      'B :b1, 2024-03-01, 5d',
    ]);
    expect(iso(s.from!)).toBe('2024-01-01');
    expect(iso(s.to!)).toBe('2024-03-06');
  });

  it('bez ułożonych zadań nie ma zakresu', () => {
    const s = scheduleOf(['gantt', 'A :a1, after nieznane, 2d']);
    expect(s.from).toBeUndefined();
    expect(s.to).toBeUndefined();
  });
});
