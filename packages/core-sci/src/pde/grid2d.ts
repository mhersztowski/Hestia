/**
 * grid2d.ts — pola na siatce 2D (równania cząstkowe).
 *
 * Raport (Etap 5) wymienia siatki i PDE jako to, czego nie da się zapisać jako
 * układ równań zwyczajnych. Różnica jest zasadnicza: stan nie jest wektorem
 * kilku liczb, tylko całym polem, a wynik nie jest trajektorią, tylko ciągiem
 * klatek.
 *
 * Trzy decyzje, które warto uzasadnić:
 *
 *  • **Schemat jawny (różnice skończone), nie niejawny.** Niejawny pozwoliłby
 *    na większy krok, ale wymaga rozwiązywania układu w każdym kroku. Jawny
 *    mieści się w kilkudziesięciu liniach, które da się przeczytać obok wzoru
 *    z dokumentu — a to jest sensem całego przedsięwzięcia.
 *  • **Krok czasowy dobiera solver, nie autor.** Warunek stabilności
 *    (`dt ≤ h²/4α` dla dyfuzji, CFL dla fali) jest twardy: przekroczony o
 *    procent, rozsadza symulację w kilkaset kroków. Autor dokumentu nie ma
 *    powodu go znać, więc liczymy go sami z siatki i parametrów.
 *  • **Klatki, nie pełny zapis.** Siatka 64×64 przy kroku stabilności to
 *    dziesiątki tysięcy kroków; zapis każdego to setki megabajtów. Zwracamy
 *    próbkę o zadanej liczbie klatek.
 */
import { compileExpression } from '../formula/expression';
import { compileStrokes, parseStrokes } from '../pen/strokes';
import type { FormulaBlock } from '../formula/parseFormula';
import type { ParamSchema } from '../graph/compileGraph';

export interface PdeFrame {
  t: number;
  /** Wartości pola wierszami, `ny` wierszy po `nx` wartości. */
  data: Float32Array;
}

export interface PdeResult {
  frames: PdeFrame[];
  /** Zakres wartości w całym przebiegu — do wyskalowania kolorów raz, nie na klatkę. */
  min: number;
  max: number;
  /** Ile kroków wykonano; po tym widać koszt symulacji. */
  steps: number;
}

export interface PdeModel {
  field: string;
  nx: number;
  ny: number;
  domainX: [number, number];
  domainY: [number, number];
  /** `wave` — drugi rząd w czasie; `diffusion` — pierwszy. */
  order: 'diffusion' | 'wave';
  parameters: ParamSchema[];
  issues: string[];
  run(values: Record<string, number>, tSpan?: [number, number], frames?: number): PdeResult;
}

/**
 * Górna granica siatki.
 *
 * 128×128 to ~16k punktów; przy kroku stabilności daje to sekundy liczenia w
 * workerze. Powyżej symulacja przestaje nadawać się do dokumentu, w którym
 * czytelnik rusza suwakiem i oczekuje odpowiedzi.
 */
const MAX_BOK = 128;

/** Ile kroków czasowych wolno wykonać, zanim uznamy przebieg za zbyt drogi. */
const MAX_KROKOW = 400_000;

/**
 * Podstawienie laplasjanu.
 *
 * Wyrażenie z dokumentu zawiera `\Delta u` albo `\nabla^2 u`; solver liczy tę
 * wartość różnicami skończonymi i wstawia ją pod tym symbolem.
 *
 * Symbol musi być **jednoznakowy**: notacja matematyczna czyta `lap` jako
 * iloczyn `l·a·p`, więc nazwa opisowa rozpadłaby się na trzy nieznane zmienne.
 * Wielka lambda nie występuje w typowych równaniach dyfuzji i fali, a gdyby
 * autor jej użył, kompilacja to zgłasza zamiast po cichu nadpisać.
 */
const LAPLASJAN_LATEX = '\\Lambda';
const LAPLASJAN = 'Lambda';

export function podstawLaplasjan(expression: string, field: string): string {
  const pole = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return expression
    .replace(new RegExp(`\\\\Delta\\s*${pole}`, 'g'), LAPLASJAN_LATEX)
    .replace(new RegExp(`\\\\nabla\\s*\\^\\s*\\{?2\\}?\\s*${pole}`, 'g'), LAPLASJAN_LATEX);
}

