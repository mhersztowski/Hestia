/**
 * visualization.ts — jaki widok należy się temu modelowi.
 *
 * Teza z sekcji 3.6b raportu: **typ wyjścia węzła determinuje domyślny widok**.
 * W spike'u widok wahadła wybierał się po nazwie zmiennej `theta`, co znaczyło,
 * że rdzeń znał jedno konkretne zjawisko — dokładnie to, czego architektura ma
 * unikać. Tutaj decyduje wyłącznie **wymiar wielkości** i struktura równań:
 *
 *  • kąt (rad) + wielkość długości wśród parametrów → ramię obrotowe,
 *  • dwie zmienne stanu o wymiarze długości → tor w płaszczyźnie,
 *  • zmienna i jej pochodna → przestrzeń fazowa,
 *  • cokolwiek zmiennego w czasie → przebieg czasowy,
 *  • reszta → liczby.
 *
 * To jest owe „solidne 80%" z raportu. Autor może je nadpisać listą `view` w
 * bloku `sim` — mechanizmem jest sensowny default plus override, nigdy przymus.
 */
import { sameDimension } from '../units/quantity';
import type { PhenomenonModel } from './compileGraph';

/** Widok proponowany dla modelu. */
export type ViewSpec =
  /** Ramię o stałej długości obracane o kąt — wahadło, tarcza, ramię robota. */
  | { kind: 'angular2d'; angle: string; radius: string }
  /** Tor punktu w płaszczyźnie — rzut, orbita, ruch po torze. */
  | { kind: 'path2d'; x: string; y: string }
  /** Tor punktu w przestrzeni — orbita nachylona, atraktor. */
  | { kind: 'path3d'; x: string; y: string; z: string }
  /** Przebiegi w czasie wszystkich wielkości zmiennych. */
  | { kind: 'timeseries'; names: string[] }
  /** Przestrzeń fazowa: wielkość względem własnej pochodnej. */
  | { kind: 'phase'; x: string; y: string }
  /** Wielkości stałe w czasie. */
  | { kind: 'scalars'; names: string[] }
  /**
   * Widmo amplitudowe przebiegów.
   *
   * Wyłącznie **na żądanie**: dla drgań jest najważniejszym widokiem, ale
   * spadek swobodny czy rozpad wykładniczy mają widmo bez treści, a pokazane
   * domyślnie sugerowałoby, że jest co z niego odczytać.
   */
  | { kind: 'spectrum'; names: string[] };

export type ViewKind = ViewSpec['kind'];

/** Czy jednostka opisuje kąt. */
function isAngle(unit?: string): boolean {
  return !!unit && (unit === 'rad' || unit === 'deg' || sameDimension(unit, 'rad'));
}

/** Czy jednostka opisuje długość. */
function isLength(unit?: string): boolean {
  // `rad` przechodzi test wymiaru długości w math.js (kąt jest bezwymiarowy),
  // więc trzeba go odsiać wprost — inaczej kąt udawałby współrzędną toru.
  return !!unit && !isAngle(unit) && sameDimension(unit, 'm');
}

/**
 * Proponuje widoki dla modelu.
 *
 * `requested` to lista z bloku `sim`; pusta znaczy „zdecyduj sam". Nazwy,
 * których nie znamy, pomijamy — literówka w konfiguracji ma zabrać jeden widok,
 * a nie cały dokument.
 */
export function suggestViews(model: PhenomenonModel, requested?: string[]): ViewSpec[] {
  const views: ViewSpec[] = [];

  const stateNames = model.observables.filter((o) => o.fromState).map((o) => o.name);
  const unitOf = (name: string) => model.observables.find((o) => o.name === name)?.unit
    ?? model.parameters.find((p) => p.name === name)?.unit;

  // Ramię obrotowe: kąt jest zmienną stanu, a promień — stałą długością, którą
  // da się pokazać na rysunku.
  const angle = stateNames.find((name) => isAngle(unitOf(name)));
  const radius = model.parameters.find((p) => isLength(p.unit))?.name;
  if (angle && radius) views.push({ kind: 'angular2d', angle, radius });

  // Tor: zmienne stanu o wymiarze długości, w kolejności z równań. Trzy dają
  // krzywą w przestrzeni, dwie — w płaszczyźnie. Zjawiska bezwymiarowe (Lorenz)
  // też mają tor, ale ich zmienne nie mają jednostki, więc bierzemy je z
  // osobnej reguły: cały stan bezwymiarowy i dokładnie trzy zmienne.
  const lengths = stateNames.filter((name) => isLength(unitOf(name)));
  const dimensionless = stateNames.filter((name) => !unitOf(name) || unitOf(name) === '1');

  if (lengths.length >= 3) views.push({ kind: 'path3d', x: lengths[0], y: lengths[1], z: lengths[2] });
  else if (lengths.length === 2) views.push({ kind: 'path2d', x: lengths[0], y: lengths[1] });
  else if (dimensionless.length === 3 && dimensionless.length === stateNames.length) {
    views.push({ kind: 'path3d', x: dimensionless[0], y: dimensionless[1], z: dimensionless[2] });
  }

  const changing = model.observables.filter((o) => o.kind === 'series').map((o) => o.name);
  if (changing.length) views.push({ kind: 'timeseries', names: changing });

  // Przestrzeń fazowa: para (zmienna, jej pochodna). Model wie, która zmienna
  // stanu jest pochodną której — to stoi wprost w równaniach.
  const pair = model.derivativePairs?.[0];
  if (pair) views.push({ kind: 'phase', x: pair[0], y: pair[1] });

  const scalars = model.observables.filter((o) => o.kind === 'scalar').map((o) => o.name);
  if (scalars.length) views.push({ kind: 'scalars', names: scalars });

  if (!requested?.length) return views;

  // Widoki dostępne tylko na żądanie — sensowne dla części zjawisk, więc
  // proponowanie ich wszystkim byłoby myleniem czytelnika.
  const naŻyczenie: ViewSpec[] = changing.length ? [{ kind: 'spectrum', names: changing }] : [];

  return requested
    .map((kind) => [...views, ...naŻyczenie].find((view) => view.kind === kind))
    .filter((view): view is ViewSpec => !!view);
}
