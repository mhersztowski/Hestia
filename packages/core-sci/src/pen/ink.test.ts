import { describe, it, expect } from 'vitest';
import { serializeInk, parseInk, inkIsEmpty, type InkStroke } from './ink';

const pismo: InkStroke[] = [
  { width: 1.6, points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 12.34, y: 20.99, pressure: 0.8 }] },
  { width: 2, points: [{ x: 0, y: 0, pressure: 1 }] },
];

describe('pismo odręczne jako pociągnięcia', () => {
  it('zapis i odczyt zachowują kształt', () => {
    const wrocone = parseInk(serializeInk(pismo));
    expect(wrocone).toHaveLength(2);
    expect(wrocone[0].points[0]).toEqual({ x: 10, y: 20, pressure: 0.5 });
    expect(wrocone[1].width).toBe(2);
  });

  // Rozwiązanie zadania to bywa kilkaset punktów, a plik postępów wędruje
  // między telefonem a komputerem — zapis ma być zwięzły.
  it('zapis jest jedną linią i nie rozdyma się', () => {
    const zapis = serializeInk(pismo);
    expect(zapis).not.toContain('\n');
    expect(zapis.length).toBeLessThan(80);
  });

  it('zaokrągla poniżej dziesiątych piksela', () => {
    expect(serializeInk([{ width: 1, points: [{ x: 1.23456, y: 2, pressure: 0.5 }] }]))
      .toContain('1.2/2/0.5');
  });

  /**
   * Historia rozwiązań ma się otworzyć nawet z uszkodzonym zapisem — utrata
   * jednej kreski jest mniejszą szkodą niż utrata dostępu do całości.
   */
  it('uszkodzony fragment jest pomijany, a nie rzucany', () => {
    const wynik = parseInk('1.6:10/20/0.5;ŚMIEĆ;2:0/0/1');
    expect(wynik).toHaveLength(2);
  });

  it('pusty zapis daje pustą listę', () => {
    expect(parseInk('')).toEqual([]);
    expect(inkIsEmpty([])).toBe(true);
    expect(inkIsEmpty(pismo)).toBe(false);
  });

  it('nacisk zostaje, bo niesie grubość kreski', () => {
    expect(parseInk(serializeInk(pismo))[0].points[1].pressure).toBe(0.8);
  });
});
