/**
 * runScript.ts — model z kodu napisanego w dokumencie.
 *
 * Blok `simscript` z raportu (4): kod dla zjawisk, których nie ma w bibliotece.
 * Ścieżka jest celowo taka sama jak dla modeli ręcznych — skrypt wywołuje
 * `defineModel` i zwraca to, co zwróciłby plik w pakiecie. Dzięki temu
 * „eksperyment zaczyna życie jako simscript, a po dopracowaniu awansuje do
 * biblioteki" jest przenosinami pliku, a nie przepisywaniem go.
 *
 * **Skrypt jest w TypeScripcie**, nie w JS, i to jest istotne dla całej
 * ścieżki awansu: kod, który ma kiedyś trafić do pakietu, od pierwszej chwili
 * ma typy, a edytor podpowiada API rdzenia i sprawdza sygnatury. Gdyby blok
 * przyjmował JS, awans oznaczałby dopisywanie typów do gotowego kodu — czyli
 * dokładnie ten moment, w którym najłatwiej o pomyłkę.
 *
 * Uruchomienie ma dwa kroki: `sucrase` **usuwa typy** (nie sprawdza ich — od
 * sprawdzania jest edytor), a `Function` wykonuje wynik. To nie jest
 * piaskownica bezpieczeństwa i nie udajemy, że jest: skrypt w dokumencie ma
 * tyle samo uprawnień, co każdy inny kod autora dokumentu. Zasłaniamy natomiast
 * `window`, `fetch` i spółkę, żeby model fizyczny nie sięgał po przeglądarkę
 * przez pomyłkę — i żeby dało się go później uruchomić w Web Workerze bez
 * niespodzianek.
 */
import { transform } from 'sucrase';
import { defineModel, type ManualModelSpec } from './defineModel';
import { rk4, euler, verlet } from '../numeric/solvers';
import { dopri5 } from '../numeric/dopri5';
import { rosenbrock } from '../numeric/rosenbrock';
import { findEventTime } from '../numeric/events';
import { buildModel, registerModel } from '../models/registry';
// Import dla efektu ubocznego: bez niego `buildModel('wahadlo')` w skrypcie
// odpowiadałby „nie znam", bo wpisy trafiają do rejestru przy ładowaniu pliku.
import '../models/builtin';
import { measureInvariant } from '../numeric/invariants';
import { studyConvergence } from '../numeric/convergence';
import { Trajectory } from '../numeric/trajectory';
import { CONSTANTS } from '../units/constants';
import { toSI } from '../units/quantity';
import type { PhenomenonModel } from '../graph/compileGraph';
import { heliocentric, distanceFromEarth, geocentricLongitude, BODIES } from '../astro/ephemeris';

/** Co skrypt dostaje pod ręką — rdzeń biblioteki, nic więcej. */
export interface ScriptApi {
  defineModel: typeof defineModel;
  rk4: typeof rk4;
  euler: typeof euler;
  verlet: typeof verlet;
  /** Krok dobierany do tolerancji — dla zjawisk o zmiennej skali czasu. */
  dopri5: typeof dopri5;
  /** Metoda niejawna — dla układów sztywnych (obwody RC, kinetyka reakcji). */
  rosenbrock: typeof rosenbrock;
  /** Pomiar wielkości, która miała pozostać stała. */
  measureInvariant: typeof measureInvariant;
  /** Rząd metody i oszacowanie błędu z zagęszczania kroku. */
  studyConvergence: typeof studyConvergence;
  /** Chwila zdarzenia jako miejsce zerowe — gdy skrypt szuka jej sam. */
  findEventTime: typeof findEventTime;
  /**
   * Biblioteka zjawisk.
   *
   * Skrypt, który chce **złożyć** coś z gotowego modelu (dorzucić obserwablę,
   * porównać dwa warianty), nie powinien przepisywać jego równań. A skrypt,
   * który dojrzał do biblioteki, awansuje przez `registerModel` bez zmiany
   * jednej linijki w środku — to jest cała ścieżka awansu z raportu.
   */
  buildModel: typeof buildModel;
  registerModel: typeof registerModel;
  Trajectory: typeof Trajectory;
  CONSTANTS: typeof CONSTANTS;
  toSI: typeof toSI;
  /** Deterministyczny generator — ta sama zasada co w zadaniach. */
  random: (seed: number) => () => number;
  /** Efemerydy planet — wchłonięty moduł astronomiczny. */
  heliocentric: typeof heliocentric;
  distanceFromEarth: typeof distanceFromEarth;
  geocentricLongitude: typeof geocentricLongitude;
  BODIES: typeof BODIES;
}

