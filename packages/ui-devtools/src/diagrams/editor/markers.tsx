/**
 * markers.tsx — zakończenia krawędzi.
 *
 * Model rozróżnia cztery zakończenia (`-->`, `---`, `--o`, `--x`), a React Flow
 * ma gotowy tylko grot strzałki. Kółko i krzyżyk definiujemy sami: to zwykłe
 * markery SVG, do których krawędź odwołuje się przez `url(#id)`.
 *
 * Definicje muszą istnieć w DOM-ie zanim krawędź się narysuje, więc renderujemy
 * je raz, w ukrytym `<svg>` obok płótna.
 */
import type { EdgeArrowType, ErCardinality } from '../model/diagram';

export const MARKER_COLOR = '#64748b';

const CIRCLE_ID = 'diagram-marker-circle';
const CROSS_ID = 'diagram-marker-cross';
// Zakończenia UML: pusty trójkąt to dziedziczenie, romb wypełniony kompozycja,
// romb pusty agregacja. Wypełnienie tłem (nie `none`) zasłania koniec linii —
// inaczej kreska przechodzi przez środek figury.
const TRIANGLE_ID = 'diagram-marker-triangle';
const DIAMOND_ID = 'diagram-marker-diamond';
const DIAMOND_FILLED_ID = 'diagram-marker-diamond-filled';
/**
 * Liczebności ER w notacji „crow's foot".
 *
 * Kreska to „jeden", kółko „zero", rozwidlenie „wiele". Każda kombinacja ma
 * własny marker, bo rysunek składa się z dwóch znaków naraz (np. „zero lub
 * wiele" to kółko przed rozwidleniem).
 */
const ER_MARKERS: Record<ErCardinality, string> = {
  zeroOrOne: 'er-zero-one',
  exactlyOne: 'er-one',
  zeroOrMore: 'er-zero-many',
  oneOrMore: 'er-one-many',
};

/**
 * Identyfikator markera dla danego zakończenia; `undefined` = linia bez grotu.
 *
 * Zwracamy SAMO id, bez `url(#…)`: React Flow dokleja opakowanie samo, więc
 * gotowe odwołanie dawało `url('#url(#…)')` — składniowo bezsensowne, przez co
 * kółka i krzyżyki nie rysowały się w ogóle.
 */
export function markerFor(arrow: EdgeArrowType): string | undefined {
  if (arrow === 'circle') return CIRCLE_ID;
  if (arrow === 'cross') return CROSS_ID;
  if (arrow === 'triangle') return TRIANGLE_ID;
  if (arrow === 'diamond') return DIAMOND_ID;
  if (arrow === 'diamondFilled') return DIAMOND_FILLED_ID;
  return undefined;
}

/** Odwołanie do markera liczebności ER. */
export function erMarkerFor(cardinality: ErCardinality): string {
  return ER_MARKERS[cardinality];
}

/** Wspólne definicje markerów — jeden komplet na edytor. */
export function DiagramMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        <marker
          id={CIRCLE_ID}
          viewBox="0 0 12 12" refX="10" refY="6"
          markerWidth="9" markerHeight="9" orient="auto-start-reverse"
        >
          {/* Mermaid rysuje kółko wypełnione kolorem linii, nie obwódkę. */}
          <circle cx="6" cy="6" r="4" fill={MARKER_COLOR} />
        </marker>
        <marker
          id={CROSS_ID}
          viewBox="0 0 12 12" refX="10" refY="6"
          markerWidth="9" markerHeight="9" orient="auto-start-reverse"
        >
          <path d="M3 3 L9 9 M9 3 L3 9" stroke={MARKER_COLOR} strokeWidth="1.8" fill="none" />
        </marker>
        <marker
          id={TRIANGLE_ID}
          viewBox="0 0 14 12" refX="13" refY="6"
          markerWidth="12" markerHeight="12" orient="auto-start-reverse"
        >
          <path d="M1 1 L13 6 L1 11 Z" fill="#f8fafc" stroke={MARKER_COLOR} strokeWidth="1.4" />
        </marker>
        <marker
          id={DIAMOND_ID}
          viewBox="0 0 18 12" refX="17" refY="6"
          markerWidth="14" markerHeight="12" orient="auto-start-reverse"
        >
          <path d="M1 6 L9 1 L17 6 L9 11 Z" fill="#f8fafc" stroke={MARKER_COLOR} strokeWidth="1.4" />
        </marker>
        <marker
          id={DIAMOND_FILLED_ID}
          viewBox="0 0 18 12" refX="17" refY="6"
          markerWidth="14" markerHeight="12" orient="auto-start-reverse"
        >
          <path d="M1 6 L9 1 L17 6 L9 11 Z" fill={MARKER_COLOR} stroke={MARKER_COLOR} strokeWidth="1.4" />
        </marker>
        {/* Liczebności ER. `refX` na prawej krawędzi, bo marker kończy linię;
            `orient="auto-start-reverse"` obraca go po stronie źródła. */}
        {/* Liczebności rysujemy większe i na jasnym tle: symbol leży na linii
            i między krzyżującymi się relacjami ginął — trzeba było przybliżać,
            żeby odróżnić „jeden" od „zero lub jeden". */}
        <marker id={ER_MARKERS.exactlyOne} viewBox="0 0 26 24" refX="25" refY="12"
          markerWidth="24" markerHeight="22" orient="auto-start-reverse">
          <rect x="10" y="1" width="15" height="22" rx="2" fill="#f8fafc" opacity="0.92" />
          <path d="M15 4 v16" stroke={MARKER_COLOR} strokeWidth="2.2" fill="none" />
        </marker>
        <marker id={ER_MARKERS.zeroOrOne} viewBox="0 0 26 24" refX="25" refY="12"
          markerWidth="24" markerHeight="22" orient="auto-start-reverse">
          <rect x="1" y="1" width="24" height="22" rx="2" fill="#f8fafc" opacity="0.92" />
          <path d="M19 4 v16" stroke={MARKER_COLOR} strokeWidth="2.2" fill="none" />
          <circle cx="9" cy="12" r="5" fill="#fff" stroke={MARKER_COLOR} strokeWidth="1.8" />
        </marker>
        <marker id={ER_MARKERS.oneOrMore} viewBox="0 0 26 24" refX="25" refY="12"
          markerWidth="24" markerHeight="22" orient="auto-start-reverse">
          <rect x="5" y="1" width="20" height="22" rx="2" fill="#f8fafc" opacity="0.92" />
          <path d="M10 4 v16" stroke={MARKER_COLOR} strokeWidth="2.2" fill="none" />
          <path d="M25 12 L14 4 M25 12 L14 20 M25 12 L14 12" stroke={MARKER_COLOR} strokeWidth="1.8" fill="none" />
        </marker>
        <marker id={ER_MARKERS.zeroOrMore} viewBox="0 0 30 24" refX="29" refY="12"
          markerWidth="27" markerHeight="22" orient="auto-start-reverse">
          <rect x="1" y="1" width="28" height="22" rx="2" fill="#f8fafc" opacity="0.92" />
          <circle cx="7" cy="12" r="5" fill="#fff" stroke={MARKER_COLOR} strokeWidth="1.8" />
          <path d="M29 12 L17 4 M29 12 L17 20 M29 12 L17 12" stroke={MARKER_COLOR} strokeWidth="1.8" fill="none" />
        </marker>
      </defs>
    </svg>
  );
}
