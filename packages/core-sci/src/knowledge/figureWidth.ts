/**
 * figureWidth.ts — ile miejsca zajmuje rysunek.
 *
 * Rysunki z podręcznika mają skrajnie różne proporcje: schemat układu jest
 * szeroki i niski, wykres drgań wysoki i wąski. Pokazane wszystkie na pełnej
 * szerokości kolumny, jedne toną w bieli, a drugie zajmują cały ekran telefonu.
 *
 * Szerokość jest więc **własnością rysunku**, a nie ustawieniem widoku — i musi
 * zostać w pliku. Stąd dyrektywa `@width` w bloku, a nie suwak, którego wartość
 * ginie po zamknięciu karty.
 *
 * Zapis operuje na **wierszach**, nie na sparsowanym bloku — dokładnie z tego
 * samego powodu co `formula/editFormula`: zmiana jednej liczby nie ma prawa
 * przepisać autorowi całej reszty, a blok rysunku niesie podpis przepisany
 * z książki, którego nie chcemy tknąć.
 */

/** Dopuszczalne zapisy: `60%`, `420px`, `300` (piksele domyślnie). */
const WIDTH = /^(\d+(?:\.\d+)?)(%|px)?$/;

/**
 * Normalizuje zapis szerokości; `undefined`, gdy zapis jest nie do przyjęcia.
 *
 * Goła liczba znaczy piksele, bo tak zapisuje ją każdy, kto pisze blok ręcznie —
 * odrzucanie jej byłoby uporem wobec zapisu, którego znaczenie jest oczywiste.
 */
export function normalizeFigureWidth(raw: string): string | undefined {
  const dopasowanie = WIDTH.exec(raw.trim());
  if (!dopasowanie) return undefined;

  const wartość = Number(dopasowanie[1]);
  if (!(wartość > 0)) return undefined;
  // Procent powyżej stu nie ma sensu w kolumnie tekstu, a piksele powyżej
  // kilku tysięcy znaczą pomyłkę o rząd wielkości.
  if (dopasowanie[2] === '%' && wartość > 100) return undefined;

  return `${wartość}${dopasowanie[2] ?? 'px'}`;
}

/**
 * Ustawia (albo usuwa) dyrektywę `@width` w treści bloku `figure`.
 *
 * Nowa dyrektywa trafia **na koniec**, nie w środek: wiersz wcięty kontynuuje
 * poprzednią dyrektywę, więc wstawienie `@width` między wiersze łamanego
 * podpisu zamieniłoby jego drugą połowę w kontynuację szerokości.
 */
export function setFigureWidth(code: string, width: string | undefined): string {
  const znormalizowana = width === undefined ? undefined : normalizeFigureWidth(width);
  const wiersze = code.split('\n');

  const istniejąca = wiersze.findIndex((w) => /^\s*@width\b/.test(w));
  if (istniejąca >= 0) {
    if (znormalizowana === undefined) {
      wiersze.splice(istniejąca, 1);
      return wiersze.join('\n');
    }
    wiersze[istniejąca] = `@width ${znormalizowana}`;
    return wiersze.join('\n');
  }

  if (znormalizowana === undefined) return code;

  // Puste wiersze na końcu zostawiamy pod dyrektywą, żeby zapis nie zmieniał
  // odstępów, których autor mógł chcieć.
  let koniec = wiersze.length;
  while (koniec > 0 && !wiersze[koniec - 1].trim()) koniec -= 1;
  wiersze.splice(koniec, 0, `@width ${znormalizowana}`);
  return wiersze.join('\n');
}
