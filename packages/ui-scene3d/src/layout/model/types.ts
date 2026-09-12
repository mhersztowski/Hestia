/**
 * types.ts — wspólny model layoutu.
 *
 * Jeden model danych, wiele sposobów wyliczania pozycji. Kształt jest zawsze
 * prostokątem (albo punktem o zerowych wymiarach), bo to jest część wspólna
 * wszystkich zastosowań: kontrolki interfejsu, ramki składu, obiekty sceny
 * i wierzchołki szkicu dają się tak opisać.
 *
 * Czego **nie** ma w modelu: sposobu rozwiązywania. Ten sam dokument da się
 * ułożyć kotwicami albo więzami, więc silnik jest wyborem, a nie własnością
 * danych.
 */

/** Wartość: liczba wprost, odwołanie do nazwy albo wyrażenie. */
export type ParamValue =
  | { src: 'literal'; value: number }
  | { src: 'ref'; name: string }
  | { src: 'expr'; code: string };

/** Skrót do zapisu literału — w dokumentach ręcznych bywa ich najwięcej. */
export const lit = (value: number): ParamValue => ({ src: 'literal', value });
export const ref = (name: string): ParamValue => ({ src: 'ref', name });
export const expr = (code: string): ParamValue => ({ src: 'expr', code });

/**
 * Kotwice w stylu Godota i Unity.
 *
 * `min`/`max` są ułamkami wymiaru rodzica (0 = lewa krawędź, 1 = prawa),
 * `offset` to piksele dokładane po przeliczeniu ułamka. Gdy `min === max`,
 * obiekt ma stały rozmiar i jest przypięty do jednego punktu; gdy się różnią —
 * rozciąga się razem z rodzicem.
 */
export interface Anchor {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  offsetLeft: number;
  offsetTop: number;
  offsetRight: number;
  offsetBottom: number;
}

/** Udział w układzie przepływowym (wiersz albo kolumna). */
export interface FlowItem {
  /** Ile z pozostałej przestrzeni przypada temu obiektowi; 0 = rozmiar własny. */
  grow?: number;
  /** Rozmiar bazowy przed rozdzieleniem nadwyżki. */
  basis?: number;
}

/** Ustawienia kontenera przepływowego. */
export interface FlowContainer {
  direction: 'row' | 'column';
  gap?: number;
  padding?: number;
  /** Wyrównanie w poprzek kierunku układania. */
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface Shape {
  id: string;
  /** Rodzic w drzewie; brak = obiekt najwyższego poziomu. */
  parent?: string;
  x: ParamValue;
  y: ParamValue;
  w: ParamValue;
  h: ParamValue;
  anchor?: Anchor;
  flow?: FlowItem;
  /** Gdy ustawione, dzieci tego kształtu układa przepływ. */
  container?: FlowContainer;
  label?: string;
  /**
   * Cokolwiek, czego potrzebuje program korzystający z pakietu — rodzaj widżetu,
   * barwa, tekst na przycisku.
   *
   * Pakiet **nie zagląda** do środka. Bez tego pola każdy host musiałby trzymać
   * własną mapę „identyfikator → mój obiekt" i pilnować jej zgodności przy
   * każdym dodaniu i usunięciu kształtu; to jest dokładnie ten rodzaj
   * dwustronnej księgowości, który się rozjeżdża.
   */
  data?: Record<string, unknown>;
}

/** Rodzaje więzów — podzbiór tego, co ma szkic CAD, w wersji prostokątnej. */
export type ConstraintType =
  | 'coincidentX' | 'coincidentY'
  | 'sameWidth' | 'sameHeight'
  | 'distanceX' | 'distanceY'
  | 'alignLeft' | 'alignTop' | 'alignCenterX' | 'alignCenterY'
  | 'fixed';

export interface Constraint {
  id: string;
  type: ConstraintType;
  /** Identyfikatory kształtów, których dotyczy. */
  refs: string[];
  /** Wartość dla więzów wymiarowych — może być wyrażeniem. */
  value?: ParamValue;
}

/** Który silnik ma wyliczyć pozycje. */
export type LayoutMode = 'static' | 'anchor' | 'flow' | 'constraint';

export interface LayoutDoc {
  /** Parametry dokumentu — nazwy widoczne w wyrażeniach. */
  vars: Record<string, number>;
  shapes: Shape[];
  constraints?: Constraint[];
  mode: LayoutMode;
  /** Obszar, w którym układamy — rodzic obiektów najwyższego poziomu. */
  viewport: { width: number; height: number };
}

/** Wyliczone położenie. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  rects: Record<string, Rect>;
  issues: string[];
  /**
   * Ile swobody zostało — tylko dla trybu więzów.
   *
   * W pozostałych trybach pozycja wynika jednoznacznie z danych, więc pytanie
   * o stopnie swobody nie ma sensu.
   */
  dof?: number;
}