/** Zakres suwaka dobrany do rzędu wielkości — jak w modelach z grafu. */
function paramSchema(name: string, unit: string): ParamSchema {
  return { name, unit, value: 1, min: 0, max: 5, step: 0.025 };
}

export function compilePde(block: FormulaBlock): PdeModel {
  const issues = block.issues.map((i) => i.message);
  const spec = block.pde ?? {};

  const field = spec.field ?? 'u';
  const nx = spec.nx ?? 64;
  const ny = spec.ny ?? 64;
  const domainX = spec.domainX ?? [0, 1];
  const domainY = spec.domainY ?? [0, 1];
  const boundary = spec.boundary ?? { kind: 'dirichlet' as const, value: 0 };
  const order: 'diffusion' | 'wave' = spec.second ? 'wave' : 'diffusion';
  const prawa = spec.second ?? spec.first;

  if (nx > MAX_BOK || ny > MAX_BOK) {
    issues.push(
      `Siatka ${nx}×${ny} jest za duża do liczenia w dokumencie — maksimum to ${MAX_BOK}×${MAX_BOK}.`,
    );
  }
  if (!prawa) issues.push('Blok pola potrzebuje „@d pole = …" albo „@d2 pole = …".');
  if (prawa?.includes(LAPLASJAN_LATEX.replace('\\\\', '\\'))) {
    issues.push(
      'Symbol \\Lambda jest zarezerwowany na laplasjan liczony przez solver — użyj innej nazwy parametru.',
    );
  }
  // Rysunek ma pierwszeństwo przed wzorem: jeśli autor coś narysował, to jest
  // jego ostatnia decyzja, a `@init` zostaje w pliku jako ślad poprzedniej.
  const warunekZrodlo = spec.strokes !== undefined
    ? compileStrokes(parseStrokes(spec.strokes))
    : spec.init;

  if (!warunekZrodlo) {
    issues.push('Blok pola potrzebuje warunku początkowego „@init …" albo rysunku „@strokes …".');
  }

  // Symbole dostępne w wyrażeniu ewolucji: laplasjan, samo pole i parametry.
  const nazwyParametrow = Object.keys(block.vars)
    .filter((name) => name !== field && name !== 'x' && name !== 'y');

  const ewolucja = prawa
    ? compileExpression(podstawLaplasjan(prawa, field), [LAPLASJAN, field, ...nazwyParametrow])
    : undefined;
  const warunek = warunekZrodlo
    ? compileExpression(warunekZrodlo, ['x', 'y', ...nazwyParametrow])
    : undefined;

  for (const issue of ewolucja?.issues ?? []) issues.push(`[${block.id}] ${issue}`);
  for (const issue of warunek?.issues ?? []) issues.push(`[${block.id}] ${issue}`);

  const uzyte = new Set([...(ewolucja?.freeSymbols ?? []), ...(warunek?.freeSymbols ?? [])]);
  const parameters = nazwyParametrow
    .filter((name) => uzyte.has(name))
    .map((name) => paramSchema(name, block.vars[name] ?? '1'));

  const hx = (domainX[1] - domainX[0]) / (nx - 1);
  const hy = (domainY[1] - domainY[0]) / (ny - 1);

  return {
    field, nx, ny, domainX, domainY, order, parameters, issues,

    run(values, tSpan = [0, 1], frames = 60) {
      if (!ewolucja || !warunek) {
        return { frames: [{ t: tSpan[0], data: new Float32Array(nx * ny) }], min: 0, max: 0, steps: 0 };
      }

      const u = new Float32Array(nx * ny);
      const scope: Record<string, number> = { ...values };

      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          scope.x = domainX[0] + i * hx;
          scope.y = domainY[0] + j * hy;
          u[j * nx + i] = warunek.evaluate(scope);
        }
      }

      // Wykrycie liniowości musi iść przed pętlą i po ustawieniu parametrów:
      // współczynniki zależą od nich (np. `\alpha` przy laplasjanie).
      const liniowe = wykryjLiniowosc(ewolucja, scope, field);

      const dt = stableStep(values, hx, hy, order, tSpan);
      const krokow = Math.max(1, Math.ceil((tSpan[1] - tSpan[0]) / dt));
      const rzeczywisteDt = (tSpan[1] - tSpan[0]) / krokow;

      if (krokow > MAX_KROKOW) {
        return {
          frames: [{ t: tSpan[0], data: u }],
          min: minOf(u), max: maxOf(u),
          steps: 0,
        };
      }

      // Fala potrzebuje poprzedniej klatki, dyfuzja nie — trzymamy oba bufory
      // niezależnie od rodzaju równania, bo alokacja jest jednorazowa.
      let poprzednie = Float32Array.from(u);
      let biezace = u;
      let nastepne = new Float32Array(nx * ny);

      const wynik: PdeFrame[] = [];
      const coIle = Math.max(1, Math.floor(krokow / Math.max(1, frames - 1)));
      let min = minOf(biezace);
      let max = maxOf(biezace);
      wynik.push({ t: tSpan[0], data: Float32Array.from(biezace) });

      for (let krok = 1; krok <= krokow; krok += 1) {
        step(biezace, poprzednie, nastepne, {
          nx, ny, hx, hy, dt: rzeczywisteDt, order, boundary, ewolucja, scope, field, liniowe,
        });

        // Rotacja buforów zamiast kopiowania: przy 16k punktów i dziesiątkach
        // tysięcy kroków kopia byłaby dominującym kosztem.
        const stare = poprzednie;
        poprzednie = biezace;
        biezace = nastepne;
        nastepne = stare;

        const czasKroku = tSpan[0] + krok * rzeczywisteDt;
        if (krok % coIle === 0 || krok === krokow) {
          if (wynik.length < frames) {
            wynik.push({ t: czasKroku, data: Float32Array.from(biezace) });
          } else {
            // Ostatnia klatka ma trafiać w koniec przedziału, żeby porównanie z
            // rozwiązaniem analitycznym dotyczyło zadanej chwili.
            wynik[frames - 1] = { t: czasKroku, data: Float32Array.from(biezace) };
          }
          min = Math.min(min, minOf(biezace));
          max = Math.max(max, maxOf(biezace));
        }
      }

      return { frames: wynik, min, max, steps: krokow };
    },
  };
}

