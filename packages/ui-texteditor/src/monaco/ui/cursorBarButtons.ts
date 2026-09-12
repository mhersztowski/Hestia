/**
 * cursorBarButtons.ts — układ paska kursora nad klawiaturą ekranową.
 *
 * Same dane, bez Reacta i MUI: nazwa komendy Monaco + opis. Ikony dokłada
 * `MobileCursorBar`. Wydzielone, żeby kolejność i komplet akcji dały się
 * sprawdzić testem — na telefonie łatwo tego nie zauważyć.
 *
 * Kolejność jest „od zewnątrz do środka": skoki po pliku na skrajach, ruch o
 * jeden znak/linię w środku, czyli tam, gdzie naturalnie trafiają kciuki.
 */

/** Identyfikator akcji — używany też do wyboru ikony. */
export type CursorBarAction =
  | 'cursorTop' | 'cursorHome' | 'cursorLeft' | 'cursorUp'
  | 'cursorDown' | 'cursorRight' | 'cursorEnd' | 'cursorBottom';

export interface CursorBarButton {
  /** Komenda Monaco odpalana przez `editor.trigger`. */
  command: CursorBarAction;
  title: string;
}

export const CURSOR_BAR_BUTTONS: CursorBarButton[] = [
  { command: 'cursorTop', title: 'Początek pliku' },
  { command: 'cursorHome', title: 'Początek linii' },
  { command: 'cursorLeft', title: 'Kursor w lewo' },
  { command: 'cursorUp', title: 'Linia wyżej' },
  { command: 'cursorDown', title: 'Linia niżej' },
  { command: 'cursorRight', title: 'Kursor w prawo' },
  { command: 'cursorEnd', title: 'Koniec linii' },
  { command: 'cursorBottom', title: 'Koniec pliku' },
];
