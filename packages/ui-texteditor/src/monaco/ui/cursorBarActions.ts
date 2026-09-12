/**
 * cursorBarActions.ts — zachowanie paska kursora poza samym „wyślij komendę".
 *
 * Dwa problemy z telefonu, oba wynikające z tego, że palcem łatwo zrobić
 * zaznaczenie i trudno je zauważyć:
 *
 *  • **strzałka skakała daleko** — Monaco liczy ruch od pozycji karetki, a ta po
 *    zaznaczeniu długim naciśnięciem stoi na przeciwnym końcu zaznaczenia niż
 *    ten, na który użytkownik patrzy. Dlatego strzałka najpierw ZWIJA
 *    zaznaczenie do właściwej krawędzi — dokładnie jak na klawiaturze sprzętowej.
 *  • **wklejanie psuło wcięcia** — systemowe „Wklej" w WebView wprowadza tekst
 *    jak pisanie, więc auto-wcięcia i auto-domykanie nawiasów przerabiają każdą
 *    linię. Wklejanie z paska idzie jedną edycją, bez tej ścieżki.
 */
import type { CursorBarAction } from './cursorBarButtons';

/** Fragment `monaco.Selection`, którego potrzebujemy (ułatwia testy). */
export interface SimpleSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  /** Pozycja karetki — jeden z końców zaznaczenia. */
  positionLineNumber: number;
  positionColumn: number;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface MoveDecision {
  /** Gdzie postawić karetkę przed wykonaniem komendy (null = zostaw jak jest). */
  collapseTo: CursorPosition | null;
  /** Czy po zwinięciu wykonać jeszcze komendę Monaco. */
  runCommand: boolean;
}

/** Ruchy, które przy zaznaczeniu mają je tylko zwinąć (bez dodatkowego kroku). */
const COLLAPSE_ONLY: ReadonlySet<CursorBarAction> = new Set(['cursorLeft', 'cursorRight']);
/** Ruchy zwijające do początku zaznaczenia; reszta zwija do końca. */
const TO_START: ReadonlySet<CursorBarAction> = new Set(['cursorLeft', 'cursorUp', 'cursorHome']);
/** Skoki po całym pliku — zaznaczenie nie ma na nie wpływu. */
const IGNORES_SELECTION: ReadonlySet<CursorBarAction> = new Set(['cursorTop', 'cursorBottom']);

function isEmpty(s: SimpleSelection): boolean {
  return s.startLineNumber === s.endLineNumber && s.startColumn === s.endColumn;
}

/**
 * Co zrobić z zaznaczeniem, zanim pasek wyśle komendę ruchu.
 *
 * @param command akcja z paska
 * @param selection bieżące zaznaczenie edytora
 */
export function collapseForMove(command: CursorBarAction, selection: SimpleSelection): MoveDecision {
  if (isEmpty(selection) || IGNORES_SELECTION.has(command)) {
    return { collapseTo: null, runCommand: true };
  }
  const collapseTo = TO_START.has(command)
    ? { lineNumber: selection.startLineNumber, column: selection.startColumn }
    : { lineNumber: selection.endLineNumber, column: selection.endColumn };

  return { collapseTo, runCommand: !COLLAPSE_ONLY.has(command) };
}

/**
 * Przygotowuje tekst ze schowka do wstawienia jedną edycją.
 *
 * Ujednolica końce linii (CRLF ze schowka Androida zostawiał puste wiersze) i
 * zdejmuje BOM. Wcięć NIE rusza — to właśnie one mają wejść dosłownie.
 */
export function normalizePastedText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Czeka na obietnicę najwyżej `ms`, potem oddaje wartość zastępczą.
 *
 * `navigator.clipboard.readText()` w WebView bez przyznanego uprawnienia potrafi
 * nigdy się nie rozwiązać — bez limitu czasu przycisk „Wklej" wygląda wtedy na
 * martwy, a interfejs na zawieszony.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(fallback), ms);
    promise.then(finish, () => finish(fallback));
  });
}

/**
 * Pozycja kursora po wstawieniu tekstu w danym miejscu.
 *
 * Monaco po `executeEdits` zostawia karetkę przed wstawionym fragmentem, więc
 * kolejne wklejenie trafiało w środek poprzedniego. Kolumny liczone są od 1.
 */
export function positionAfterInsert(start: CursorPosition, text: string): CursorPosition {
  if (!text) return start;
  const lines = text.split('\n');
  if (lines.length === 1) {
    return { lineNumber: start.lineNumber, column: start.column + lines[0].length };
  }
  return {
    lineNumber: start.lineNumber + lines.length - 1,
    column: lines[lines.length - 1].length + 1,
  };
}
