import { CodeMember, CodeModel, CodeRelation, CodeSymbol, Language, RelationType, SymbolKind } from '../model/CodeModel.js';
import { relationId } from '../model/ids.js';
import { parseMemberText } from '../model/render.js';
import { RelType, UmlDiagram, UmlKind } from './umlTypes.js';

/** UML relation kinds collapse to the IR's five structural relation types. */
function umlRelToCode(t: RelType): RelationType {
  if (t === 'directed' || t === 'aggregation') return 'association';
  return t;
}

function umlKindToSymbol(k: UmlKind): { kind: SymbolKind; isAbstract: boolean } {
  if (k === 'interface') return { kind: 'interface', isAbstract: false };
  if (k === 'enum') return { kind: 'enum', isAbstract: false };
  if (k === 'abstract') return { kind: 'class', isAbstract: true };
  return { kind: 'class', isAbstract: false };
}

/**
 * Reconstruct a {@link CodeModel} from a (possibly hand-edited) UML diagram so
 * it can be fed to the code generators. Inheritance is recovered from edges.
 */
export function diagramToModel(diagram: UmlDiagram, language: Language = 'typescript'): CodeModel {
  const nameByNode = new Map(diagram.nodes.map((n) => [n.id, n.data.name]));

  const symbols: CodeSymbol[] = diagram.nodes.map((n) => {
    const { kind, isAbstract } = umlKindToSymbol(n.data.kind);
    const members: CodeMember[] = n.data.members.map((m) => {
      const p = parseMemberText(m.text);
      return { id: m.id, kind: p.kind, name: p.name, visibility: p.visibility, type: p.type, params: p.params, isStatic: p.isStatic, isAsync: p.isAsync, doc: m.doc, text: m.text };
    });
    return { id: n.data.name, name: n.data.name, kind, file: n.data.linkedFile ?? '', language, isAbstract, doc: n.data.doc, members, extends: [], implements: [] };
  });
  const byName = new Map(symbols.map((s) => [s.name, s]));

  const relations: CodeRelation[] = [];
  for (const e of diagram.edges) {
    const from = byName.get(nameByNode.get(e.source) ?? '');
    const toName = nameByNode.get(e.target);
    if (!from || !toName) continue;
    if (e.data.relType === 'generalization') from.extends.push(toName);
    else if (e.data.relType === 'realization') from.implements.push(toName);
    const type = umlRelToCode(e.data.relType);
    relations.push({ id: relationId(from.id, toName, type), fromId: from.id, toId: toName, type });
  }

  return { symbols, relations, files: [...new Set(symbols.map((s) => s.file).filter(Boolean))] };
}
