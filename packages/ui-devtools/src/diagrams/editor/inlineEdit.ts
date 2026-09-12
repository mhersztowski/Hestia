/**
 * inlineEdit.ts — reguły edycji tekstu wprost na diagramie.
 *
 * Wspólne dla węzłów, krawędzi i ramek, żeby wszystkie zachowywały się tak
 * samo: Enter zatwierdza, Escape cofa, kliknięcie poza polem zatwierdza.
 */

export interface InlineEditResult {
  /** Czy wartość ma trafić do modelu. */
  changed: boolean;
  value: string;
}

/**
 * Co zrobić z wpisanym tekstem.
 *
 * @param current wartość sprzed edycji
 * @param draft to, co użytkownik zostawił w polu
 * @param allowEmpty czy pusty tekst jest sensowny (etykieta krawędzi — tak,
 *   bo znaczy „bez opisu"; nazwa węzła — nie, bo zostałby anonimowy prostokąt)
 */
export function resolveInlineEdit(current: string, draft: string, allowEmpty: boolean): InlineEditResult {
  const value = draft.trim();
  if (!value && !allowEmpty) return { changed: false, value: current };
  return { changed: value !== current, value };
}

/** Czy klawisz kończy edycję i jak. */
export function inlineEditKey(event: { key: string; shiftKey?: boolean }): 'commit' | 'cancel' | 'continue' {
  if (event.key === 'Enter' && !event.shiftKey) return 'commit';
  if (event.key === 'Escape') return 'cancel';
  return 'continue';
}

/**
 * Od czego zaczyna się edycja.
 *
 * Węzeł bez własnej etykiety wyświetla swój identyfikator, więc pole musi
 * startować właśnie od niego — inaczej klik w widoczny napis otwiera PUSTE
 * pole i wygląda to na skasowanie tekstu.
 *
 * Inaczej jest przy opisie przejścia: tam zastępczy napis („+ opis") to
 * zachęta, a nie wartość, więc edycja zaczyna się od pustego pola.
 *
 * @param value bieżąca wartość (może być pusta)
 * @param displayed tekst widoczny na diagramie, gdy `value` jest puste
 * @param displayedIsValue czy ten tekst jest realną wartością, czy tylko zachętą
 */
export function initialEditValue(value: string, displayed: string, displayedIsValue: boolean): string {
  if (value) return value;
  return displayedIsValue ? displayed : '';
}
