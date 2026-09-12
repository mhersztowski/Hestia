/**
 * Testy liczenia dokumentu: parametry, kolejność zależności, funkcje do rysowania.
 *
 * Wiersze nie są niezależne — `y = a\sin(x)` potrzebuje `a` z innego wiersza,
 * a ten może potrzebować jeszcze innego. Kolejność liczenia musi wynikać
 * z zależności, nie z kolejności wpisania, a cykl trzeba zgłosić, zamiast
 * zapętlić program.
 */

import { describe, it, expect } from 'vitest';
import { addRow, createPlotDocument } from './document';
import { evaluateDocument } from './evaluate';

function doc(...latex: string[]) {
  return latex.reduce((d, l) => addRow(d, l), createPlotDocument());
}

describe('parametry', () => {
  it('liczy stałą i udostępnia ją wykresowi', () => {
    const wynik = evaluateDocument(doc('a = 2', 'y = a x'));
    expect(wynik.scope.a).toBe(2);

    const wykres = wynik.rows.find((r) => r.kind === 'explicit-y');
    expect(wykres?.fn?.(3)).toBe(6);
  });

  it('kolejność bierze się z zależności, nie z kolejności wpisania', () => {
    // `b` wpisane przed `a`, choć od niego zależy — lista wyrażeń nie jest
    // programem czytanym z góry na dół.
    const wynik = evaluateDocument(doc('b = 2 a', 'a = 5'));
    expect(wynik.scope.b).toBe(10);
  });

  it('łańcuch trzech definicji liczy się w całości', () => {
    const wynik = evaluateDocument(doc('c = b + 1', 'b = a \\cdot 2', 'a = 3'));
    expect(wynik.scope.c).toBe(7);
  });

  it('wartość z suwaka ma pierwszeństwo przed zapisem', () => {
    // Bez tego przesunięcie suwaka nie zmieniałoby nic — a to jest jedyny
    // powód, dla którego suwak istnieje.
    const wynik = evaluateDocument(doc('a = 2', 'y = a x'), { a: 10 });
    expect(wynik.scope.a).toBe(10);
    expect(wynik.rows.find((r) => r.kind === 'explicit-y')?.fn?.(1)).toBe(10);
  });
});

describe('cykle i braki', () => {
  it('cykl jest zgłaszany ze wskazaniem uczestników', () => {
    // Bez wykrycia cyklu liczenie kręciłoby się w kółko albo dawało wartość
    // zależną od kolejności — a użytkownik nie miałby jak zrozumieć dlaczego.
    const wynik = evaluateDocument(doc('a = b', 'b = a'));
    expect(wynik.issues.join(' ')).toMatch(/cykl/i);
    expect(wynik.issues.join(' ')).toContain('a');
    expect(wynik.issues.join(' ')).toContain('b');
  });

  it('cykl nie blokuje reszty dokumentu', () => {
    const wynik = evaluateDocument(doc('a = b', 'b = a', 'c = 7', 'y = c x'));
    expect(wynik.scope.c).toBe(7);
    expect(wynik.rows.find((r) => r.kind === 'explicit-y')?.fn?.(2)).toBe(14);
  });

  it('nieznany parametr daje uwagę przy wierszu, nie ciszę', () => {
    const wynik = evaluateDocument(doc('y = q x'));
    const wykres = wynik.rows.find((r) => r.kind === 'explicit-y');
    expect(wykres?.issues.join(' ')).toContain('q');
  });

  it('parametr bez definicji dostaje zero, żeby wykres dało się narysować', () => {
    // Alternatywa to brak krzywej i pusty ekran bez wyjaśnienia; wolimy
    // narysować coś i powiedzieć, czego brakuje.
    const wynik = evaluateDocument(doc('y = q + x'));
    expect(wynik.rows.find((r) => r.kind === 'explicit-y')?.fn?.(5)).toBe(5);
  });
});

