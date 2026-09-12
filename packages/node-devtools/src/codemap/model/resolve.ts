import { CodeModel, CodeRelation, CodeSymbol } from './CodeModel.js';
import { relationId } from './ids.js';

/** Strip generics/arrays/pointers/namespaces and yield candidate type names. */
export function extractTypeNames(typeStr: string | undefined): string[] {
  if (!typeStr) return [];
  // Tokens that look like identifiers; ignore primitives/keywords.
  const tokens = typeStr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const drop = new Set([
    'void', 'int', 'float', 'double', 'bool', 'char', 'string', 'str', 'number',
    'boolean', 'any', 'unknown', 'object', 'List', 'Array', 'Map', 'Set', 'Dict',
    'Optional', 'Promise', 'shared_ptr', 'unique_ptr', 'vector', 'const', 'static',
    'std', 'self', 'None', 'true', 'false', 'null', 'undefined',
  ]);
  return [...new Set(tokens.filter((t) => !drop.has(t)))];
}

/**
 * Build relations from already-parsed symbols:
 *   • extends    → generalization
 *   • implements → realization
 *   • field types referencing a known symbol → association
 * Only references to symbols present in the model become relations (keeps the
 * diagram free of noise from external/stdlib types).
 */
export function resolveRelations(symbols: CodeSymbol[]): CodeRelation[] {
  const byName = new Map<string, CodeSymbol>();
  for (const s of symbols) byName.set(s.name, s);
  const rels = new Map<string, CodeRelation>();
  const add = (fromId: string, toId: string, type: CodeRelation['type']) => {
    if (fromId === toId) return;
    const id = relationId(fromId, toId, type);
    if (!rels.has(id)) rels.set(id, { id, fromId, toId, type });
  };

  for (const s of symbols) {
    for (const base of s.extends) {
      const t = byName.get(base);
      if (t) add(s.id, t.id, 'generalization');
    }
    for (const impl of s.implements) {
      const t = byName.get(impl);
      if (t) add(s.id, t.id, 'realization');
    }
    for (const m of s.members) {
      if (m.kind !== 'field') continue;
      for (const tn of extractTypeNames(m.type)) {
        const t = byName.get(tn);
        // Don't duplicate an inheritance edge as an association.
        if (t && !s.extends.includes(tn) && !s.implements.includes(tn)) add(s.id, t.id, 'association');
      }
    }
  }
  return [...rels.values()];
}

/** Attach resolved relations to a model (parsers fill symbols only). */
export function finalizeModel(model: CodeModel): CodeModel {
  return { ...model, relations: resolveRelations(model.symbols) };
}
