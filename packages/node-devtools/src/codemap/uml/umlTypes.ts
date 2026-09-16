/**
 * UML diagram types — the UML view of a codemap (see `../document.ts`).
 *
 * Nodes, members and edges keep the shape of MyCastle's UML editor
 * (`app/mycastle-web`), so a diagram moves between the two unchanged.
 */

export type UmlKind = 'class' | 'abstract' | 'interface' | 'enum' | 'struct' | 'module';
export type MemberKind = 'field' | 'method';
export type RelType =
  | 'association'
  | 'directed'
  | 'aggregation'
  | 'composition'
  | 'generalization'
  | 'realization'
  | 'dependency';

export interface UmlMember {
  id: string;
  kind: MemberKind;
  text: string;
  /** TSDoc documentation (description, `@param`, `@returns`, examples) — from the code or written by hand. */
  doc?: UmlDoc;
  /** A grouping tag (e.g. `async`, `optional`) — the dot colour and the filter in the editor. */
  category?: string;
}

/**
 * TSDoc documentation metadata attached to a diagram element. The shape matches
 * `DocMeta` from the code model, so that moving between code ⇄ UML is copying,
 * not translating.
 */
export interface UmlDoc {
  summary?: string;
  remarks?: string;
  /** Argument descriptions by name. */
  params?: Record<string, string>;
  returns?: string;
  examples?: string[];
  deprecated?: string;
  see?: string[];
  tags?: string[];
}

// `UmlNodeData` and `UmlEdgeData` are type aliases, not interfaces, on purpose:
// React Flow requires node/edge data to satisfy `Record<string, unknown>`, and
// only a type alias gets the implicit index signature that makes it do so. As
// interfaces, every editor would need a cast at the boundary.
export type UmlNodeData = {
  kind: UmlKind;
  name: string;
  members: UmlMember[];
  linkedFile?: string;
  /** TSDoc documentation of the class/interface/module. */
  doc?: UmlDoc;
};

export interface UmlNode {
  id: string;
  type: 'umlClass';
  position: { x: number; y: number };
  data: UmlNodeData;
}

export type UmlEdgeData = { relType: RelType; label?: string };

export interface UmlEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: 'uml';
  data: UmlEdgeData;
}

export interface UmlDiagram {
  id: string;
  name: string;
  nodes: UmlNode[];
  edges: UmlEdge[];
}
