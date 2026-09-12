/**
 * directives.ts — katalog dyrektyw bloków `formula` i `exercise`.
 *
 * Bloki mają dobre komunikaty błędów i **żadnej dokumentacji dostępnej w
 * miejscu pisania**. Autor musi albo pamiętać trzydzieści dyrektyw, albo
 * sięgnąć do kodu parsera — a to znaczy, że składnia jest znana tylko temu,
 * kto ją napisał.
 *
 * Katalog jest **danymi**, nie tekstem w komponencie: ta sama lista zasila
 * ściągę w edytorze, a test pilnuje, żeby nie rozjechała się z parserem.
 * Dyrektywa dodana do parsera bez wpisu tutaj (albo odwrotnie) wywala test —
 * i to jest jedyny sposób, żeby ściąga została prawdziwa dłużej niż tydzień.
 */

/** Gdzie dyrektywa ma sens. */
export type DirectiveScope = 'definition' | 'ode' | 'pde' | 'linalg' | 'relation' | 'any';

export interface DirectiveInfo {
  /** Nazwa bez `@`. */
  name: string;
  /** Jedno zdanie: co robi. */
  summary: string;
  /** Zapis do przepisania. */
  example: string;
  /** Rodzaje bloku, w których działa; `any` = wszędzie. */
  scopes: DirectiveScope[];
}

/** Dyrektywy bloku ` ```formula `. */
export const FORMULA_DIRECTIVES: DirectiveInfo[] = [
  // --- rodzaj bloku ---
  { name: 'ode', summary: 'Blok opisuje układ równań różniczkowych w czasie.', example: '@ode', scopes: ['any'] },
  { name: 'pde', summary: 'Blok opisuje pole na siatce 2D.', example: '@pde', scopes: ['any'] },
  { name: 'linalg', summary: 'Blok opisuje przekształcenie liniowe.', example: '@linalg', scopes: ['any'] },
  {
    name: 'relation',
    summary: 'Równanie wiąże wielkości, ale niczego nie wylicza — zostaje poza grafem obliczeń.',
    example: '@relation',
    scopes: ['any'],
  },

  // --- dynamika w czasie ---
  { name: 'state', summary: 'Zmienne stanu układu, w kolejności wektora stanu.', example: '@state x, v', scopes: ['ode'] },
  { name: 'd', summary: 'Pochodna zmiennej stanu po czasie.', example: '@d x = v', scopes: ['ode', 'pde'] },
  { name: 'd2', summary: 'Druga pochodna po czasie — dla pól falowych.', example: '@d2 u = c^2 \\cdot \\Delta u', scopes: ['pde'] },
  { name: 'init', summary: 'Warunek początkowy; może odwoływać się do parametrów.', example: '@init x = x_0, v = 0', scopes: ['ode', 'pde'] },
  { name: 'init2', summary: 'Początkowa pochodna po czasie dla równania drugiego rzędu.', example: '@init2 u = 0', scopes: ['pde'] },
  { name: 'when', summary: 'Warunek zdarzenia — chwila, w której coś się dzieje.', example: '@when y < 0', scopes: ['ode'] },
  { name: 'then', summary: 'Co zrobić ze stanem, gdy zdarzenie zaszło.', example: '@then v = -e \\cdot v', scopes: ['ode'] },
  { name: 'stop', summary: 'Warunek zatrzymania całkowania.', example: '@stop t > 10', scopes: ['ode'] },
  { name: 'invariant', summary: 'Wielkość, która ma pozostać stała — solver ją mierzy.', example: '@invariant E = \\frac{1}{2} m v^2', scopes: ['ode'] },
  { name: 'solver', summary: 'Metoda całkowania (rk4, euler, verlet, dopri5, rosenbrock).', example: '@solver dopri5', scopes: ['ode'] },
  { name: 'tol', summary: 'Tolerancja dla metod z krokiem adaptacyjnym.', example: '@tol 1e-8', scopes: ['ode'] },

  // --- pole na siatce ---
  { name: 'field', summary: 'Nazwa pola liczonego na siatce.', example: '@field u', scopes: ['pde'] },
  { name: 'grid', summary: 'Rozmiar siatki (maksymalnie 128 × 128).', example: '@grid 64 x 64', scopes: ['pde'] },
  { name: 'domain', summary: 'Obszar fizyczny, na którym leży siatka.', example: '@domain x: 0..1 m, y: 0..1 m', scopes: ['pde'] },
  { name: 'boundary', summary: 'Warunek brzegowy pola.', example: '@boundary dirichlet 0', scopes: ['pde'] },
  { name: 'strokes', summary: 'Warunek początkowy narysowany rysikiem, jako lista pociągnięć.', example: '@strokes …', scopes: ['pde'] },

  // --- algebra liniowa ---
  { name: 'mat', summary: 'Macierz 2×2 przekształcenia.', example: '@mat A = [[2, 1], [0, 1]]', scopes: ['linalg'] },
  { name: 'vec', summary: 'Wektor na płaszczyźnie.', example: '@vec v = [1, 0.5]', scopes: ['linalg'] },
  { name: 'mat3', summary: 'Macierz 3×3 — wymiar wynika z zapisu.', example: '@mat3 R = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]', scopes: ['linalg'] },
  { name: 'vec3', summary: 'Wektor w przestrzeni.', example: '@vec3 v = [1, 0, 0]', scopes: ['linalg'] },

  // --- wspólne ---
  { name: 'vars', summary: 'Jednostki symboli. Bez nich silnik nie zna wymiarów i nie dobierze widoku.', example: '@vars T: s, L: m, g: m/s^2', scopes: ['any'] },
  { name: 'derivedFrom', summary: 'Wzory, z których ten wynika — wiąże blok w graf wiedzy.', example: '@derivedFrom energia', scopes: ['any'] },
  { name: 'approximates', summary: 'Wzór, którego ten jest przybliżeniem.', example: '@approximates wahadlo-dokladne', scopes: ['any'] },
  { name: 'specialCaseOf', summary: 'Wzór ogólniejszy, którego ten jest przypadkiem szczególnym.', example: '@specialCaseOf ruch-jednostajny', scopes: ['any'] },
  { name: 'assume', summary: 'Kiedy wzór obowiązuje — część wzoru, nie przypis.', example: '@assume małe wychylenia', scopes: ['any'] },
];

