/**
 * uvProjection.ts — współrzędne tekstury liczone z kształtu modelu.
 *
 * Modele z generatorów przychodzą z **automatycznym rozwinięciem**: siatka jest
 * rozcięta na setki wysepek ciasno upakowanych w kwadracie 0–1. To układ pod
 * teksturę **wypalaną** do tego właśnie rozwinięcia. Nałożenie na niego zwykłego
 * obrazka daje sieczkę — każda wysepka wycina z niego przypadkowy fragment,
 * bo między układem obrazu a układem wysepek nie ma żadnego związku.
 *
 * Rzut liczy współrzędne wprost z położenia wierzchołków, więc obraz kładzie się
 * na modelu tak, jak leży on w przestrzeni — jak kalkomania. Traci się na tym
 * równomierność (ściany równoległe do kierunku rzutu wychodzą rozciągnięte),
 * ale zyskuje przewidywalność, a o nią chodzi, gdy nakleja się konkretny rysunek.
 *
 * Współrzędne **nadpisują** te z pliku. To zamierzone: gdyby dokładały się obok,
 * trzeba by jeszcze wybierać, których użyć, a materiał i tak czyta tylko jeden
 * zestaw.
 */
import type { BufferGeometryData } from '../nodes/MeshNode';

export type OsRzutu = 'x' | 'y' | 'z';
export type TrybRzutu = 'planar' | 'box';

export interface OpcjeRzutu {
  tryb: TrybRzutu;
  /** Kierunek patrzenia przy rzucie płaskim. Bez znaczenia dla sześciennego. */
  os?: OsRzutu;
  /**
   * Ile razy obraz mieści się na modelu. 1 — dokładnie raz na całym zasięgu,
   * 2 — dwa razy w każdą stronę. Powyżej 1 wymaga powtarzania tekstury.
   */
  skala?: number;
  /** Obrót obrazu wokół jego środka, w stopniach. */
  obrot?: number;
}

/** Dwie osie obrazu dla danego kierunku patrzenia. */
const OSIE_OBRAZU: Record<OsRzutu, [0 | 1 | 2, 0 | 1 | 2]> = {
  // Patrząc wzdłuż X zostają Z i Y, wzdłuż Y — X i Z, wzdłuż Z — X i Y.
  x: [2, 1],
  y: [0, 2],
  z: [0, 1],
};

interface Zasieg { min: number; max: number }

