export type GeoNodeType =
  | 'box' | 'sphere' | 'cylinder' | 'plane' | 'cone' | 'torus'
  | 'transform' | 'merge'
  | 'output';

export interface GeoNodeDef {
  id: string;
  type: GeoNodeType;
  x: number;
  y: number;
  params: Record<string, number>;
}

export interface GeoEdgeDef {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GeoNodeGraph {
  nodes: GeoNodeDef[];
  edges: GeoEdgeDef[];
}

export const DEFAULT_GEO_NODE_GRAPH: GeoNodeGraph = {
  nodes: [
    { id: 'n1', type: 'box', x: 80, y: 100, params: { width: 1, height: 1, depth: 1, wSeg: 1, hSeg: 1, dSeg: 1 } },
    { id: 'out', type: 'output', x: 400, y: 100, params: {} },
  ],
  edges: [
    { id: 'e1', source: 'n1', sourceHandle: 'geo-out', target: 'out', targetHandle: 'geo-in' },
  ],
};
