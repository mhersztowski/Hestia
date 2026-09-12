/**
 * ephemeris.ts — położenia planet metodą keplerowską (Standish, JPL/SSD).
 *
 * Wchłonięcie istniejącego `astro_ephemeris.js` z Drive, o którym mówi raport
 * (5). Przeniesiony jest **rdzeń obliczeniowy**, nie całość: tamten plik
 * opakowuje efemerydy w `QObject`/`QVariant` i eksportuje przez globalny
 * namespace, co ma sens w skrypcie ładowanym do przeglądarki, ale wciągnęłoby
 * do `sci-core` zależność od bundla `mycastle/qt`. Fizyka jest ta sama, tablice
 * te same (JPL/SSD, tabela 1, ważna 1800–2050); zmienia się wyłącznie
 * opakowanie — na czyste funkcje i gołe liczby.
 *
 * Metoda: elementy keplerowskie liniowo zmienne w czasie, równanie Keplera
 * rozwiązane Newtonem, przejście z płaszczyzny orbity do ekliptyki. Dokładność
 * rzędu kilku sekund łuku dla planet wewnętrznych — w zupełności wystarcza do
 * pokazania, jak wygląda Układ Słoneczny i skąd biorą się pętle Marsa na niebie.
 */

const AU = 1.495_978_707e11;
const DEG = Math.PI / 180;
const J2000_JD = 2_451_545.0;
/** Dni w stuleciu juliańskim. */
const CENTURY = 36_525;

export interface KeplerElements {
  /** Półoś wielka [AU] i jej zmiana na stulecie. */
  a: [number, number];
  /** Mimośród [-]. */
  e: [number, number];
  /** Nachylenie orbity [deg]. */
  I: [number, number];
  /** Długość średnia [deg]. */
  L: [number, number];
  /** Długość perihelium [deg]. */
  wbar: [number, number];
  /** Długość węzła wstępującego [deg]. */
  node: [number, number];
}

/**
 * Elementy keplerowskie J2000 (JPL/Standish, tabela 1).
 *
 * Ziemia to w istocie barycentrum układu Ziemia–Księżyc; różnica sięga kilku
 * tysięcy kilometrów i dla rysunku orbit nie ma znaczenia.
 */
export const KEPLER_J2000: Record<string, KeplerElements> = {
  Mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], wbar: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
  Venus: { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], wbar: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  Earth: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], wbar: [102.93768193, 0.32327364], node: [0, 0] },
  Mars: { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], wbar: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
  Jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], wbar: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
  Saturn: { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], wbar: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
  Uranus: { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], wbar: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589] },
  Neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], wbar: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664] },
};

export interface BodyData {
  mass: number;
  /** Promień równikowy [m]. */
  radius: number;
  /** Okres obrotu [s]; ujemny znaczy obrót wsteczny. */
  rotationPeriod: number;
  /** Nachylenie osi [deg]. */
  axialTilt: number;
  albedo?: number;
  color: string;
}

export const BODIES: Record<string, BodyData> = {
  Sun: { mass: 1.98892e30, radius: 6.9634e8, rotationPeriod: 25.05 * 86400, axialTilt: 7.25, color: '#fff5dc' },
  Mercury: { mass: 3.3011e23, radius: 2.4397e6, rotationPeriod: 58.646 * 86400, axialTilt: 0.034, albedo: 0.088, color: '#8c8680' },
  Venus: { mass: 4.8675e24, radius: 6.0518e6, rotationPeriod: -243.025 * 86400, axialTilt: 177.36, albedo: 0.76, color: '#e8cda2' },
  Earth: { mass: 5.97237e24, radius: 6.378137e6, rotationPeriod: 0.99726968 * 86400, axialTilt: 23.4393, albedo: 0.306, color: '#2e6fd6' },
  Mars: { mass: 6.4171e23, radius: 3.3962e6, rotationPeriod: 1.02595676 * 86400, axialTilt: 25.19, albedo: 0.25, color: '#c1440e' },
  Jupiter: { mass: 1.8982e27, radius: 7.1492e7, rotationPeriod: 0.41354 * 86400, axialTilt: 3.13, albedo: 0.503, color: '#d8ca9d' },
  Saturn: { mass: 5.6834e26, radius: 6.0268e7, rotationPeriod: 0.44401 * 86400, axialTilt: 26.73, albedo: 0.342, color: '#e3dab0' },
  Uranus: { mass: 8.6810e25, radius: 2.5559e7, rotationPeriod: -0.71833 * 86400, axialTilt: 97.77, albedo: 0.300, color: '#b5e3e3' },
  Neptune: { mass: 1.02413e26, radius: 2.4764e7, rotationPeriod: 0.67125 * 86400, axialTilt: 28.32, albedo: 0.290, color: '#3f54ba' },
};

