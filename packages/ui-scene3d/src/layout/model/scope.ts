/**
 * scope.ts — co widzi wyrażenie i w jakiej kolejności się to liczy.
 *
 * Wyrażenie w tym modelu może sięgnąć po trzy rzeczy:
 *
 *  • **parametr dokumentu** — `margines`, `kolumna`;
 *  • **wielkość innego obiektu** — `panel.w`, `naglowek.y`;
 *  • **wielkość rodzica** — `parent.w`, a dla obiektu najwyższego poziomu jest
 *    nim obszar rysunku.
 *
 * Druga i trzecia możliwość są tu od początku świadomie: to jest **format
 * zapisu**, a nie funkcja. Dołożenie ich później oznaczałoby migrację
 * wszystkich zapisanych dokumentów i wszystkich miejsc, które je czytają.
 * Kotwice w stylu Godota są zresztą dokładnie tym: wyrażeniem sięgającym po
 * wymiar rodzica.
 *
 * Kolejność liczenia bierze się z **zależności**, nie z kolejności zapisu —
 * obiekt może odwoływać się do zapisanego niżej. Cykl zgłaszamy zamiast
 * zapętlać się; wartości i tak zwracamy komplet, żeby rysunek się pokazał.
 */
import { evalExpr, exprDeps } from '../expr/expr';
import type { LayoutDoc, ParamValue, Shape } from './types';

/** Cztery wielkości opisujące położenie kształtu. */
export interface ShapeValues {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolveResult {
  values: Record<string, ShapeValues>;
  issues: string[];
}

const POLA = ['x', 'y', 'w', 'h'] as const;
type Pole = typeof POLA[number];

/** Nazwa zmiennej w grafie zależności: `kształt.pole`. */
const klucz = (id: string, pole: Pole) => `${id}.${pole}`;

/**
 * Od jakich nazw zależy wartość.
 *
 * `parent.w` tłumaczymy na konkretny kształt już tutaj, bo graf zależności musi
 * operować na nazwach rzeczywistych — inaczej dwa różne obiekty o różnych
 * rodzicach dzieliłyby jeden węzeł.
 */
function zaleznosci(value: ParamValue, shape: Shape): string[] {
  const nazwy = value.src === 'expr' ? exprDeps(value.code)
    : value.src === 'ref' ? [value.name]
      : [];

  return nazwy.map((n) => (n.startsWith('parent.') && shape.parent
    ? `${shape.parent}.${n.slice('parent.'.length)}`
    : n));
}

export function resolveValues(doc: LayoutDoc): ResolveResult {
  const issues: string[] = [];
  const byId = new Map(doc.shapes.map((s) => [s.id, s]));

  /** Wartości gotowe — parametry dokumentu plus policzone wielkości kształtów. */
  const scope: Record<string, number> = { ...doc.vars };

  // Obszar rysunku jest rodzicem obiektów najwyższego poziomu. Nazwa `viewport`
  // jest też dostępna wprost, gdy ktoś chce odwołać się do niej z głębi drzewa.
  scope['viewport.x'] = 0;
  scope['viewport.y'] = 0;
  scope['viewport.w'] = doc.viewport.width;
  scope['viewport.h'] = doc.viewport.height;

  /** Wszystkie wielkości do policzenia i ich zależności. */
  const zadania = new Map<string, { shape: Shape; pole: Pole; deps: string[] }>();
  for (const shape of doc.shapes) {
    for (const pole of POLA) {
      zadania.set(klucz(shape.id, pole), {
        shape, pole, deps: zaleznosci(shape[pole], shape),
      });
    }
  }

  /** Zakres widziany przez konkretny kształt — z podstawionym `parent`. */
  const zakresDla = (shape: Shape): Record<string, number> => {
    const rodzic = shape.parent ? byId.get(shape.parent) : undefined;
    const przedrostek = rodzic ? rodzic.id : 'viewport';
    return {
      ...scope,
      'parent.x': scope[`${przedrostek}.x`] ?? 0,
      'parent.y': scope[`${przedrostek}.y`] ?? 0,
      'parent.w': scope[`${przedrostek}.w`] ?? doc.viewport.width,
      'parent.h': scope[`${przedrostek}.h`] ?? doc.viewport.height,
    };
  };

  const policz = (value: ParamValue, shape: Shape): number => {
    try {
      if (value.src === 'literal') return value.value;
      const zakres = zakresDla(shape);
      if (value.src === 'ref') {
        if (!(value.name in zakres)) {
          issues.push(`Kształt „${shape.id}" odwołuje się do nieznanej nazwy „${value.name}".`);
          return 0;
        }
        return zakres[value.name];
      }

      for (const nazwa of exprDeps(value.code)) {
        const pelna = nazwa.startsWith('parent.') ? nazwa : nazwa;
        if (!(pelna in zakres)) {
          issues.push(`Kształt „${shape.id}": wyrażenie „${value.code}" używa nieznanej nazwy „${nazwa}".`);
          return 0;
        }
      }

      const wynik = evalExpr(value.code, zakres);
      return typeof wynik === 'number' ? wynik : 0;
    } catch (błąd) {
      issues.push(`Kształt „${shape.id}": ${(błąd as Error).message}`);
      return 0;
    }
  };

  /**
   * Sortowanie topologiczne z wykrywaniem cyklu.
   *
   * Zamiast przerywać na cyklu, liczymy resztę i zgłaszamy uwagę: dokument
   * z jedną pomyłką ma się wyświetlić i pokazać, gdzie jest problem. Pusty
   * ekran nie mówi nic.
   */
  const stan = new Map<string, 'w toku' | 'gotowe'>();
  const cykle = new Set<string>();

  const rozwiaz = (k: string, sciezka: string[]): void => {
    if (stan.get(k) === 'gotowe') return;
    if (stan.get(k) === 'w toku') {
      const petla = [...sciezka.slice(sciezka.indexOf(k)), k].join(' → ');
      if (!cykle.has(petla)) {
        cykle.add(petla);
        issues.push(`Zapętlone odwołania: ${petla}. Wartości w tej pętli przyjęto jako zero.`);
      }
      return;
    }

    const zadanie = zadania.get(k);
    if (!zadanie) return;

    stan.set(k, 'w toku');
    for (const dep of zadanie.deps) {
      if (zadania.has(dep)) rozwiaz(dep, [...sciezka, k]);
    }

    scope[k] = policz(zadanie.shape[zadanie.pole], zadanie.shape);
    stan.set(k, 'gotowe');
  };

  for (const k of zadania.keys()) {
    if (!(k in scope)) scope[k] = 0; // wartość zastępcza na czas rozwiązywania cyklu
  }
  for (const k of zadania.keys()) rozwiaz(k, []);

  const values: Record<string, ShapeValues> = {};
  for (const shape of doc.shapes) {
    values[shape.id] = {
      x: scope[klucz(shape.id, 'x')] ?? 0,
      y: scope[klucz(shape.id, 'y')] ?? 0,
      w: scope[klucz(shape.id, 'w')] ?? 0,
      h: scope[klucz(shape.id, 'h')] ?? 0,
    };
  }

  return { values, issues };
}
