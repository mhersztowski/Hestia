/**
 * constraint.ts — układ jako zbiór warunków, nie ciąg przypisań.
 *
 * Ta różnica jest sednem pakietu. W trzech pozostałych trybach coś wynika
 * z czegoś: pozycja z rodzica, rozmiar z nadwyżki, wartość z wyrażenia. Kierunek
 * jest z góry ustalony, więc obiekt „wyliczony" nie da się już przesunąć —
 * przesunięcie zostałoby nadpisane przy następnym przeliczeniu.
 *
 * Tutaj kierunku nie ma. „Te dwa lewe boki równo" nie mówi, który ma ustąpić;
 * mówi tylko, co ma być prawdą. Dlatego przeciąganie dowolnego z nich działa
 * i dlatego można pytać, **ile swobody zostało** — pytanie bez sensu tam, gdzie
 * wszystko wynika z jednego źródła.
 *
 * Cena: układ równań zamiast wzoru, iteracja zamiast jednego przebiegu i realna
 * możliwość, że rozwiązania nie ma. Wszystkie trzy są tu widoczne.
 */
import { evalExpr } from '../expr/expr';
import type { Constraint, LayoutDoc, LayoutResult, ParamValue, Rect } from '../model/types';
import { resolveValues } from '../model/scope';
import { matrixRank, solveLinear } from './linalg';

/** Cztery zmienne na kształt — w tej kolejności siedzą w wektorze stanu. */
const POLA = ['x', 'y', 'w', 'h'] as const;

interface Reszta {
  /** Ile wynosi „błąd" tego więzu przy danym stanie; zero = spełniony. */
  wartosc: (v: number[]) => number;
  /** Do komunikatu, gdy się nie da. */
  wiez: Constraint;
}

function budujReszty(
  doc: LayoutDoc,
  indeks: Map<string, number>,
  start: number[],
  liczba: (v: ParamValue | undefined, dom: number) => number,
  issues: string[],
): Reszta[] {
  const reszty: Reszta[] = [];

  const poz = (id: string, pole: typeof POLA[number]) => {
    const baza = indeks.get(id);
    if (baza === undefined) return undefined;
    return baza + POLA.indexOf(pole);
  };

  for (const wiez of doc.constraints ?? []) {
    const brak = wiez.refs.find((r) => !indeks.has(r));
    if (brak) {
      issues.push(`Więz „${wiez.id}" wskazuje kształt „${brak}", którego nie ma.`);
      continue;
    }
    const [a, b] = wiez.refs;

    const para = (pole: typeof POLA[number], odjemnik = 0) => {
      const ia = poz(a, pole)!;
      const ib = poz(b, pole)!;
      reszty.push({ wiez, wartosc: (v) => v[ib] - v[ia] - odjemnik });
    };

    switch (wiez.type) {
      case 'fixed':
        // Jedyny więz jednoargumentowy: przypina kształt tam, gdzie go zapisano.
        // Bez niego układ pływa — równania mówią o różnicach, więc przesunięcie
        // wszystkiego o ten sam wektor też jest rozwiązaniem.
        for (const pole of POLA) {
          const i = poz(a, pole)!;
          const cel = start[i];
          reszty.push({ wiez, wartosc: (v) => v[i] - cel });
        }
        break;

      case 'coincidentX': case 'alignLeft': para('x'); break;
      case 'coincidentY': case 'alignTop': para('y'); break;
      case 'sameWidth': para('w'); break;
      case 'sameHeight': para('h'); break;
      case 'distanceX': para('x', liczba(wiez.value, 0)); break;
      case 'distanceY': para('y', liczba(wiez.value, 0)); break;

      case 'alignCenterX': {
        const [xa, wa, xb, wb] = [poz(a, 'x')!, poz(a, 'w')!, poz(b, 'x')!, poz(b, 'w')!];
        reszty.push({ wiez, wartosc: (v) => (v[xb] + v[wb] / 2) - (v[xa] + v[wa] / 2) });
        break;
      }
      case 'alignCenterY': {
        const [ya, ha, yb, hb] = [poz(a, 'y')!, poz(a, 'h')!, poz(b, 'y')!, poz(b, 'h')!];
        reszty.push({ wiez, wartosc: (v) => (v[yb] + v[hb] / 2) - (v[ya] + v[ha] / 2) });
        break;
      }
    }
  }

  return reszty;
}

/**
 * Jakobian liczony różnicami skończonymi.
 *
 * Dla obecnych więzów, wszystkich liniowych, można by go wypisać wprost i byłby
 * dokładny. Zostaje numeryczny, bo pierwszy nieliniowy więz — odległość
 * euklidesowa, kąt, styczność — wchodzi wtedy jako jedna funkcja reszty, bez
 * dopisywania pochodnych. Koszt: jedno dodatkowe przeliczenie na zmienną.
 */
function jakobian(reszty: Reszta[], v: number[]): number[][] {
  const J: number[][] = reszty.map(() => new Array<number>(v.length).fill(0));
  const bazowe = reszty.map((r) => r.wartosc(v));

  for (let j = 0; j < v.length; j++) {
    const krok = Math.max(1e-6, Math.abs(v[j]) * 1e-7);
    const zaburzone = [...v];
    zaburzone[j] += krok;
    for (let i = 0; i < reszty.length; i++) {
      J[i][j] = (reszty[i].wartosc(zaburzone) - bazowe[i]) / krok;
    }
  }
  return J;
}

