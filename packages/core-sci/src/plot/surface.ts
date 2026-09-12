/**
 * surface.ts — próbkowanie powierzchni `z = f(x, y)`.
 *
 * Kalkulator liczył dotąd wyłącznie na płaszczyźnie. Powierzchnia jest jednak
 * jedynym sposobem pokazania rzeczy, których rzut płaski nie pokazuje: siodła,
 * ekstremów lokalnych, kształtu funkcji dwóch zmiennych. Silnik 3D w pakiecie
 * już jest (`LinAlgStage3D`), więc rdzeń dokłada tylko liczby.
 *
 * Wynikiem jest **siatka wartości**, a nie geometria: rdzeń nie wie, czym jest
 * trójkąt ani materiał, a ta sama siatka zasila też mapę wysokości i eksport
 * do CSV.
 */
import { compileExpression } from '../formula/expression';

export interface SurfaceRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface SurfaceGrid {
  /** Liczba punktów na bok — siatka jest kwadratowa. */
  n: number;
  range: SurfaceRange;
  /** Wartości wierszami: `values[iy * n + ix]`. */
  values: number[];
  /** Zakres wartości **z pominięciem punktów nieokreślonych** — do skalowania. */
  min: number;
  max: number;
  issues: string[];
}

/**
 * Próbkuje powierzchnię na siatce `n × n`.
 *
 * Punkty nieokreślone zostają jako `NaN`, a nie zerem. Zero byłoby kłamstwem:
 * `1/x` w zerze nie ma wartości, a płaska plama w środku wykresu wyglądałaby
 * na własność funkcji, nie na jej brak.
 */
export function sampleSurface(
  expression: string,
  range: SurfaceRange,
  parameters: Record<string, number>,
  n: number,
): SurfaceGrid {
  const compiled = compileExpression(expression);
  if (compiled.issues.length > 0) {
    return { n, range, values: [], min: 0, max: 0, issues: compiled.issues };
  }

  const values = new Array<number>(n * n);
  let min = Infinity;
  let max = -Infinity;

  const dx = n > 1 ? (range.xMax - range.xMin) / (n - 1) : 0;
  const dy = n > 1 ? (range.yMax - range.yMin) / (n - 1) : 0;

  for (let iy = 0; iy < n; iy += 1) {
    const y = range.yMin + iy * dy;
    for (let ix = 0; ix < n; ix += 1) {
      const x = range.xMin + ix * dx;
      let wartosc: number;
      try {
        wartosc = compiled.evaluate({ ...parameters, x, y });
      } catch {
        wartosc = NaN;
      }
      values[iy * n + ix] = wartosc;
      if (Number.isFinite(wartosc)) {
        if (wartosc < min) min = wartosc;
        if (wartosc > max) max = wartosc;
      }
    }
  }

  // Powierzchnia bez ani jednego określonego punktu nie ma zakresu — zwracamy
  // zera zamiast nieskończoności, żeby skalowanie nie dostało `Infinity`.
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }

  return { n, range, values, min, max, issues: [] };
}
