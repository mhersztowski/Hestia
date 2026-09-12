/** Python parser via tree-sitter (WASM). Extracts classes, methods and fields. */
import { CodeMember, CodeParam, CodeSymbol, Language, Visibility } from '../model/CodeModel.js';
import { memberId, symbolId } from '../model/ids.js';
import { renderMember } from '../model/render.js';
import { collect, fieldText, parseTree, TSNode } from './treeSitter.js';
import { LanguageParser } from './types.js';

function pyVisibility(name: string): Visibility {
  if (name.startsWith('__') && name.endsWith('__')) return 'public'; // dunder/magic
  if (name.startsWith('__')) return 'private';
  if (name.startsWith('_')) return 'protected';
  return 'public';
}

function firstIdentifier(n: TSNode): string | undefined {
  if (n.type === 'identifier') return n.text;
  for (const c of n.namedChildren) { const r = firstIdentifier(c); if (r) return r; }
  return undefined;
}

function methodParams(paramsNode: TSNode | null): CodeParam[] {
  if (!paramsNode) return [];
  const out: CodeParam[] = [];
  for (const p of paramsNode.namedChildren) {
    if (p.type === 'identifier') { if (p.text !== 'self' && p.text !== 'cls') out.push({ name: p.text }); continue; }
    if (p.type === 'typed_parameter') {
      const nm = firstIdentifier(p); const ty = fieldText(p, 'type');
      if (nm && nm !== 'self' && nm !== 'cls') out.push({ name: nm, type: ty });
      continue;
    }
    if (p.type === 'default_parameter' || p.type === 'typed_default_parameter') {
      const nm = firstIdentifier(p);
      if (nm && nm !== 'self' && nm !== 'cls') out.push({ name: nm, type: fieldText(p, 'type') });
    }
  }
  return out;
}

export class PythonParser implements LanguageParser {
  readonly languages: Language[] = ['python'];

  async parse(content: string, file: string, _language: Language): Promise<CodeSymbol[]> {
    const tree = await parseTree('python', content);
    const symbols: CodeSymbol[] = [];

    for (const cls of collect(tree.rootNode, 'class_definition')) {
      const name = fieldText(cls, 'name');
      if (!name) continue;
      const supers = cls.childForFieldName('superclasses');
      const extendsList = supers ? supers.namedChildren.filter((c) => c.type === 'identifier' || c.type === 'attribute').map((c) => c.text.split('.').pop()!).filter((x) => x !== 'object') : [];

      const body = cls.childForFieldName('body');
      const members: CodeMember[] = [];
      const used = new Set<string>();
      const fieldNames = new Set<string>();
      const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
        let id = memberId(name, base.kind, base.name);
        while (used.has(id)) id += '_';
        used.add(id);
        members.push({ ...base, id, text: renderMember(base) });
      };

      if (body) {
        const processFunction = (fnDef: TSNode, isStatic = false): void => {
          const mn = fieldText(fnDef, 'name') ?? 'method';
          push({ kind: 'method', name: mn, visibility: pyVisibility(mn), params: methodParams(fnDef.childForFieldName('parameters')), type: fieldText(fnDef, 'return_type'), isStatic });
          // self.<x> = ... fields inside __init__ / __post_init__
          if (mn === '__init__' || mn === '__post_init__') {
            const fnBody = fnDef.childForFieldName('body');
            if (fnBody) {
              for (const asn of collect(fnBody, 'assignment')) {
                const left = asn.childForFieldName('left');
                if (left && left.type === 'attribute' && left.childForFieldName('object')?.text === 'self') {
                  const fn = left.childForFieldName('attribute')?.text;
                  if (fn && !fieldNames.has(fn)) { fieldNames.add(fn); push({ kind: 'field', name: fn, visibility: pyVisibility(fn), type: fieldText(asn, 'type') }); }
                }
              }
            }
          }
        };

        for (const stmt of body.namedChildren) {
          if (stmt.type === 'function_definition') {
            processFunction(stmt);
          } else if (stmt.type === 'decorated_definition') {
            // @staticmethod / @classmethod → isStatic; @property / @x.setter → regular method
            const decorators = stmt.namedChildren.filter(c => c.type === 'decorator');
            const isStatic = decorators.some(d => {
              const name = d.namedChildren[0]?.text ?? '';
              return name === 'staticmethod' || name === 'classmethod';
            });
            const fnDef = stmt.childForFieldName('definition') ?? stmt.namedChildren.find(c => c.type === 'function_definition');
            if (fnDef && fnDef.type === 'function_definition') processFunction(fnDef, isStatic);
          } else if (stmt.type === 'expression_statement') {
            const asn = stmt.namedChildren[0];
            if (asn && asn.type === 'assignment') {
              const left = asn.childForFieldName('left');
              if (left && left.type === 'identifier' && !fieldNames.has(left.text)) {
                fieldNames.add(left.text);
                push({ kind: 'field', name: left.text, visibility: pyVisibility(left.text), type: fieldText(asn, 'type') });
              }
            }
          }
        }
      }

      symbols.push({ id: symbolId(name), name, kind: 'class', file, language: 'python', extends: extendsList, implements: [], members });
    }

    // Collect module-level functions and variables (outside any class).
    const moduleName = file.replace(/\.[^.]+$/, '').split(/[/\\]/).pop() ?? 'module';
    const modMembers: CodeMember[] = [];
    const usedMod = new Set<string>();
    const pushMod = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(moduleName, base.kind, base.name);
      while (usedMod.has(id)) id += '_';
      usedMod.add(id);
      modMembers.push({ ...base, id, text: renderMember(base) });
    };

    for (const stmt of tree.rootNode.namedChildren) {
      if (stmt.type === 'function_definition') {
        const mn = fieldText(stmt, 'name') ?? 'fn';
        pushMod({ kind: 'method', name: mn, visibility: pyVisibility(mn), params: methodParams(stmt.childForFieldName('parameters')), type: fieldText(stmt, 'return_type') });
      } else if (stmt.type === 'decorated_definition') {
        const fnDef = stmt.childForFieldName('definition') ?? stmt.namedChildren.find(c => c.type === 'function_definition');
        if (fnDef && fnDef.type === 'function_definition') {
          const mn = fieldText(fnDef, 'name') ?? 'fn';
          pushMod({ kind: 'method', name: mn, visibility: pyVisibility(mn), params: methodParams(fnDef.childForFieldName('parameters')), type: fieldText(fnDef, 'return_type') });
        }
      } else if (stmt.type === 'expression_statement') {
        const asn = stmt.namedChildren[0];
        if (asn && asn.type === 'assignment') {
          const left = asn.childForFieldName('left');
          if (left && left.type === 'identifier') {
            pushMod({ kind: 'field', name: left.text, visibility: pyVisibility(left.text), type: fieldText(asn, 'type') });
          }
        }
      }
    }

    if (modMembers.length > 0) {
      symbols.push({ id: symbolId(moduleName), name: moduleName, kind: 'module', file, language: 'python', extends: [], implements: [], members: modMembers });
    }

    return symbols;
  }
}
