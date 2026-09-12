/**
 * shapes.ts — tłumaczenie kształtów Mermaida na kształty modelu i z powrotem.
 *
 * Trzymane osobno, bo z tej tabeli korzystają oba kierunki (parser i
 * serializer) oraz oba rodzaje diagramów. Kolejność wzorców ma znaczenie:
 * `[[` musi być sprawdzone przed `[`, inaczej podprogram zostanie prostokątem.
 */
import type { NodeShape } from '../../model/diagram';

export interface ShapeSyntax {
  open: string;
  close: string;
  shape: NodeShape;
}

/**
 * Od najbardziej szczegółowego wzorca do najogólniejszego.
 *
 * Kolejność jest znacząca: `[/` musi być sprawdzone przed `[`, a warianty
 * ścięć (`[/…/]` kontra `[/…\\]`) różnią się dopiero domknięciem — dlatego
 * dopasowanie sprawdza OBIE strony.
 */
export const FLOWCHART_SHAPES: ShapeSyntax[] = [
  // `(((` przed `((` — inaczej podwójny okrąg zostanie zwykłym okręgiem, a
  // nadmiarowe nawiasy wsiąkną w etykietę.
  { open: '(((', close: ')))', shape: 'doubleCircle' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[\\', close: '\\]', shape: 'parallelogramAlt' },
  { open: '[/', close: '\\]', shape: 'trapezoid' },
  { open: '[\\', close: '/]', shape: 'trapezoidAlt' },
  { open: '>', close: ']', shape: 'asymmetric' },
  { open: '[', close: ']', shape: 'rectangle' },
  { open: '(', close: ')', shape: 'rounded' },
  { open: '{', close: '}', shape: 'rhombus' },
];

/** Składnia zapisu dla kształtu; prostokąt jest zapasem dla kształtów spoza flowchartu. */
export function syntaxForShape(shape: NodeShape): ShapeSyntax {
  return FLOWCHART_SHAPES.find((s) => s.shape === shape)
    ?? { open: '[', close: ']', shape: 'rectangle' };
}

/** Znaki, przy których etykietę trzeba ująć w cudzysłów. */
const NEEDS_QUOTES = /["[\]{}()<>|]/;

/** Etykieta w postaci gotowej do wstawienia między nawiasy kształtu. */
export function encodeLabel(label: string): string {
  if (!NEEDS_QUOTES.test(label)) return label;
  return `"${label.replace(/"/g, '#quot;')}"`;
}

/** Odwrotność `encodeLabel` — zdejmuje cudzysłowy i encje Mermaida. */
export function decodeLabel(raw: string): string {
  const text = raw.trim();
  const unquoted = /^"([\s\S]*)"$/.exec(text);
  return (unquoted ? unquoted[1] : text).replace(/#quot;/g, '"');
}
