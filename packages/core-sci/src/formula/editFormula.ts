/**
 * editFormula.ts — wskazanie i podmiana wzorów w bloku.
 *
 * Warstwa pod wizualną edycją matematyki (raport §3.4). Edytor pokazuje **wzór**,
 * ale w pliku leży **blok**: wzór plus dyrektywy z jednostkami, powiązaniami i
 * założeniami. Ten moduł tłumaczy w obie strony i pilnuje jednej rzeczy —
 * podmiana nie może zgubić niczego poza tym, co autor faktycznie zmienił.
 *
 * Operujemy na **wierszach**, nie na wyrażeniach sparsowanych: blok wraca do
 * pliku dokładnie taki, jaki był, z zachowaniem odstępów i kolejności. Zapis
 * przez ponowną serializację modelu przepisywałby autorowi cały blok przy
 * każdej drobnej poprawce.
 */

export interface EditableExpression {
  /** Numer wiersza w bloku — po nim wraca podmiana. */
  line: number;
  /** Treść do pokazania w edytorze matematyki. */
  latex: string;
  /** Opis dla czytelnika: „T" albo „d omega / dt". */
  label: string;
}

/** `@d nazwa = wyrażenie` — pochodna w układzie ODE. */
const POCHODNA = /^@d\s+([A-Za-z][A-Za-z0-9_\\]*)\s*=\s*(.+)$/;
/** Zwykłe przypisanie `nazwa = wyrażenie`, bez dyrektywy na początku. */
const PRZYPISANIE = /^([^@=][^=]*)=\s*(.+)$/;

/**
 * Wzory z bloku nadające się do edycji wizualnej.
 *
 * Dyrektywy bez matematyki (`@vars`, `@state`, `@derivedFrom`) są pomijane:
 * otwarcie deklaracji jednostek w edytorze matematyki dałoby bezsens, a zapis
 * zniszczyłby ich składnię.
 */
export function editableExpressions(body: string): EditableExpression[] {
  const wynik: EditableExpression[] = [];

  body.split('\n').forEach((wiersz, line) => {
    const trimmed = wiersz.trim();
    if (!trimmed) return;

    const pochodna = POCHODNA.exec(trimmed);
    if (pochodna) {
      wynik.push({
        line,
        // Edytujemy samą prawą stronę: lewa jest ustalona przez `@state` i
        // zmiana jej w edytorze matematyki rozspójniłaby układ.
        latex: pochodna[2].trim(),
        label: `d ${pochodna[1]} / dt`,
      });
      return;
    }

    if (trimmed.startsWith('@')) return;

    const przypisanie = PRZYPISANIE.exec(trimmed);
    if (przypisanie) {
      wynik.push({
        line,
        // Definicja idzie w całości, z lewą stroną: nazwa wielkości jest tu
        // częścią wzoru i autor ma prawo ją zmienić.
        latex: trimmed,
        label: przypisanie[1].trim(),
      });
    }
  });

  return wynik;
}

/**
 * Podmienia wzór w zadanym wierszu, zostawiając resztę bloku bez zmian.
 *
 * Przy pochodnej odtwarzamy przedrostek `@d nazwa =`, bo edytor pokazywał samą
 * prawą stronę — bez tego blok przestałby być układem równań.
 *
 * Wiersz spoza zakresu zwraca blok bez zmian: to znaczy, że edytor i dokument
 * się rozjechały, a wtedy lepiej nie zrobić nic, niż wstawić wzór w przypadkowe
 * miejsce.
 */
export function replaceExpression(body: string, line: number, latex: string): string {
  const wiersze = body.split('\n');
  if (line < 0 || line >= wiersze.length) return body;

  const trimmed = wiersze[line].trim();
  const pochodna = POCHODNA.exec(trimmed);

  wiersze[line] = pochodna
    ? `@d ${pochodna[1]} = ${latex.trim()}`
    : latex.trim();

  return wiersze.join('\n');
}