/** Dyrektywy bloku ` ```exercise `. */
export const EXERCISE_DIRECTIVES: DirectiveInfo[] = [
  { name: 'given', summary: 'Dana losowana z zakresu; ziarno daje powtarzalny wariant.', example: '@given L: 0.3..2.5 m step 0.1', scopes: ['any'] },
  { name: 'answer', summary: 'Wielkość z grafu wzorów, która jest odpowiedzią — klucz liczy model.', example: '@answer T', scopes: ['any'] },
  { name: 'expected', summary: 'Odpowiedź przepisana z podręcznika; blok wtedy niczego nie liczy.', example: '@expected 32,2 km', scopes: ['any'] },
  { name: 'check', summary: 'Wielkość wyłuskana z odpowiedzi do porównania, gdy `@expected` jest zdaniem.', example: '@check 6 m', scopes: ['any'] },
  { name: 'kind', summary: 'Rodzaj odpowiedzi: numeric, symbolic albo interactive.', example: '@kind numeric', scopes: ['any'] },
  { name: 'tolerance', summary: 'Dopuszczalny błąd względny; domyślnie 2%.', example: '@tolerance 0.02', scopes: ['any'] },
  { name: 'level', summary: 'Poziom trudności — do katalogu zadań i powtórek.', example: '@level 2', scopes: ['any'] },
  { name: 'uses', summary: 'Wzory, których zadanie dotyczy — wpina je w graf wiedzy.', example: '@uses okres-wahadla', scopes: ['any'] },
  { name: 'hint', summary: 'Podpowiedź napisana ręcznie; bez niej generują się z grafu.', example: '@hint Masa się skraca.', scopes: ['any'] },
];

/** Dyrektywy pasujące do tego, co autor zaczął pisać po `@`. */
export function suggestDirectives(prefix: string, catalog: DirectiveInfo[]): DirectiveInfo[] {
  const szukane = prefix.replace(/^@/, '').toLowerCase();
  if (!szukane) return catalog;
  return catalog.filter((d) => d.name.toLowerCase().startsWith(szukane));
}