const norma = (r: number[]) => Math.sqrt(r.reduce((s, x) => s + x * x, 0));

export interface ConstraintOptions {
  /**
   * Kształt trzymany kursorem i miejsce, w które go ciągniemy.
   *
   * Nie jest więzem: daje solverowi **punkt wyjścia**, a nie warunek. Wszystko,
   * co zapisane w dokumencie, ma nad nim pierwszeństwo.
   */
  drag?: { id: string; x: number; y: number };
}

export function solveConstraint(doc: LayoutDoc, opcje: ConstraintOptions = {}): LayoutResult {
  const { values, issues } = resolveValues(doc);

  const indeks = new Map<string, number>();
  const stan: number[] = [];
  for (const shape of doc.shapes) {
    indeks.set(shape.id, stan.length);
    for (const pole of POLA) stan.push(values[shape.id][pole]);
  }

  const zakres: Record<string, number> = { ...doc.vars };
  for (const shape of doc.shapes) {
    for (const pole of POLA) zakres[`${shape.id}.${pole}`] = values[shape.id][pole];
  }
  const liczba = (v: ParamValue | undefined, dom: number): number => {
    if (!v) return dom;
    if (v.src === 'literal') return v.value;
    try {
      const wynik = v.src === 'ref' ? zakres[v.name] : evalExpr(v.code, zakres);
      if (typeof wynik !== 'number' || Number.isNaN(wynik)) throw new Error('nie jest liczbą');
      return wynik;
    } catch (błąd) {
      issues.push(`Wartość więzu „${v.src === 'ref' ? v.name : v.code}": ${(błąd as Error).message}`);
      return dom;
    }
  };

  // `start` to stan **z dokumentu** — po nim sięga `fixed`. Punkt wyjścia
  // iteracji może być inny, gdy ktoś trzyma kształt myszą.
  const start = [...stan];
  const reszty = budujReszty(doc, indeks, start, liczba, issues);

  const chwytany = opcje.drag ? indeks.get(opcje.drag.id) : undefined;
  if (opcje.drag && chwytany === undefined) {
    issues.push(`Nie ma kształtu „${opcje.drag.id}", więc nie ma czego przeciągać.`);
  }
  if (opcje.drag && chwytany !== undefined) {
    stan[chwytany] = opcje.drag.x;
    stan[chwytany + 1] = opcje.drag.y;
  }

  const rects = (v: number[]): Record<string, Rect> => {
    const out: Record<string, Rect> = {};
    for (const shape of doc.shapes) {
      const i = indeks.get(shape.id)!;
      out[shape.id] = { x: v[i], y: v[i + 1], w: v[i + 2], h: v[i + 3] };
    }
    return out;
  };

  if (!reszty.length) {
    return { rects: rects(stan), issues, dof: stan.length };
  }

  // Gauss-Newton z tłumieniem. Tłumienie robi dwie rzeczy naraz: ratuje układ
  // niedookreślony (macierz normalna jest wtedy osobliwa) i wybiera spośród
  // wielu rozwiązań to najbliższe obecnemu — czyli takie, w którym rysunek
  // najmniej podskoczy. Przy przeciąganiu myszą to nie jest drobiazg.
  let v = [...stan];
  let lambda = 1e-6;
  let ostatniaNorma = norma(reszty.map((r) => r.wartosc(v)));

  for (let iter = 0; iter < 60 && ostatniaNorma > 1e-9; iter++) {
    const J = jakobian(reszty, v);
    const r = reszty.map((x) => x.wartosc(v));
    const n = v.length;

    const JtJ: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const Jtr = new Array<number>(n).fill(0);
    for (let i = 0; i < J.length; i++) {
      for (let a = 0; a < n; a++) {
        Jtr[a] += J[i][a] * r[i];
        for (let b = a; b < n; b++) JtJ[a][b] += J[i][a] * J[i][b];
      }
    }
    for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];
    for (let a = 0; a < n; a++) JtJ[a][a] += lambda;

    const krok = solveLinear(JtJ, Jtr.map((x) => -x));
    if (!krok) break;

    const kandydat = v.map((x, i) => x + krok[i]);
    const nowaNorma = norma(reszty.map((x) => x.wartosc(kandydat)));

    if (nowaNorma < ostatniaNorma) {
      v = kandydat;
      ostatniaNorma = nowaNorma;
      lambda = Math.max(1e-9, lambda / 3);
    } else {
      lambda *= 8;
      if (lambda > 1e12) break;
    }
  }

  if (ostatniaNorma > 1e-4) {
    // Nazwy winnych, a nie samo „nie da się". Przy sprzeczności zawsze winna
    // jest **para** więzów, więc wskazanie jednego byłoby zgadywaniem.
    const winne = [...new Set(reszty
      .filter((x) => Math.abs(x.wartosc(v)) > 1e-4)
      .map((x) => x.wiez.id))];
    issues.push(`Nie udało się spełnić wszystkich więzów — sprzeczne są: ${winne.join(', ')}. `
      + `Rozbieżność wynosi ${ostatniaNorma.toFixed(2)}.`);
  }

  const dof = v.length - matrixRank(jakobian(reszty, v));

  return { rects: rects(v), issues, dof };
}
