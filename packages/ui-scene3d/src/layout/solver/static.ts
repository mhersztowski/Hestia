/**
 * static.ts — pozycje wprost z zapisanych wartości.
 *
 * Najprostszy z czterech i dlatego wart osobnego pliku: pokazuje, że wyrażenia
 * **nie są** cechą żadnego konkretnego silnika. Liczy je warstwa niżej
 * (`resolveValues`), więc `a.x + a.w + 8` działa tak samo w każdym trybie.
 * To, co odróżnia tryby, zaczyna się dopiero powyżej: czy pozycja wynika
 * z rodzica, z sąsiadów w rzędzie, czy z układu równań.
 */
import type { LayoutDoc, LayoutResult } from '../model/types';
import { resolveValues } from '../model/scope';

export function solveStatic(doc: LayoutDoc): LayoutResult {
  const { values, issues } = resolveValues(doc);
  return { rects: { ...values }, issues };
}