/**
 * Krok czasowy spełniający warunek stabilności.
 *
 * Nie znamy z góry współczynnika przy laplasjanie (autor mógł napisać
 * `\alpha \cdot \Delta u` albo `c^2 \cdot \Delta u`), więc bierzemy największą
 * wartość spośród parametrów. To ostrożniejsze, niż trzeba, i o to chodzi:
 * krok za mały spowalnia, krok za duży rozsadza symulację.
 */
function stableStep(
  values: Record<string, number>,
  hx: number,
  hy: number,
  order: 'diffusion' | 'wave',
  tSpan: [number, number],
): number {
  const h = Math.min(hx, hy);
  const skala = Math.max(1e-9, ...Object.values(values).map(Math.abs));

  if (order === 'diffusion') return 0.2 * (h * h) / skala;

  // Dla fali w wyrażeniu stoi `c^2`, więc prędkością jest pierwiastek skali.
  const dlugosc = tSpan[1] - tSpan[0];
  return Math.min(0.35 * h / Math.max(Math.sqrt(skala), 1e-9), dlugosc / 4);
}

interface StepContext {
  nx: number;
  ny: number;
  hx: number;
  hy: number;
  dt: number;
  order: 'diffusion' | 'wave';
  boundary: { kind: 'dirichlet'; value: number } | { kind: 'neumann' };
  ewolucja: { evaluate(scope: Record<string, number>): number };
  scope: Record<string, number>;
  /** Nazwa pola — pod nią wstawiamy wartość w punkcie, bo równanie może od niej zależeć. */
  field: string;
  /**
   * Współczynniki `a + b·pole + c·laplasjan`, gdy równanie okazało się liniowe.
   *
   * Wywołanie skompilowanego wyrażenia w każdym punkcie każdego kroku to
   * dziesiątki milionów wywołań i około siedemdziesiąt procent czasu liczenia.
   * Dla dyfuzji i fali — czyli dla wszystkiego, co zwykle stoi w dokumencie —
   * da się je zastąpić trzema mnożeniami.
   */
  liniowe?: { a: number; b: number; c: number };
}