describe('rodzaje wierszy', () => {
  it('wykres względem y dostaje funkcję zmiennej y', () => {
    const wynik = evaluateDocument(doc('x = y^2'));
    const wiersz = wynik.rows.find((r) => r.kind === 'explicit-x');
    expect(wiersz?.fn?.(3)).toBe(9);
  });

  it('punkt jest policzony na liczby', () => {
    const wynik = evaluateDocument(doc('a = 4', '(a, a + 1)'));
    expect(wynik.rows.find((r) => r.kind === 'point')?.point).toEqual({ x: 4, y: 5 });
  });

  it('wyrażenie bez zmiennych dostaje wartość', () => {
    expect(evaluateDocument(doc('2 + 2')).rows.find((r) => r.kind === 'value')?.value).toBe(4);
  });

  it('pusty wiersz nie wnosi nic i nie zgłasza uwag', () => {
    const wynik = evaluateDocument(createPlotDocument());
    expect(wynik.issues).toEqual([]);
    expect(wynik.rows[0].fn).toBeUndefined();
  });

  it('ukryty wiersz nadal wnosi swój parametr', () => {
    // Ukrycie dotyczy rysowania, nie liczenia: schowanie definicji nie może
    // popsuć krzywej, która z niej korzysta.
    let d = doc('a = 3', 'y = a x');
    d = { ...d, rows: d.rows.map((r) => (r.parsed.kind === 'constant' ? { ...r, hidden: true } : r)) };
    expect(evaluateDocument(d).scope.a).toBe(3);
  });
});

describe('stopnie i radiany', () => {
  it('domyślnie liczy w radianach', () => {
    const wynik = evaluateDocument(doc('y = \\sin(x)'));
    expect(wynik.rows[1].fn?.(Math.PI / 2)).toBeCloseTo(1, 9);
  });

  it('w trybie stopni sinus 90 daje jeden', () => {
    /*
     * To nie jest ustawienie widoku, tylko znaczenie zapisu: ten sam wiersz
     * `\sin(x)` opisuje inną funkcję. Dlatego jednostka kąta siedzi
     * w dokumencie i wchodzi do liczenia.
     */
    const d = createPlotDocument();
    d.settings.angleUnit = 'degrees';
    const wynik = evaluateDocument(addRow(d, 'y = \\sin(x)'));
    expect(wynik.rows[1].fn?.(90)).toBeCloseTo(1, 9);
  });

  it('tryb stopni nie rusza wartości niebędących kątami', () => {
    const d = createPlotDocument();
    d.settings.angleUnit = 'degrees';
    const wynik = evaluateDocument(addRow(d, 'y = 2 x'));
    expect(wynik.rows[1].fn?.(3)).toBe(6);
  });
});

describe('krzywe uwikłane i nierówności', () => {
  it('równanie daje funkcję dwóch zmiennych zerującą się na krzywej', () => {
    const wynik = evaluateDocument(doc('x^2 + y^2 = 4'));
    const wiersz = wynik.rows.find((r) => r.kind === 'implicit');

    expect(wiersz?.fn2?.(2, 0)).toBeCloseTo(0);
    expect(wiersz?.fn2?.(0, 0)).toBeCloseTo(-4);
    expect(wiersz?.fn2?.(3, 0)).toBeCloseTo(5);
  });

  it('krzywa uwikłana korzysta z parametrów', () => {
    const wynik = evaluateDocument(doc('r = 3', 'x^2 + y^2 = r^2'));
    expect(wynik.rows.find((r) => r.kind === 'implicit')?.fn2?.(3, 0)).toBeCloseTo(0);
  });

  it('nierówność „mniejsze" wypełnia stronę ujemną', () => {
    // `y < x²` znaczy `y − x² < 0` — obszar pod parabolą.
    const wiersz = evaluateDocument(doc('y < x^2')).rows.find((r) => r.kind === 'inequality');
    expect(wiersz?.fill).toBe('negative');
    expect(wiersz?.fn2?.(0, -1)).toBeLessThan(0);
  });

  it('nierówność „większe" wypełnia stronę dodatnią', () => {
    expect(evaluateDocument(doc('y > x^2')).rows.find((r) => r.kind === 'inequality')?.fill).toBe('positive');
  });

  it('nierówność nieostra dostaje ten sam obszar co ostra', () => {
    // Różnica to sama krzywa graniczna — ta ma zerową grubość i jest rysowana
    // konturem, więc obszar jest identyczny.
    const ostra = evaluateDocument(doc('y < x^2')).rows.find((r) => r.kind === 'inequality');
    const nieostra = evaluateDocument(doc('y \\le x^2')).rows.find((r) => r.kind === 'inequality');
    expect(nieostra?.fill).toBe(ostra?.fill);
  });

  it('równanie nie dostaje wypełnienia', () => {
    expect(evaluateDocument(doc('x^2 + y^2 = 4')).rows.find((r) => r.kind === 'implicit')?.fill).toBeUndefined();
  });
});
