/**
 * NodeShapeBackground — kształt węzła rysowany jako SVG pod jego treścią.
 *
 * Wcześniej kształty robił CSS (`clip-path`, `border-radius`), co wystarczało
 * dla prostokątów, ale nie dla figur z krzywymi: baza danych wychodziła zwykłym
 * pudełkiem, a okrąg spłaszczoną elipsą. SVG rysuje je wiernie i skaluje się z
 * węzłem, a `clip-path` nie obcina przy okazji tekstu.
 *
 * Kształty odpowiadają tabeli Mermaida — to on jest wzorcem, bo ten sam diagram
 * bywa oglądany raz w edytorze, raz w podglądzie.
 */
import type { NodeShape } from '../model/diagram';

export interface NodeShapeBackgroundProps {
  shape: NodeShape;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
}

/** Najmniejszy wymiar, przy którym figura z obrysem ma jeszcze dodatnie boki. */
const MIN_SIZE = 4;
/** Ścięcie boków w równoległobokach i trapezach (ułamek szerokości). */
const SLANT = 0.14;
/** Wysokość elipsy wieńczącej walec (ułamek wysokości). */
const CYLINDER_CAP = 0.16;

export function NodeShapeBackground({
  shape, width, height, fill, stroke, strokeWidth = 1.4,
}: NodeShapeBackgroundProps) {
  // Minimum, nie 1: React Flow podaje rozmiar dopiero po zmierzeniu węzła, więc
  // pierwszy render dostaje 0. Figury odejmują od wymiaru grubość obrysu, przez
  // co powstawały atrybuty `width="-1"` — przeglądarka je odrzuca i zgłasza
  // błąd, po jednym na każdy węzeł diagramu.
  const w = Math.max(width, MIN_SIZE);
  const h = Math.max(height, MIN_SIZE);
  const slant = w * SLANT;
  const common = { fill, stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' as const };

  const svg = (children: React.ReactNode) => (
    <svg
      width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden
    >
      {children}
    </svg>
  );

  switch (shape) {
    case 'rounded':
      return svg(<rect x={1} y={1} width={w - 2} height={h - 2} rx={10} {...common} />);
    case 'stadium':
      return svg(<rect x={1} y={1} width={w - 2} height={h - 2} rx={h / 2} {...common} />);
    case 'subroutine':
      return svg(<>
        <rect x={1} y={1} width={w - 2} height={h - 2} {...common} />
        <line x1={9} y1={1} x2={9} y2={h - 1} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={w - 9} y1={1} x2={w - 9} y2={h - 1} stroke={stroke} strokeWidth={strokeWidth} />
      </>);
    case 'cylinder': {
      const cap = h * CYLINDER_CAP;
      return svg(<>
        {/* Bok walca + dolne dno jednym konturem, górna elipsa osobno — tak
            rysuje bazę danych Mermaid i tak czyta się ją najszybciej. */}
        <path
          d={`M1,${cap} L1,${h - cap} A ${w / 2 - 1} ${cap} 0 0 0 ${w - 1},${h - cap} L${w - 1},${cap}`}
          {...common}
        />
        <ellipse cx={w / 2} cy={cap} rx={w / 2 - 1} ry={cap} {...common} />
      </>);
    }
    case 'circle':
      return svg(<circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 1} {...common} />);
    case 'doubleCircle':
      return svg(<>
        {/* Wewnętrzny okrąg nie może zejść poniżej zera przy małym węźle. */}
        <circle cx={w / 2} cy={h / 2} r={Math.max(Math.min(w, h) / 2 - 1, 1)} {...common} />
        <circle
          cx={w / 2} cy={h / 2} r={Math.max(Math.min(w, h) / 2 - 5, 0.5)}
          fill="none" stroke={stroke} strokeWidth={strokeWidth}
        />
      </>);
    case 'rhombus':
      return svg(<polygon points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`} {...common} />);
    case 'hexagon':
      return svg(<polygon points={`${slant},1 ${w - slant},1 ${w - 1},${h / 2} ${w - slant},${h - 1} ${slant},${h - 1} 1,${h / 2}`} {...common} />);
    case 'parallelogram':
      return svg(<polygon points={`${slant},1 ${w - 1},1 ${w - slant},${h - 1} 1,${h - 1}`} {...common} />);
    case 'parallelogramAlt':
      return svg(<polygon points={`1,1 ${w - slant},1 ${w - 1},${h - 1} ${slant},${h - 1}`} {...common} />);
    case 'trapezoid':
      return svg(<polygon points={`${slant},1 ${w - slant},1 ${w - 1},${h - 1} 1,${h - 1}`} {...common} />);
    case 'trapezoidAlt':
      return svg(<polygon points={`1,1 ${w - 1},1 ${w - slant},${h - 1} ${slant},${h - 1}`} {...common} />);
    case 'asymmetric':
      // Chorągiewka: lewy bok wcięty w „strzałkę".
      return svg(<path d={`M1,1 L${w - 1},1 L${w - 1},${h - 1} L1,${h - 1} L${slant + 6},${h / 2} Z`} {...common} />);
    case 'choice':
      return svg(<polygon points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`} {...common} fill="#fde68a" />);
    default:
      return svg(<rect x={1} y={1} width={w - 2} height={h - 2} rx={4} {...common} />);
  }
}