/** Data juliańska z daty kalendarzowej albo znacznika czasu. */
export function toJulianDate(date: Date | number): number {
  // Liczba to już data juliańska — tak było w oryginale i tak używa się tego
  // w pętlach symulacji, gdzie tworzenie obiektu `Date` na krok byłoby zbędne.
  if (typeof date === 'number') return date;
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Stulecia juliańskie od J2000.0. */
export function centuriesSinceJ2000(date: Date | number): number {
  return (toJulianDate(date) - J2000_JD) / CENTURY;
}

/**
 * Rozwiązuje równanie Keplera M = E − e·sin E metodą Newtona.
 *
 * Wszystko w stopniach, jak w opisie Standisha — mieszanie jednostek w tym
 * miejscu jest klasycznym źródłem błędu, więc trzymamy się jego konwencji.
 * Zbieżność jest szybka nawet dla Merkurego (e ≈ 0,21); dwanaście kroków to
 * zapas, w praktyce wystarczają trzy.
 */
export function solveKepler(meanAnomalyDeg: number, eccentricity: number): number {
  const eStar = (180 / Math.PI) * eccentricity;
  let E = meanAnomalyDeg + eStar * Math.sin(meanAnomalyDeg * DEG);

  for (let i = 0; i < 12; i += 1) {
    const dM = meanAnomalyDeg - (E - eStar * Math.sin(E * DEG));
    const dE = dM / (1 - eccentricity * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) <= 1e-6) break;
  }
  return E;
}

/** Kąt sprowadzony do przedziału (−180, 180]. */
function wrap180(deg: number): number {
  let angle = deg % 360;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  return angle;
}

export interface HeliocentricPosition {
  /** Współrzędne w płaszczyźnie ekliptyki J2000. */
  x: number;
  y: number;
  z: number;
  /** Odległość od Słońca w tych samych jednostkach co współrzędne. */
  r: number;
}

/**
 * Położenie heliocentryczne planety.
 *
 * `units: 'AU'` daje jednostki astronomiczne (wygodne do rysunku), `'m'` metry
 * (wygodne do fizyki). Nazwa planety po angielsku, jak w tablicach JPL.
 */
export function heliocentric(
  planet: string,
  date: Date | number,
  units: 'AU' | 'm' = 'AU',
): HeliocentricPosition | undefined {
  const elements = KEPLER_J2000[planet];
  if (!elements) return undefined;

  const T = centuriesSinceJ2000(date);
  const a = elements.a[0] + elements.a[1] * T;
  const e = elements.e[0] + elements.e[1] * T;
  const I = (elements.I[0] + elements.I[1] * T) * DEG;
  const L = elements.L[0] + elements.L[1] * T;
  const wbar = elements.wbar[0] + elements.wbar[1] * T;
  const node = (elements.node[0] + elements.node[1] * T) * DEG;

  const omega = (wbar - (elements.node[0] + elements.node[1] * T)) * DEG;
  const E = solveKepler(wrap180(L - wbar), e) * DEG;

  // Położenie w płaszczyźnie orbity: oś x ku perihelium.
  const xOrbit = a * (Math.cos(E) - e);
  const yOrbit = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Trzy obroty: argument perihelium, nachylenie, długość węzła.
  const cosO = Math.cos(omega);
  const sinO = Math.sin(omega);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);
  const cosN = Math.cos(node);
  const sinN = Math.sin(node);

  const x = (cosO * cosN - sinO * sinN * cosI) * xOrbit + (-sinO * cosN - cosO * sinN * cosI) * yOrbit;
  const y = (cosO * sinN + sinO * cosN * cosI) * xOrbit + (-sinO * sinN + cosO * cosN * cosI) * yOrbit;
  const z = sinO * sinI * xOrbit + cosO * sinI * yOrbit;

  const scale = units === 'm' ? AU : 1;
  return { x: x * scale, y: y * scale, z: z * scale, r: Math.hypot(x, y, z) * scale };
}

/** Odległość planety od Słońca [AU]. */
export function heliocentricDistance(planet: string, date: Date | number): number | undefined {
  return heliocentric(planet, date)?.r;
}

/**
 * Odległość planety od Ziemi [AU].
 *
 * To ona rządzi jasnością planety na niebie i to jej zmiana tłumaczy, dlaczego
 * Mars raz świeci jak Syriusz, a raz ledwo go widać.
 */
export function distanceFromEarth(planet: string, date: Date | number): number | undefined {
  const target = heliocentric(planet, date);
  const earth = heliocentric('Earth', date);
  if (!target || !earth) return undefined;
  return Math.hypot(target.x - earth.x, target.y - earth.y, target.z - earth.z);
}

/**
 * Długość ekliptyczna planety widziana z Ziemi [deg].
 *
 * Po niej widać ruch wsteczny: długość rośnie, przez kilka tygodni maleje, po
 * czym znów rośnie — planeta zakreśla na niebie pętlę.
 */
export function geocentricLongitude(planet: string, date: Date | number): number | undefined {
  const target = heliocentric(planet, date);
  const earth = heliocentric('Earth', date);
  if (!target || !earth) return undefined;
  const angle = Math.atan2(target.y - earth.y, target.x - earth.x) / DEG;
  return (angle + 360) % 360;
}

export { AU };
