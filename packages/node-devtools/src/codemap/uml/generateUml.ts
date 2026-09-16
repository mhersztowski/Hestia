import { CodeModel, CodeSymbol, RelationType } from '../model/CodeModel.js';
import { diagramId, edgeId, nodeId, umlMemberId } from '../model/ids.js';
import { handlesFor, layoutSymbols, XY } from './layout.js';
import { RelType, UmlDiagram, UmlEdge, UmlKind, UmlNode } from './umlTypes.js';

function kindToUml(s: CodeSymbol): UmlKind {
  if (s.kind === 'interface') return 'interface';
  if (s.kind === 'enum') return 'enum';
  if (s.kind === 'module') return 'module';
  if (s.kind === 'struct') return 'struct';
  if (s.kind === 'class' && s.isAbstract) return 'abstract';
  return 'class';
}
const relToUml = (t: RelationType): RelType => t; // names align with the editor

export interface GenerateOptions {
  /** Reuse positions for nodes that already exist (keeps manual layout). */
  positions?: Map<string, XY>;
  diagramName?: string;
}

/** Build a single UML diagram from a parsed model. */
export function modelToDiagram(model: CodeModel, opts: GenerateOptions = {}): UmlDiagram {
  const auto = layoutSymbols(model.symbols, model.relations);
  const posOf = (symId: string): XY =>
    opts.positions?.get(nodeId(symId)) ?? auto.get(symId) ?? { x: 0, y: 0 };

  const nodes: UmlNode[] = model.symbols.map((s) => ({
    id: nodeId(s.id),
    type: 'umlClass',
    position: posOf(s.id),
    data: {
      kind: kindToUml(s),
      name: s.name,
      // `category` feeds the coloured dot and the category filter in the UML
      // editor — that is what lets async methods be filtered out in one click.
      members: s.members.map((m) => ({
        id: umlMemberId(m.id),
        kind: m.kind,
        text: m.text,
        ...(m.isAsync ? { category: 'async' } : {}),
        // Documentation travels with the structure — after "From code" the TSDoc
        // descriptions are visible in the editor without opening the sources.
        ...(m.doc ? { doc: m.doc } : {}),
      })),
      linkedFile: s.file,
      ...(s.doc ? { doc: s.doc } : {}),
    },
  }));

  const edges: UmlEdge[] = model.relations.map((r) => {
    const h = handlesFor(posOf(r.fromId), posOf(r.toId));
    return {
      id: edgeId(r.id),
      source: nodeId(r.fromId),
      target: nodeId(r.toId),
      sourceHandle: h.sourceHandle,
      targetHandle: h.targetHandle,
      type: 'uml',
      data: { relType: relToUml(r.type) },
    };
  });

  return {
    id: diagramId(opts.diagramName ?? 'model'),
    name: opts.diagramName ?? 'Model',
    nodes,
    edges,
  };
}

export { kindToUml };
