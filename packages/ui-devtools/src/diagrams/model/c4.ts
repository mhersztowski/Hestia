/**
 * c4.ts — pojęcia modelu C4.
 *
 * C4 jest grafem z granicami, więc nie dostaje własnej struktury: korzysta z
 * węzłów, krawędzi i grup, które model już ma. Nowe jest tylko **znaczenie**
 * elementu — czy to człowiek, system, kontener czy komponent, czy leży poza
 * granicą naszej odpowiedzialności i czym jest zbudowany.
 *
 * Nazwa wywołania w Mermaidzie (`SystemDb_Ext`) skleja trzy niezależne rzeczy:
 * rodzaj, wariant (zwykły / baza / kolejka) i to, czy element jest zewnętrzny.
 * Trzymamy je osobno, bo edytor przełącza je niezależnie — a sklejanie z
 * powrotem to jedna funkcja przy zapisie.
 */

/** Rodzaj elementu — poziom abstrakcji, na którym się go opisuje. */
export type C4ElementKind = 'person' | 'system' | 'container' | 'component' | 'node';

/** Wariant elementu: zwykły, baza danych albo kolejka. */
export type C4Variant = 'plain' | 'db' | 'queue';

export const C4_ELEMENT_KINDS: readonly C4ElementKind[] = ['person', 'system', 'container', 'component', 'node'];
export const C4_VARIANTS: readonly C4Variant[] = ['plain', 'db', 'queue'];

export interface C4NodeInfo {
  kind: C4ElementKind;
  variant: C4Variant;
  /** Poza granicą naszej odpowiedzialności — Mermaid rysuje takie szarzej. */
  external: boolean;
  /** Czym jest zbudowany: „Java, Spring Boot". Osoba i system tego nie mają. */
  technology?: string;
  description?: string;
  /**
   * Przyrostek położenia z diagramu wdrożenia (`Node_L`, `Node_R`).
   *
   * Nie ma odpowiednika w pozostałych rodzajach, więc zostaje jako podpowiedź
   * układu, a nie cecha elementu.
   */
  placement?: 'left' | 'right';
}

/** Rodzaj granicy — od tego zależy podpis i obramowanie. */
export type C4BoundaryKind = 'generic' | 'enterprise' | 'system' | 'container' | 'node';

export const C4_BOUNDARY_KINDS: readonly C4BoundaryKind[] = ['generic', 'enterprise', 'system', 'container', 'node'];

export interface C4BoundaryInfo {
  kind: C4BoundaryKind;
  /** Trzeci argument `Boundary(alias, label, type)` — dowolny tekst. */
  boundaryType?: string;
  /** Element wdrożenia (`Node`) bywa granicą — trzyma wtedy własny opis. */
  technology?: string;
  description?: string;
  placement?: 'left' | 'right';
}

export interface C4RelInfo {
  /** Czym zrealizowana: „HTTPS", „JDBC". */
  technology?: string;
  bidirectional?: boolean;
  /**
   * Dosłowny przyrostek wywołania (`U`, `Up`, `Back`, `D`…).
   *
   * Mermaid ma po dwie nazwy na kierunek (`Rel_U` i `Rel_Up`) i obie znaczą to
   * samo. Zapamiętujemy tę, która przyszła — inaczej zapis zmieniałby cudzy
   * dokument bez powodu.
   */
  suffix?: string;
}

/** Rodzaj diagramu C4 — nagłówek dokumentu. */
export type C4Variant4 = 'C4Context' | 'C4Container' | 'C4Component' | 'C4Dynamic' | 'C4Deployment';

export const C4_DIAGRAM_KINDS: readonly C4Variant4[] = [
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
];

/** Czy dla tego rodzaju trzeci argument wywołania niesie technologię. */
export function hasTechnology(kind: C4ElementKind): boolean {
  // Osoba i system opisują *co*, a nie *czym* — Mermaid nie daje im tego pola.
  return kind === 'container' || kind === 'component' || kind === 'node';
}

/** Nazwa wywołania Mermaida dla elementu, np. `SystemDb_Ext`. */
export function c4CallName(info: C4NodeInfo): string {
  const base = info.kind === 'person' ? 'Person'
    : info.kind === 'system' ? 'System'
    : info.kind === 'container' ? 'Container'
    : info.kind === 'component' ? 'Component'
    : 'Node';
  // Osoba nie ma wariantu bazy ani kolejki — Mermaid nie zna `PersonDb`.
  const variant = info.kind === 'person' || info.kind === 'node' ? ''
    : info.variant === 'db' ? 'Db'
    : info.variant === 'queue' ? 'Queue'
    : '';
  const placement = info.kind === 'node' && info.placement
    ? (info.placement === 'left' ? '_L' : '_R')
    : '';
  return `${base}${variant}${placement}${info.external ? '_Ext' : ''}`;
}

/** Nazwa wywołania dla granicy. */
export function c4BoundaryCallName(info: C4BoundaryInfo): string {
  switch (info.kind) {
    case 'enterprise': return 'Enterprise_Boundary';
    case 'system': return 'System_Boundary';
    case 'container': return 'Container_Boundary';
    case 'node': return info.placement === 'left' ? 'Node_L' : info.placement === 'right' ? 'Node_R' : 'Node';
    default: return 'Boundary';
  }
}

/** Ludzka nazwa rodzaju — do podpisu w edytorze. */
export const C4_KIND_LABEL: Record<C4ElementKind, string> = {
  person: 'osoba',
  system: 'system',
  container: 'kontener',
  component: 'komponent',
  node: 'węzeł wdrożenia',
};
