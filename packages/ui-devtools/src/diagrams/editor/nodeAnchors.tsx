/**
 * nodeAnchors.tsx — punkty zaczepienia krawędzi na bokach węzła.
 *
 * Rozdzielone są tu dwie różne rzeczy, które React Flow trzyma pod jednym
 * pojęciem uchwytu:
 *
 *  • **kotwice rysunku** — komplet punktów na każdym boku, po których
 *    rozkładają się narysowane krawędzie. Jest ich dwadzieścia, więc muszą być
 *    niewidoczne i **niepodłączalne**: gdyby dało się w nie celować, każda
 *    encja tonęłaby w kropkach, a trafienie w konkretną byłoby loterią.
 *
 *  • **kropka do łączenia** — jedna, wyraźna, na dole węzła. Od niej ciągnie
 *    się nową relację i na nią upuszcza.
 *
 * Który punkt zostanie użyty do NARYSOWANIA krawędzi, decyduje
 * `assignEdgeAnchors` na podstawie geometrii — niezależnie od tego, skąd
 * użytkownik ją przeciągnął.
 */
import { Handle, Position } from '@xyflow/react';
import { ANCHORS_PER_SIDE, anchorOffset, type AnchorSide } from '../model/edgeAnchors';

const POSITIONS: Record<AnchorSide, Position> = {
  t: Position.Top,
  b: Position.Bottom,
  l: Position.Left,
  r: Position.Right,
};

/** Kotwica rysunku: niewidoczna i nieklikalna — służy tylko za punkt trasy. */
const ANCHOR = {
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  opacity: 0,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none',
} as const;

/** Kropka do łączenia — jedyna, w którą się celuje. */
const CONNECTOR = {
  width: 12,
  height: 12,
  background: '#fff',
  border: '2px solid #94a3b8',
} as const;

/** Identyfikator uchwytu, od którego zaczyna się nowa relacja. */
export const CONNECT_HANDLE = 'connect';

export function NodeAnchors() {
  return (
    <>
      {(Object.keys(POSITIONS) as AnchorSide[]).flatMap((side) =>
        Array.from({ length: ANCHORS_PER_SIDE }, (_, index) => {
          const offset = `${anchorOffset(index)}%`;
          const along = side === 't' || side === 'b' ? { left: offset } : { top: offset };
          return (
            <Handle
              key={`${side}${index}`}
              id={`${side}${index}`}
              type="source"
              position={POSITIONS[side]}
              isConnectable={false}
              style={{ ...ANCHOR, ...along }}
            />
          );
        }),
      )}

      <Handle
        id={CONNECT_HANDLE}
        type="source"
        position={Position.Bottom}
        style={CONNECTOR}
        title="Przeciągnij, aby połączyć"
      />
    </>
  );
}