/**
 * Deklaracje dla edytora.
 *
 * Host (Monaco) może je wstrzyknąć jako bibliotekę dodatkową, żeby autor
 * dostał podpowiadanie i sprawdzanie typów w bloku. Trzymamy je tutaj, przy
 * definicji API, bo rozjazd deklaracji z rzeczywistością byłby gorszy niż ich
 * brak — podpowiedź do funkcji, która nie istnieje, myli bardziej niż cisza.
 */
export const SCRIPT_API_TYPES = `
declare function defineModel(spec: {
  parameters: Array<{ name: string; unit?: string; value?: number; min?: number; max?: number; step?: number }>;
  observables: Array<{ name: string; kind?: 'scalar' | 'series'; unit?: string }>;
  run: (values: Record<string, number>, tSpan: [number, number], dt: number) => {
    scalars?: Record<string, number>;
    series?: Record<string, Array<[number, number]>>;
    trajectory?: unknown;
  };
  derivativePairs?: Array<[string, string]>;
  dynamic?: boolean;
}): unknown;

/**
 * Wynik całkowania — to samo, co zwraca każdy solver.
 *
 * Klasa, a nie interfejs: skrypt bywa po drugiej stronie granicy i składa
 * trajektorię z gotowych próbek, więc potrzebuje też konstruktora.
 */
declare class Trajectory {
  constructor(samples: Array<{ t: number; y: number[] }>, stateNames: string[]);
  samples: Array<{ t: number; y: number[] }>;
  stateNames: string[];
  t0: number;
  t1: number;
  length: number;
  at(t: number): number[];
  value(name: string, t: number): number;
  series(name: string): Array<[number, number]>;
}

interface FixedStepOptions { dt: number; sampleEvery?: number; stateNames?: string[] }

declare function rk4(
  f: (t: number, y: number[]) => number[],
  y0: number[],
  tSpan: [number, number],
  options: FixedStepOptions,
): Trajectory;

/** Pierwszego rzędu — materiał poglądowy: widać na nim narastanie energii. */
declare function euler(
  f: (t: number, y: number[]) => number[],
  y0: number[],
  tSpan: [number, number],
  options: FixedStepOptions,
): Trajectory;

/** Symplektyczny; przyjmuje **przyspieszenie**, nie pełną pochodną. */
declare function verlet(
  a: (t: number, x: number[]) => number[],
  x0: number[],
  v0: number[],
  tSpan: [number, number],
  options: FixedStepOptions,
): Trajectory;

/** Zdarzenie jako miejsce zerowe funkcji „g” — chwila liczona, nie zgadywana. */
interface EventSpec {
  name?: string;
  g: (t: number, y: number[]) => number;
  direction?: 'up' | 'down' | 'any';
  stop?: boolean;
  apply?: (t: number, y: number[]) => number[];
}

declare function dopri5(
  f: (t: number, y: number[]) => number[],
  y0: number[],
  tSpan: [number, number],
  options?: {
    rtol?: number; atol?: number; dt?: number; maxStep?: number;
    stateNames?: string[]; events?: EventSpec[];
  },
): Trajectory;

declare function rosenbrock(
  f: (t: number, y: number[]) => number[],
  y0: number[],
  tSpan: [number, number],
  options?: {
    rtol?: number; atol?: number; dt?: number; stateNames?: string[];
    jacobian?: (t: number, y: number[]) => number[][];
  },
): Trajectory;

/** Chwila, w której „g” przechodzi przez zero — do własnych poszukiwań. */
declare function findEventTime(
  g: (t: number) => number,
  ta: number,
  tb: number,
  tolerance?: number,
): number | undefined;

/** Model z biblioteki zjawisk — do złożenia z własnym albo do porównania. */
declare function buildModel(
  name: string,
  options?: Record<string, unknown>,
): { model?: unknown; issues: string[] };

/** Wpisanie własnego zjawiska do biblioteki — pierwszy krok awansu skryptu. */
declare function registerModel(spec: {
  name: string;
  summary: string;
  options?: string[];
  build: (options: Record<string, unknown>) => unknown;
}): () => void;

declare function measureInvariant(
  trajectory: Trajectory,
  of: (state: number[], t: number) => number,
  options?: { name?: string },
): { name: string; trend: 'stable' | 'oscillation' | 'drift'; relative: number };

declare function studyConvergence(
  run: (dt: number) => Trajectory,
  options: { dt: number; at?: number; levels?: number },
): { order?: number; error?: number };

declare function toSI(value: string | number, expected?: string): number;
declare function random(seed: number): () => number;
declare const CONSTANTS: Record<string, { value: number; unit: string; name: string }>;

declare function heliocentric(
  planet: string,
  date: Date | number,
  units?: 'AU' | 'm',
): { x: number; y: number; z: number; r: number } | undefined;
declare function distanceFromEarth(planet: string, date: Date | number): number | undefined;
declare function geocentricLongitude(planet: string, date: Date | number): number | undefined;
declare const BODIES: Record<string, { mass: number; radius: number; color: string }>;
`;