function zasiegOsi(positions: number[], os: number): Zasieg {
  let min = Infinity;
  let max = -Infinity;
  for (let i = os; i < positions.length; i += 3) {
    const v = positions[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

/**
 * Sprowadza wartość do 0–1 w obrębie zasięgu.
 *
 * Zasięg zerowy (model płaski w tej osi) daje środek zamiast dzielenia przez
 * zero — inaczej cała siatka dostałaby `NaN` i zniknęła bez śladu w konsoli.
 */
function znormalizuj(v: number, z: Zasieg): number {
  const rozpietosc = z.max - z.min;
  return rozpietosc > 1e-9 ? (v - z.min) / rozpietosc : 0.5;
}

/** Skala i obrót działają wokół środka obrazu, żeby nie zsuwać go w róg. */
function przeksztalc(u: number, v: number, skala: number, obrotRad: number): [number, number] {
  let du = (u - 0.5) * skala;
  let dv = (v - 0.5) * skala;

  if (obrotRad !== 0) {
    const c = Math.cos(obrotRad);
    const s = Math.sin(obrotRad);
    const nu = du * c - dv * s;
    dv = du * s + dv * c;
    du = nu;
  }

  return [du + 0.5, dv + 0.5];
}

function rzutPlaski(dane: BufferGeometryData, opcje: OpcjeRzutu): BufferGeometryData {
  const [osU, osV] = OSIE_OBRAZU[opcje.os ?? 'y'];
  const zU = zasiegOsi(dane.positions, osU);
  const zV = zasiegOsi(dane.positions, osV);
  const skala = opcje.skala ?? 1;
  const obrot = ((opcje.obrot ?? 0) * Math.PI) / 180;

  const uvs: number[] = [];
  for (let i = 0; i < dane.positions.length; i += 3) {
    const u = znormalizuj(dane.positions[i + osU]!, zU);
    const v = znormalizuj(dane.positions[i + osV]!, zV);
    const [pu, pv] = przeksztalc(u, v, skala, obrot);
    uvs.push(pu, pv);
  }

  return { ...dane, uvs };
}

/** Rozwija siatkę indeksowaną do listy trójkątów. */
function bezIndeksow(dane: BufferGeometryData): { positions: number[]; normals?: number[] } {
  if (!dane.indices) return { positions: dane.positions, ...(dane.normals ? { normals: dane.normals } : {}) };

  const positions: number[] = [];
  const normals: number[] = [];
  for (const idx of dane.indices) {
    positions.push(dane.positions[idx * 3]!, dane.positions[idx * 3 + 1]!, dane.positions[idx * 3 + 2]!);
    if (dane.normals) {
      normals.push(dane.normals[idx * 3]!, dane.normals[idx * 3 + 1]!, dane.normals[idx * 3 + 2]!);
    }
  }
  return { positions, ...(dane.normals ? { normals } : {}) };
}

/** Oś, wzdłuż której trójkąt jest najbardziej „płaski" — wybiera ścianę sześcianu. */
function dominujacaOs(p: number[], t: number): OsRzutu {
  const ax = p[t]!; const ay = p[t + 1]!; const az = p[t + 2]!;
  const bx = p[t + 3]!; const by = p[t + 4]!; const bz = p[t + 5]!;
  const cx = p[t + 6]!; const cy = p[t + 7]!; const cz = p[t + 8]!;

  // Normalna z iloczynu wektorowego krawędzi — liczona z pozycji, a nie z
  // atrybutu, bo normalne wierzchołków bywają wygładzone i wskazują wtedy
  // kierunek, którego ściana wcale nie ma.
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

  const absX = Math.abs(nx); const absY = Math.abs(ny); const absZ = Math.abs(nz);
  if (absX >= absY && absX >= absZ) return 'x';
  if (absY >= absZ) return 'y';
  return 'z';
}

/**
 * Rzut sześcienny: każdy trójkąt dostaje rzut z tej osi, do której jest
 * najbardziej zwrócony.
 *
 * Wynik jest **bez indeksów**. Wierzchołek na krawędzi należy do ścian
 * zwróconych w różne strony, a każda z nich potrzebuje dla niego innej
 * współrzędnej — jeden wspólny wierzchołek nie może ich mieć obu naraz.
 */
function rzutSzescienny(dane: BufferGeometryData, opcje: OpcjeRzutu): BufferGeometryData {
  const plaska = bezIndeksow(dane);
  const skala = opcje.skala ?? 1;
  const obrot = ((opcje.obrot ?? 0) * Math.PI) / 180;

  const zasiegi: Record<OsRzutu, [Zasieg, Zasieg]> = {
    x: [zasiegOsi(plaska.positions, OSIE_OBRAZU.x[0]), zasiegOsi(plaska.positions, OSIE_OBRAZU.x[1])],
    y: [zasiegOsi(plaska.positions, OSIE_OBRAZU.y[0]), zasiegOsi(plaska.positions, OSIE_OBRAZU.y[1])],
    z: [zasiegOsi(plaska.positions, OSIE_OBRAZU.z[0]), zasiegOsi(plaska.positions, OSIE_OBRAZU.z[1])],
  };

  const uvs: number[] = [];
  for (let t = 0; t + 8 < plaska.positions.length; t += 9) {
    const os = dominujacaOs(plaska.positions, t);
    const [osU, osV] = OSIE_OBRAZU[os];
    const [zU, zV] = zasiegi[os];

    for (let w = 0; w < 3; w += 1) {
      const baza = t + w * 3;
      const u = znormalizuj(plaska.positions[baza + osU]!, zU);
      const v = znormalizuj(plaska.positions[baza + osV]!, zV);
      const [pu, pv] = przeksztalc(u, v, skala, obrot);
      uvs.push(pu, pv);
    }
  }

  return {
    positions: plaska.positions,
    ...(plaska.normals ? { normals: plaska.normals } : {}),
    uvs,
  };
}

/** Nadaje geometrii współrzędne tekstury policzone z jej kształtu. */
export function generujUv(dane: BufferGeometryData, opcje: OpcjeRzutu): BufferGeometryData {
  if (!dane.positions.length) return { ...dane, uvs: [] };
  return opcje.tryb === 'box' ? rzutSzescienny(dane, opcje) : rzutPlaski(dane, opcje);
}
