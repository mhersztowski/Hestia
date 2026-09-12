/**
 * Kształt węzła rysowany przed pierwszym pomiarem.
 *
 * React Flow podaje wymiary węzła dopiero po zmierzeniu go w DOM — pierwszy
 * render dostaje 0. Kształty odejmują od wymiaru grubość obrysu, więc z zera
 * robiło się `width="-1"`, a przeglądarka odrzucała atrybut i sypała błędami do
 * konsoli (kilkadziesiąt na jeden diagram).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeShapeBackground } from './NodeShapeBackground';
import type { NodeShape } from '../model/diagram';

const SHAPES: NodeShape[] = [
  'rectangle', 'rounded', 'stadium', 'subroutine', 'cylinder', 'circle', 'doubleCircle',
  'rhombus', 'hexagon', 'parallelogram', 'parallelogramAlt', 'trapezoid', 'trapezoidAlt',
  'asymmetric',
];

const markup = (shape: NodeShape, width: number, height: number) =>
  renderToStaticMarkup(
    <NodeShapeBackground shape={shape} width={width} height={height} fill="#fff" stroke="#000" />,
  );

/** Ujemne wartości w atrybutach rozmiaru i promienia — te przeglądarka odrzuca. */
function negativeAttributes(svg: string): string[] {
  return [...svg.matchAll(/\b(width|height|rx|ry|r)="(-[\d.]+)"/g)].map((m) => `${m[1]}=${m[2]}`);
}

describe('kształt przed pierwszym pomiarem węzła', () => {
  it.each(SHAPES)('%s przy rozmiarze 0 nie tworzy ujemnych wymiarów', (shape) => {
    expect(negativeAttributes(markup(shape, 0, 0))).toEqual([]);
  });

  it.each(SHAPES)('%s przy rozmiarze 1 nie tworzy ujemnych wymiarów', (shape) => {
    expect(negativeAttributes(markup(shape, 1, 1))).toEqual([]);
  });

  it('normalny rozmiar nadal rysuje figurę w podanych granicach', () => {
    const svg = markup('rectangle', 150, 60);
    expect(svg).toContain('viewBox="0 0 150 60"');
    expect(negativeAttributes(svg)).toEqual([]);
  });
});
