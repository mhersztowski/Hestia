/**
 * viewport.ts — widok wykresu: przeliczanie współrzędnych, przesuwanie,
 * skalowanie i podziałki osi.
 *
 * Cała warstwa jest czysta — bierze widok i rozmiar płótna, oddaje nowy widok.
 * Żadnego canvasu, żadnych zdarzeń. Dzięki temu da się sprawdzić własności,
 * które decydują o tym, czy wykres jest znośny w obsłudze, a których na oko
 * nie widać: że punkt pod kursorem nie ucieka przy skalowaniu i że przeliczenie
 * tam i z powrotem wraca do punktu wyjścia.
 *
 * Rysowanie należy do hosta (`sci-blocks`); tutaj jest tylko arytmetyka.
 */

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Granice sensownego skalowania.
 *
 * Przy zbyt głębokim przybliżeniu różnica krańców przestaje być
 * reprezentowalna w liczbach zmiennoprzecinkowych i wykres zamienia się
 * w szum; przy zbyt dużym oddaleniu tracimy precyzję na drugim końcu.
 */
const MIN_SPAN = 1e-12;
const MAX_SPAN = 1e12;

export function worldToScreen(v: Viewport, size: Size, p: Point): Point {
  return {
    x: ((p.x - v.xMin) / (v.xMax - v.xMin)) * size.width,
    // Oś y rośnie w górę, a piksele w dół — bez odwrócenia wykres stoi na głowie.
    y: size.height - ((p.y - v.yMin) / (v.yMax - v.yMin)) * size.height,
  };
}

export function screenToWorld(v: Viewport, size: Size, p: Point): Point {
  return {
    x: v.xMin + (p.x / size.width) * (v.xMax - v.xMin),
    y: v.yMin + ((size.height - p.y) / size.height) * (v.yMax - v.yMin),
  };
}

/** Ile jednostek świata przypada na piksel. */
export function unitsPerPixel(v: Viewport, size: Size): Point {
  return {
    x: (v.xMax - v.xMin) / size.width,
    y: (v.yMax - v.yMin) / size.height,
  };
}

/**
 * Przesuwa widok o zadaną liczbę pikseli.
 *
 * Znak jest odwrotny do ruchu myszy: chwytamy płótno, nie osie — treść ma iść
 * za palcem, tak jak na mapie.
 */
export function panByPixels(v: Viewport, size: Size, dxPixels: number, dyPixels: number): Viewport {
  const unit = unitsPerPixel(v, size);
  const dx = -dxPixels * unit.x;
  const dy = dyPixels * unit.y;

  return { xMin: v.xMin + dx, xMax: v.xMax + dx, yMin: v.yMin + dy, yMax: v.yMax + dy };
}

function clampSpan(min: number, max: number, fallbackMin: number, fallbackMax: number): [number, number] {
  const span = max - min;
  if (!Number.isFinite(span) || span < MIN_SPAN || span > MAX_SPAN) return [fallbackMin, fallbackMax];
  return [min, max];
}

/**
 * Skaluje widok wokół punktu na płótnie.
 *
 * `factor` mniejszy od jedności przybliża. Punkt pod kursorem musi zostać
 * dokładnie tam, gdzie był — bez tego skalowanie kołem myszy jest nie do
 * użycia, bo wykres ucieka spod wskaźnika.
 *
 * `axes` pozwala rozciągnąć samą oś, co przydaje się przy funkcjach
 * o bardzo różnych rzędach wielkości.
 */
export function zoomAt(
  v: Viewport,
  size: Size,
  factor: number,
  anchor: Point,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): Viewport {
  const world = screenToWorld(v, size, anchor);

  const scaleX = axes.x ? factor : 1;
  const scaleY = axes.y ? factor : 1;

  const [xMin, xMax] = clampSpan(
    world.x + (v.xMin - world.x) * scaleX,
    world.x + (v.xMax - world.x) * scaleX,
    v.xMin, v.xMax,
  );
  const [yMin, yMax] = clampSpan(
    world.y + (v.yMin - world.y) * scaleY,
    world.y + (v.yMax - world.y) * scaleY,
    v.yMin, v.yMax,
  );

  return { xMin, xMax, yMin, yMax };
}

/**
 * Dopasowuje widok do proporcji płótna, zachowując jednakową skalę w obu osiach.
 *
 * `keep` mówi, która oś zachowuje swój zakres; druga rozciąga się tak, by
 * jednostka miała ten sam rozmiar w pikselach. To dlatego na zrzucie Desmosa
 * przy −10 ≤ x ≤ 10 stoi −16,4873 ≤ y ≤ 16,4873 — okrąg ma wyglądać jak okrąg,
 * a nie jak elipsa.
 */
export function fitAspect(v: Viewport, size: Size, keep: 'x' | 'y'): Viewport {
  if (size.width <= 0 || size.height <= 0) return v;

  const centerX = (v.xMin + v.xMax) / 2;
  const centerY = (v.yMin + v.yMax) / 2;

  if (keep === 'x') {
    const unit = (v.xMax - v.xMin) / size.width;
    const half = (unit * size.height) / 2;
    return { xMin: v.xMin, xMax: v.xMax, yMin: centerY - half, yMax: centerY + half };
  }

  const unit = (v.yMax - v.yMin) / size.height;
  const half = (unit * size.width) / 2;
  return { xMin: centerX - half, xMax: centerX + half, yMin: v.yMin, yMax: v.yMax };
}

/**
 * Zaokrągla krok podziałki do „ładnej" liczby: 1, 2 albo 5 razy potęga dziesięciu.
 *
 * Podziałka co 3,3333 jest nie do przeczytania — ludzie liczą po jednym, po dwa
 * i po pięć, i tego oczekują na osi.
 */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;

  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;

  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * Usuwa śmieci arytmetyki zmiennoprzecinkowej z wartości podziałki.
 *
 * `0.1 + 0.2` daje `0.30000000000000004`, a taka liczba na osi rzuca się
 * w oczy. Zaokrąglamy do rzędu wielkości kroku, bo tylko tyle cyfr niesie
 * jakąkolwiek treść.
 */
function cleanTick(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const rounded = Number(value.toFixed(decimals));
  // `-0` na osi wygląda jak usterka.
  return rounded === 0 ? 0 : rounded;
}

/** Wartości podziałek mieszczące się w zakresie, z krokiem dobranym do liczby. */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  if (max < min) return niceTicks(max, min, targetCount);

  const step = niceStep((max - min) / Math.max(1, targetCount));
  const first = Math.ceil(min / step) * step;

  const ticks: number[] = [];
  // Pętla po indeksie, nie przez dodawanie kroku: kumulacja błędu przy tysiącu
  // podziałek przesuwa ostatnią o widoczny ułamek.
  for (let i = 0; ; i += 1) {
    const value = first + i * step;
    if (value > max + step * 1e-9) break;
    ticks.push(cleanTick(value, step));
    if (ticks.length > 1000) break;
  }
  return ticks;
}

/**
 * Krok drobnej siatki dla danego kroku głównego.
 *
 * Musi dzielić krok główny bez reszty, inaczej cienkie linie rozjeżdżają się
 * z grubymi. Piątka dla kroków 1 i 5, czwórka dla 2 — tak, żeby drobna kratka
 * wypadała na połówkach i ćwiartkach, a nie w przypadkowych miejscach.
 */
export function minorStep(step: number): number {
  const exponent = Math.floor(Math.log10(step));
  const normalized = step / 10 ** exponent;
  const divisions = Math.abs(normalized - 2) < 1e-9 ? 4 : 5;
  return step / divisions;
}
