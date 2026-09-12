/**
 * Rzutowanie UV — nadanie modelowi współrzędnych, których nie da się dostać
 * z automatycznego rozwinięcia.
 *
 * Powód jest konkretny: model z generatora przychodzi rozcięty na setki
 * wysepek upakowanych w kwadracie 0–1. To układ pod **wypalony** atlas, więc
 * nałożenie na niego spójnego obrazka daje sieczkę — każda wysepka wycina
 * przypadkowy fragment. Rzut z osi układa współrzędne tak, jak leży model,
 * i obraz wchodzi na niego jak kalkomania.
 */
import { describe, it, expect } from 'vitest';
import { generujUv } from './uvProjection';
import type { BufferGeometryData } from '../nodes/MeshNode';

/** Kwadrat leżący w płaszczyźnie XZ, o boku 2, wyśrodkowany w zerze. */
const KWADRAT_XZ: BufferGeometryData = {
  positions: [
    -1, 0, -1,
    1, 0, -1,
    1, 0, 1,
    -1, 0, 1,
  ],
  indices: [0, 1, 2, 0, 2, 3],
};

const paryUv = (uvs: number[]): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < uvs.length; i += 2) out.push([uvs[i]!, uvs[i + 1]!]);
  return out;
};

describe('rzut płaski', () => {
  it('rozciąga obraz na cały zasięg modelu', () => {
    const wynik = generujUv(KWADRAT_XZ, { tryb: 'planar', os: 'y' });
    const uv = paryUv(wynik.uvs!);

    // Cztery rogi kwadratu mają trafić w cztery rogi obrazu.
    expect(uv).toHaveLength(4);
    const u = uv.map((p) => p[0]).sort();
    const v = uv.map((p) => p[1]).sort();
    expect(u[0]).toBeCloseTo(0);
    expect(u[3]).toBeCloseTo(1);
    expect(v[0]).toBeCloseTo(0);
    expect(v[3]).toBeCloseTo(1);
  });

  it('nie rusza pozycji ani indeksów', () => {
    // Rzut płaski liczy współrzędne per wierzchołek, więc siatka zostaje ta sama.
    const wynik = generujUv(KWADRAT_XZ, { tryb: 'planar', os: 'y' });

    expect(wynik.positions).toEqual(KWADRAT_XZ.positions);
    expect(wynik.indices).toEqual(KWADRAT_XZ.indices);
  });

  it('skala powtarza obraz, zamiast go rozciągać', () => {
    const wynik = generujUv(KWADRAT_XZ, { tryb: 'planar', os: 'y', skala: 2 });
    const u = paryUv(wynik.uvs!).map((p) => p[0]);

    // Zakres rośnie dwukrotnie wokół środka, więc obraz mieści się dwa razy.
    expect(Math.min(...u)).toBeCloseTo(-0.5);
    expect(Math.max(...u)).toBeCloseTo(1.5);
  });

  it('obrót kręci obrazem wokół środka', () => {
    const wynik = generujUv(KWADRAT_XZ, { tryb: 'planar', os: 'y', obrot: 90 });
    const uv = paryUv(wynik.uvs!);

    // Po ćwierć obrotu rogi dalej wypełniają kwadrat — zmienia się przypisanie.
    for (const [u, v] of uv) {
      expect(u).toBeGreaterThanOrEqual(-0.001);
      expect(u).toBeLessThanOrEqual(1.001);
      expect(v).toBeGreaterThanOrEqual(-0.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
    // Róg, który leżał w (0,0), po obrocie leży gdzie indziej.
    expect(uv[0]![0]).not.toBeCloseTo(0);
  });

  it('rzut z osi X używa pozostałych dwóch osi', () => {
    // Kwadrat leży w XZ, więc patrząc wzdłuż X jest linią — zasięg wzdłuż
    // jednej z osi obrazu jest zerowy i musi dać stałą, a nie dzielenie przez zero.
    const wynik = generujUv(KWADRAT_XZ, { tryb: 'planar', os: 'x' });

    expect(wynik.uvs!.every((n) => Number.isFinite(n))).toBe(true);
  });

  it('płaski model bez grubości nie psuje współrzędnych', () => {
    const plaski: BufferGeometryData = { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1] };
    const wynik = generujUv(plaski, { tryb: 'planar', os: 'z' });

    // Zasięg wzdłuż jednej osi jest zerowy — bierzemy środek zamiast NaN.
    expect(wynik.uvs!.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe('rzut sześcienny', () => {
  /** Sześcian jako trójkąty bez indeksów — dwie ściany wystarczą do sprawdzenia. */
  const DWIE_SCIANY: BufferGeometryData = {
    positions: [
      // ściana skierowana w górę (+Y)
      -1, 1, -1, 1, 1, -1, 1, 1, 1,
      // ściana skierowana w bok (+X)
      1, -1, -1, 1, 1, -1, 1, 1, 1,
    ],
  };

  it('każda ściana dostaje własny rzut, więc obraz nie jest rozmazany', () => {
    const wynik = generujUv(DWIE_SCIANY, { tryb: 'box' });
    const uv = paryUv(wynik.uvs!);

    expect(uv).toHaveLength(6);
    for (const [u, v] of uv) {
      expect(u).toBeGreaterThanOrEqual(-0.001);
      expect(u).toBeLessThanOrEqual(1.001);
      expect(v).toBeGreaterThanOrEqual(-0.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it('rozdziela wierzchołki, bo jeden nie może należeć do dwóch ścian naraz', () => {
    // Wierzchołek wspólny dla ścian o różnych kierunkach potrzebuje dwóch
    // różnych współrzędnych — bez rozdzielenia jedna ściana dostałaby cudze.
    const zIndeksami: BufferGeometryData = {
      positions: DWIE_SCIANY.positions,
      indices: [0, 1, 2, 3, 4, 5],
    };
    const wynik = generujUv(zIndeksami, { tryb: 'box' });

    expect(wynik.indices).toBeUndefined();
    expect(wynik.positions).toHaveLength(18);
    expect(wynik.uvs).toHaveLength(12);
  });
});

describe('sytuacje brzegowe', () => {
  it('geometria bez wierzchołków przechodzi bez wyjątku', () => {
    const wynik = generujUv({ positions: [] }, { tryb: 'planar', os: 'y' });

    expect(wynik.uvs).toEqual([]);
  });

  it('zachowuje normalne, gdy model je ma', () => {
    const zNormalnymi: BufferGeometryData = {
      ...KWADRAT_XZ,
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    };
    const wynik = generujUv(zNormalnymi, { tryb: 'planar', os: 'y' });

    expect(wynik.normals).toEqual(zNormalnymi.normals);
  });
});
