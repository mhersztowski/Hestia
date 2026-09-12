/**
 * diagramIssues.ts — uwagi z rozbioru diagramu w postaci dla człowieka.
 *
 * `ParseResult.issues` niesie problemy, które nie przerwały parsowania:
 * krawędź do węzła, którego nie ma, nieznana dyrektywa, zły kształt macierzy.
 * Kontrakt miał je od początku i **nikt ich nie pokazywał**, więc autor widział
 * tylko, że diagram wygląda inaczej, niż napisał, bez wskazówki gdzie szukać.
 *
 * Numer linii w modelu jest liczony od zera — tak indeksuje się tablicę linii.
 * Człowiek liczy od jedynki i tak numeruje je każdy edytor, więc przesunięcie
 * należy do warstwy, która pokazuje, a nie do parsera.
 */

/** Kształt zgodny z `ParseIssue` z `web-devtools`, powtórzony, by nie wiązać UI z pakietem. */
export interface DiagramIssue {
  line?: number;
  message: string;
}

/** Uwaga z numerem linii, jeśli parser go zna. */
export function formatIssue(issue: DiagramIssue): string {
  return issue.line === undefined ? issue.message : `linia ${issue.line + 1}: ${issue.message}`;
}

/**
 * Podsumowanie liczbą — „3 uwagi", „5 uwag".
 *
 * Polska odmiana liczebnika ma trzy formy i wybór zależy od dwóch ostatnich
 * cyfr: „22 uwagi", ale „12 uwag". Zwykłe `n === 1 ? … : …` dałoby „22 uwag".
 */
export function issueSummary(issues: DiagramIssue[]): string | undefined {
  const n = issues.length;
  if (n === 0) return undefined;
  if (n === 1) return '1 uwaga';

  const ostatnia = n % 10;
  const dziesiatki = n % 100;
  const forma = ostatnia >= 2 && ostatnia <= 4 && !(dziesiatki >= 12 && dziesiatki <= 14)
    ? 'uwagi'
    : 'uwag';
  return `${n} ${forma}`;
}