/**
 * Sprawdza, czy równanie jest liniowe względem pola i laplasjanu.
 *
 * Nie analizujemy wyrażenia symbolicznie, tylko **mierzymy je** w kilku
 * punktach i porównujemy z modelem liniowym. Dzięki temu test nie zależy od
 * wewnętrznej postaci skompilowanego kodu i nie da się go oszukać zapisem.
 */
function wykryjLiniowosc(
  ewolucja: { evaluate(scope: Record<string, number>): number },
  scope: Record<string, number>,
  field: string,
): { a: number; b: number; c: number } | undefined {
  const probka = (pole: number, lap: number) => {
    scope[field] = pole;
    scope[LAPLASJAN] = lap;
    return ewolucja.evaluate(scope);
  };

  const a = probka(0, 0);
  const b = probka(1, 0) - a;
  const c = probka(0, 1) - a;
  if (![a, b, c].every(Number.isFinite)) return undefined;

  // Punkty kontrolne poza tymi, z których wyliczyliśmy współczynniki —
  // inaczej test przeszedłby dla dowolnej funkcji.
  const kontrolne: Array<[number, number]> = [[2, 3], [-1, 5], [0.5, -2], [7, 0.25]];
  for (const [pole, lap] of kontrolne) {
    const zmierzone = probka(pole, lap);
    const przewidziane = a + b * pole + c * lap;
    if (Math.abs(zmierzone - przewidziane) > 1e-9 * (1 + Math.abs(przewidziane))) return undefined;
  }

  return { a, b, c };
}

/** Jeden krok schematu jawnego. */
function step(u: Float32Array, poprzednie: Float32Array, out: Float32Array, ctx: StepContext): void {
  const { nx, ny, hx, hy, dt, order, boundary, ewolucja, scope, field, liniowe } = ctx;
  const ix2 = 1 / (hx * hx);
  const iy2 = 1 / (hy * hy);

  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      const naBrzegu = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;

      if (naBrzegu && boundary.kind === 'dirichlet') {
        out[k] = boundary.value;
        continue;
      }

      // Neumann: brzeg odbija sąsiada, czyli pochodna normalna jest zerowa.
      // Realizujemy to lustrzanym indeksem, bez osobnej pętli po brzegu.
      const lewy = u[j * nx + (i === 0 ? 1 : i - 1)];
      const prawy = u[j * nx + (i === nx - 1 ? nx - 2 : i + 1)];
      const gorny = u[(j === 0 ? 1 : j - 1) * nx + i];
      const dolny = u[(j === ny - 1 ? ny - 2 : j + 1) * nx + i];

      const laplasjan = (lewy + prawy - 2 * u[k]) * ix2 + (gorny + dolny - 2 * u[k]) * iy2;

      let pochodna: number;
      if (liniowe) {
        pochodna = liniowe.a + liniowe.b * u[k] + liniowe.c * laplasjan;
      } else {
        // Pole musi trafić do zakresu tak samo jak laplasjan — bez tego każde
        // równanie zależne od `u` (reakcja-dyfuzja, tłumienie) dawało NaN.
        scope[field] = u[k];
        scope[LAPLASJAN] = laplasjan;
        pochodna = ewolucja.evaluate(scope);
      }

      out[k] = order === 'diffusion'
        ? u[k] + dt * pochodna
        // Schemat Verleta dla drugiego rzędu: u(t+dt) = 2u - u(t-dt) + dt²·ü.
        : 2 * u[k] - poprzednie[k] + dt * dt * pochodna;
    }
  }
}

/** Minimum bez `Math.min(...tablica)` — ta forma przepełnia stos przy 16k próbek. */
function minOf(data: Float32Array): number {
  let min = Infinity;
  for (let i = 0; i < data.length; i += 1) if (data[i] < min) min = data[i];
  return min;
}

function maxOf(data: Float32Array): number {
  let max = -Infinity;
  for (let i = 0; i < data.length; i += 1) if (data[i] > max) max = data[i];
  return max;
}
