/**
 * Testy zachowania paska kursora przy aktywnym zaznaczeniu i przy wklejaniu.
 *
 * Oba przypadki zgłoszone z telefonu:
 *  • strzałka przy zaznaczonym słowie „przeskakiwała daleko" — Monaco liczy ruch
 *    od pozycji karetki, a ta po zaznaczeniu długim naciśnięciem stoi na
 *    przeciwnym końcu zaznaczenia niż użytkownik patrzy;
 *  • systemowe „Wklej" wprowadzało tekst jak pisanie z klawiatury, więc
 *    auto-wcięcia i auto-domykanie nawiasów rozjeżdżały wklejony kod.
 */
import { describe, it, expect } from 'vitest';
import {
  collapseForMove, normalizePastedText, withTimeout, positionAfterInsert, type SimpleSelection,
} from './cursorBarActions';

const sel = (
  startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number,
  reversed = false,
): SimpleSelection => ({
  startLineNumber, startColumn, endLineNumber, endColumn,
  positionLineNumber: reversed ? startLineNumber : endLineNumber,
  positionColumn: reversed ? startColumn : endColumn,
});

describe('collapseForMove — puste zaznaczenie', () => {
  it('zwykły kursor: nie ma czego zwijać, komenda idzie do Monaco', () => {
    const empty = sel(3, 5, 3, 5);
    expect(collapseForMove('cursorLeft', empty)).toEqual({ collapseTo: null, runCommand: true });
    expect(collapseForMove('cursorTop', empty)).toEqual({ collapseTo: null, runCommand: true });
  });
});

describe('collapseForMove — strzałki zwijają zaznaczenie do właściwego końca', () => {
  const selection = sel(2, 4, 2, 9); // zaznaczone „słowo" w linii 2

  it('w lewo stawia karetkę na początku zaznaczenia i nie przesuwa dalej', () => {
    expect(collapseForMove('cursorLeft', selection)).toEqual({
      collapseTo: { lineNumber: 2, column: 4 }, runCommand: false,
    });
  });

  it('w prawo stawia karetkę na końcu zaznaczenia', () => {
    expect(collapseForMove('cursorRight', selection)).toEqual({
      collapseTo: { lineNumber: 2, column: 9 }, runCommand: false,
    });
  });

  it('w górę i w dół zwija, a potem wykonuje ruch o linię', () => {
    expect(collapseForMove('cursorUp', selection)).toEqual({
      collapseTo: { lineNumber: 2, column: 4 }, runCommand: true,
    });
    expect(collapseForMove('cursorDown', selection)).toEqual({
      collapseTo: { lineNumber: 2, column: 9 }, runCommand: true,
    });
  });

  it('kierunek zaznaczania nie ma znaczenia — liczy się jego początek i koniec', () => {
    const reversed = sel(2, 4, 2, 9, true);
    expect(collapseForMove('cursorLeft', reversed).collapseTo).toEqual({ lineNumber: 2, column: 4 });
    expect(collapseForMove('cursorRight', reversed).collapseTo).toEqual({ lineNumber: 2, column: 9 });
  });

  it('zaznaczenie wielolinijkowe zwija się do swojej krawędzi, nie do karetki', () => {
    const multi = sel(5, 2, 9, 30);
    expect(collapseForMove('cursorLeft', multi).collapseTo).toEqual({ lineNumber: 5, column: 2 });
    expect(collapseForMove('cursorRight', multi).collapseTo).toEqual({ lineNumber: 9, column: 30 });
  });
});

describe('collapseForMove — skoki po linii i pliku', () => {
  const selection = sel(2, 4, 3, 9);

  it('Home/End zwijają i wykonują skok — inaczej trafiłyby na linię przeciwnego końca', () => {
    expect(collapseForMove('cursorHome', selection)).toEqual({
      collapseTo: { lineNumber: 2, column: 4 }, runCommand: true,
    });
    expect(collapseForMove('cursorEnd', selection)).toEqual({
      collapseTo: { lineNumber: 3, column: 9 }, runCommand: true,
    });
  });

  it('skoki na początek i koniec pliku nie potrzebują zwijania', () => {
    expect(collapseForMove('cursorTop', selection)).toEqual({ collapseTo: null, runCommand: true });
    expect(collapseForMove('cursorBottom', selection)).toEqual({ collapseTo: null, runCommand: true });
  });
});

describe('normalizePastedText', () => {
  it('ujednolica końce linii — CRLF ze schowka zostawiał puste linie', () => {
    expect(normalizePastedText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('zdejmuje BOM z początku', () => {
    expect(normalizePastedText('﻿const x = 1;')).toBe('const x = 1;');
  });

  it('nie tyka wcięć ani spacji na końcach linii — tekst wchodzi dosłownie', () => {
    const code = '  if (x) {\n    y();\n  }  ';
    expect(normalizePastedText(code)).toBe(code);
  });

  it('null i undefined ze schowka dają pusty string', () => {
    expect(normalizePastedText(null)).toBe('');
    expect(normalizePastedText(undefined)).toBe('');
  });
});

describe('withTimeout — odczyt schowka nie może zawiesić przycisku', () => {
  it('oddaje wynik, gdy zdąży', async () => {
    await expect(withTimeout(Promise.resolve('abc'), 50, 'x')).resolves.toBe('abc');
  });

  it('po limicie czasu oddaje wartość zastępczą zamiast czekać w nieskończoność', async () => {
    // WebView bez uprawnienia do schowka potrafi nigdy nie rozwiązać obietnicy —
    // wtedy `await` wisi, a przycisk wygląda na martwy.
    await expect(withTimeout(new Promise<string>(() => {}), 20, '')).resolves.toBe('');
  });

  it('odrzucona obietnica też daje wartość zastępczą', async () => {
    await expect(withTimeout(Promise.reject(new Error('brak dostępu')), 50, '')).resolves.toBe('');
  });
});

describe('positionAfterInsert — gdzie ma stanąć kursor po wklejeniu', () => {
  const at = (lineNumber: number, column: number) => ({ lineNumber, column });

  it('tekst jednolinijkowy przesuwa kolumnę', () => {
    expect(positionAfterInsert(at(3, 5), 'abc')).toEqual({ lineNumber: 3, column: 8 });
  });

  it('tekst wielolinijkowy ląduje na końcu ostatniej linii, licząc od kolumny 1', () => {
    expect(positionAfterInsert(at(3, 5), 'abc\n  def')).toEqual({ lineNumber: 4, column: 6 });
  });

  it('końcowy znak nowej linii stawia kursor na początku kolejnej linii', () => {
    expect(positionAfterInsert(at(2, 3), 'abc\n')).toEqual({ lineNumber: 3, column: 1 });
  });

  it('pusty tekst nie rusza kursora', () => {
    expect(positionAfterInsert(at(7, 2), '')).toEqual({ lineNumber: 7, column: 2 });
  });
});
