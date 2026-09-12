/**
 * Dokumenty z modelem pisanym w skrypcie.
 *
 * Testy sprawdzają to samo, co dla dokumentów z grafu: czy tezy postawione w
 * treści są prawdziwe. Model spoza grafu nie dostaje taryfy ulgowej.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runScript, suggestViews } from '@hestia/core-sci';

const DOKUMENT = readFileSync(resolve(__dirname, '../documents/gaz-w-pudle.md'), 'utf8');
const SKRYPT = /```simscript(?::[\w-]+)?\n([\s\S]*?)```/.exec(DOKUMENT)![1];

describe('gaz w pudle', () => {
  const zbuduj = () => {
    const { model, issues } = runScript(SKRYPT);
    expect(issues, issues.join(' | ')).toEqual([]);
    return model!;
  };

  it('skrypt w TypeScripcie buduje się bez uwag', () => {
    expect(zbuduj().parameters.map((p) => p.name)).toEqual(['N', 'v0', 'L', 'seed']);
  });

  it('energia się zachowuje — zderzenia sprężyste jej nie zabierają', () => {
    const result = zbuduj().run({ N: 120, v0: 1, L: 10, seed: 7 }, [0, 6], 0.01);
    const E = result.series.E.map(([, value]) => value);
    expect((Math.max(...E) - Math.min(...E)) / Math.max(...E)).toBeLessThan(0.02);
  });

  it('cząstki zostają w pudle', () => {
    const result = zbuduj().run({ N: 100, v0: 2, L: 8, seed: 3 }, [0, 6], 0.01);
    for (const [, x] of result.series.x1) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(8);
    }
  });

  it('rozkład Maxwella wyłania się sam — teza dokumentu', () => {
    // Start: wszystkie cząstki mają tę samą wartość prędkości, więc stosunek
    // prędkości średniej kwadratowej do średniej wynosi dokładnie 1. Dla
    // dwuwymiarowego rozkładu Maxwella-Boltzmanna wynosi √(4/π) ≈ 1,1284 —
    // i to jest liczba, której nikt w tym modelu nie zapisał.
    const MAXWELL_2D = Math.sqrt(4 / Math.PI);

    // Sprawdzamy kilka ziaren: teza ma być własnością modelu, a nie jednego
    // szczęśliwego losowania.
    for (const seed of [3, 7, 11, 23]) {
      const result = zbuduj().run({ N: 250, v0: 1, L: 10, seed }, [0, 12], 0.01);
      expect(result.scalars.ksztalt, `seed ${seed}`).toBeCloseTo(MAXWELL_2D, 1);
    }
  });

  it('zanim dojdzie do zderzeń, rozkładu nie ma', () => {
    // Kontrola testu: przy bardzo krótkim czasie cząstki ledwie ruszyły i
    // wskaźnik musi być bliski jedności.
    const result = zbuduj().run({ N: 250, v0: 1, L: 10, seed: 7 }, [0, 0.05], 0.01);
    expect(result.scalars.ksztalt).toBeLessThan(1.02);
  });

  it('to samo ziarno daje ten sam wynik', () => {
    const a = zbuduj().run({ N: 80, v0: 1, L: 10, seed: 5 }, [0, 3], 0.01).scalars.v_srednia;
    const b = zbuduj().run({ N: 80, v0: 1, L: 10, seed: 5 }, [0, 3], 0.01).scalars.v_srednia;
    expect(a).toBe(b);
  });

  it('dostaje widoki z tej samej funkcji, co modele z grafu', () => {
    const views = suggestViews(zbuduj());
    expect(views.some((v) => v.kind === 'timeseries')).toBe(true);
    expect(views.some((v) => v.kind === 'scalars')).toBe(true);
  });
});

describe('Układ Słoneczny z efemeryd', () => {
  const DOK = readFileSync(resolve(__dirname, '../documents/uklad-sloneczny.md'), 'utf8');
  const KOD = /```simscript(?::[\w-]+)?\n([\s\S]*?)```/.exec(DOK)![1];

  const zbuduj = () => {
    const { model, issues } = runScript(KOD);
    expect(issues, issues.join(' | ')).toEqual([]);
    return model!;
  };

  it('skrypt ma dostęp do efemeryd z biblioteki', () => {
    const result = zbuduj().run({ lata: 2, start: 0 }, [0, 1], 0.1);
    expect(result.series.x_Mars.length).toBeGreaterThan(100);
  });

  it('orbita Marsa jest większa od ziemskiej', () => {
    const result = zbuduj().run({ lata: 4, start: 0 }, [0, 1], 0.1);
    const promien = (x: string, y: string) => {
      const xs = result.series[x];
      const ys = result.series[y];
      return xs.reduce((max, [, vx], i) => Math.max(max, Math.hypot(vx, ys[i][1])), 0);
    };
    expect(promien('x_Mars', 'y_Mars')).toBeGreaterThan(promien('x_Ziemia', 'y_Ziemia') * 1.4);
  });

  it('ruch wsteczny występuje — teza dokumentu', () => {
    expect(zbuduj().run({ lata: 4, start: 0 }, [0, 1], 0.1).scalars.cofniec).toBeGreaterThan(10);
  });

  it('odległość Marsa zmienia się kilkukrotnie', () => {
    const odleglosci = zbuduj().run({ lata: 4, start: 0 }, [0, 1], 0.1).series.odleglosc_Marsa.map(([, d]) => d);
    expect(Math.max(...odleglosci) / Math.min(...odleglosci)).toBeGreaterThan(2.5);
  });
});
