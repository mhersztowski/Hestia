/**
 * PlotBlock — kalkulator wykresów jako blok dokumentu.
 *
 * Treścią bloku jest dokument w JSON-ie, więc wykres wraca do notatki razem
 * z tekstem: kopiuje się, wersjonuje i przeszukuje jak reszta pliku. Obrazek
 * dawałby to samo na oko i nic z tego w praktyce — nie da się go poprawić bez
 * narzędzia, w którym powstał.
 *
 * ## Kiedy blok zapisuje
 *
 * Przy zmianie treści: wyrażenia, kolory, zakresy suwaków. **Nie** przy ruchu
 * suwaka ani przy przesuwaniu wykresu myszą — to podgląd, a nie zmiana
 * dokumentu. Bez tego rozróżnienia notatka zapisywałaby się kilkadziesiąt razy
 * na sekundę przy przeciąganiu, a historia zmian wypełniłaby się wpisami bez
 * treści.
 */

import { useCallback, useMemo } from 'react';
import { parsePlotDocument, serializePlotDocument, type PlotDocument } from '@hestia/core-sci';
import { SciPlot } from './SciPlot';

export interface PlotBlockProps {
  /** Zapis dokumentu; pusty = nowy, pusty kalkulator. */
  code: string;
  /** Zapis do treści bloku; brak = tryb czytania. */
  onChange?: (next: string) => void;
  height?: number | string;
}

export function PlotBlock({ code, onChange, height = 460 }: PlotBlockProps) {
  /*
   * Dokument czytamy raz, przy pierwszym renderze bloku.
   *
   * `SciPlot` trzyma własny stan i sam odsyła zmiany; ponowne czytanie `code`
   * przy każdym renderze cofałoby wpisywany wzór do wersji zapisanej —
   * a między naciśnięciem klawisza a zapisem jest cała chwila.
   */
  const początkowy = useMemo<PlotDocument>(() => parsePlotDocument(code), []);

  const zapisz = useCallback(
    (next: PlotDocument) => {
      onChange?.(serializePlotDocument(next));
    },
    [onChange]
  );

  return (
    <div>
      {początkowy.issues.length > 0 && (
        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 6 }}>
          {początkowy.issues.map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
        </div>
      )}
      <SciPlot
        initialDocument={początkowy}
        onDocumentChange={onChange ? zapisz : undefined}
        height={height}
      />
    </div>
  );
}