/**
 * Nazwy zasłonięte w zakresie skryptu.
 *
 * Nie obrona przed złośliwym kodem (ten i tak ma `globalThis`), tylko ochrona
 * przed przypadkowym sięgnięciem po przeglądarkę z modelu fizycznego.
 */
const SHADOWED = [
  'window', 'document', 'globalThis', 'self', 'fetch', 'XMLHttpRequest',
  'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket', 'importScripts',
  'process', 'require',
];
// `eval` i `arguments` świadomie poza listą: w trybie strict nie wolno ich użyć
// jako nazw parametrów, więc próba zasłonięcia wywala każdy skrypt na starcie.
// Sam tryb strict i tak ogranicza `eval` do jego własnego zakresu.

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScriptResult {
  model?: PhenomenonModel;
  issues: string[];
  /** Kod po usunięciu typów — pomaga zrozumieć błąd wykonania. */
  compiled?: string;
}

/**
 * Usuwa typy z kodu TypeScript.
 *
 * Wydzielone, bo błąd składni trzeba odróżnić od błędu wykonania: pierwszy
 * wskazuje miejsce w kodzie, drugi dotyczy już działającego modelu.
 */
export function stripTypes(code: string): { js?: string; error?: string } {
  try {
    // `imports: false` — skrypt nie ma modułów, API przychodzi przez zakres.
    const { code: js } = transform(code, {
      transforms: ['typescript'],
      disableESTransforms: true,
    });
    return { js };
  } catch (error) {
    return { error: `Błąd składni: ${(error as Error).message}` };
  }
}

/**
 * Uruchamia skrypt i odbiera model.
 *
 * Skrypt ma zwrócić wynik `defineModel(...)` — przez `return` albo przez
 * przypisanie do `model`. Druga forma jest dla wygody: `return` na najwyższym
 * poziomie bloku w dokumencie wygląda dziwnie.
 */
/**
 * Domyślny zestaw symboli widocznych w skrypcie.
 *
 * Wydzielone z `runScript`, żeby dało się je **wyliczyć** — bez tego lista
 * symboli istniałaby tylko jako typ, a typ znika przy kompilacji i nie da się
 * na nim oprzeć testu spójności z deklaracjami dla edytora.
 */
export function defaultScriptApi(): ScriptApi {
  return {
    defineModel,
    rk4,
    euler,
    verlet,
    dopri5,
    rosenbrock,
    measureInvariant,
    studyConvergence,
    findEventTime,
    buildModel,
    registerModel,
    Trajectory,
    CONSTANTS,
    toSI,
    random: seededRandom,
    heliocentric,
    distanceFromEarth,
    geocentricLongitude,
    BODIES,
  };
}

export function runScript(code: string, api: Partial<ScriptApi> = {}): ScriptResult {
  const stripped = stripTypes(code);
  if (stripped.error || stripped.js === undefined) return { issues: [stripped.error ?? 'Nie umiem odczytać skryptu.'] };

  const full: ScriptApi = { ...defaultScriptApi(), ...api };

  const names = [...Object.keys(full), ...SHADOWED];
  const values = [...Object.values(full), ...SHADOWED.map(() => undefined)];

  try {
    // `model` deklarowane wewnątrz, żeby skrypt mógł je przypisać bez `return`,
    // i odczytane na końcu, gdy `return` nie padł.
    const body = `"use strict";\nlet model;\n${stripped.js}\n;return model;`;
    const factory = new Function(...names, body) as (...args: unknown[]) => unknown;
    const result = factory(...values);

    if (!result || typeof result !== 'object') {
      return {
        issues: ['Skrypt nie zwrócił modelu. Zakończ go `return defineModel({...})` albo przypisz do `model`.'],
        compiled: stripped.js,
      };
    }

    const model = result as PhenomenonModel;
    if (!Array.isArray(model.parameters) || typeof model.run !== 'function') {
      return { issues: ['Zwrócona wartość nie jest modelem — użyj `defineModel({...})`.'], compiled: stripped.js };
    }

    return { model, issues: model.issues ?? [], compiled: stripped.js };
  } catch (error) {
    return { issues: [`Błąd w skrypcie: ${(error as Error).message}`], compiled: stripped.js };
  }
}

export type { ManualModelSpec };
