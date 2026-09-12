/**
 * C and C++ parser via tree-sitter (WASM). Extracts:
 *   • C   — `struct` definitions → classes with fields, including anonymous typedef structs
 *   • C++ — `class`/`struct` with access sections, fields, methods, base classes
 */
import { CodeMember, CodeParam, CodeSymbol, Language, SymbolKind, Visibility } from '../model/CodeModel.js';
import { memberId, symbolId } from '../model/ids.js';
import { renderMember } from '../model/render.js';
import { collect, fieldText, parseTree, TSNode, TSGrammar } from './treeSitter.js';
import { LanguageParser } from './types.js';

function findName(decl: TSNode | null): string | undefined {
  if (!decl) return undefined;
  if (decl.type === 'field_identifier' || decl.type === 'identifier' || decl.type === 'type_identifier') return decl.text;
  // function/array/pointer/reference declarators nest the real name in 'declarator'
  const inner = decl.childForFieldName('declarator');
  if (inner) return findName(inner);
  for (const c of decl.namedChildren) { const r = findName(c); if (r) return r; }
  return undefined;
}

function functionDeclarator(decl: TSNode | null): TSNode | null {
  if (!decl) return null;
  if (decl.type === 'function_declarator') return decl;
  // reference_declarator / rvalue_reference_declarator have no named 'declarator' field in the
  // tree-sitter-cpp grammar — the inner declarator is the first named child (after anonymous & / &&)
  if (decl.type === 'reference_declarator' || decl.type === 'rvalue_reference_declarator') {
    return functionDeclarator(decl.namedChildren[0] ?? null);
  }
  const inner = decl.childForFieldName('declarator');
  return inner ? functionDeclarator(inner) : null;
}

function cppParams(fnDecl: TSNode | null): CodeParam[] {
  if (!fnDecl) return [];
  const list = fnDecl.childForFieldName('parameters');
  if (!list) return [];
  const out: CodeParam[] = [];
  for (const p of list.namedChildren) {
    if (p.type !== 'parameter_declaration') continue;
    const type = fieldText(p, 'type');
    const nm = findName(p.childForFieldName('declarator'));
    out.push({ name: nm ?? '', type });
  }
  return out.filter((p) => p.name || p.type);
}

export class CppParser implements LanguageParser {
  readonly languages: Language[] = ['c', 'cpp'];

  async parse(content: string, file: string, language: Language): Promise<CodeSymbol[]> {
    const grammar: TSGrammar = language === 'c' ? 'c' : 'cpp';
    const tree = await parseTree(grammar, content);
    const symbols: CodeSymbol[] = [];

    const buildSymbol = (spec: TSNode, name: string, kind: SymbolKind): void => {
      const body = spec.childForFieldName('body');
      if (!body) return;

      const extendsList: string[] = [];
      for (const base of collect(spec, 'base_class_clause')) {
        for (const id of collect(base, 'type_identifier')) extendsList.push(id.text);
      }

      const members: CodeMember[] = [];
      const used = new Set<string>();
      const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
        let id = memberId(name, base.kind, base.name);
        while (used.has(id)) id += '_';
        used.add(id);
        members.push({ ...base, id, text: renderMember(base) });
      };

      let vis: Visibility = kind === 'class' ? 'private' : 'public';
      for (const m of body.namedChildren) {
        if (m.type === 'access_specifier') {
          const t = m.text.replace(':', '').trim();
          vis = t === 'public' ? 'public' : t === 'protected' ? 'protected' : 'private';
        } else if (m.type === 'function_definition' || m.type === 'declaration' || m.type === 'field_declaration') {
          const decl = m.childForFieldName('declarator');
          const fn = functionDeclarator(decl);
          const type = fieldText(m, 'type');
          const nm = findName(decl);
          if (!nm) continue;
          // `static` appears as storage_class_specifier child on the declaration/field node
          const isStatic = m.namedChildren.some(c => c.type === 'storage_class_specifier' && c.text === 'static');
          if (fn) push({ kind: 'method', name: nm, visibility: vis, type, params: cppParams(fn), isStatic });
          else if (m.type === 'field_declaration') push({ kind: 'field', name: nm, visibility: vis, type, isStatic });
        }
      }

      symbols.push({ id: symbolId(name), name, kind, file, language, extends: extendsList, implements: [], members });
    };

    // Named class/struct specifiers: class Foo { … } or struct Foo { … }
    for (const spec of collect(tree.rootNode, 'class_specifier', 'struct_specifier')) {
      const name = fieldText(spec, 'name');
      if (!name) continue; // anonymous — handled below via type_definition
      const kind: SymbolKind = spec.type === 'class_specifier' ? 'class' : 'struct';
      buildSymbol(spec, name, kind);
    }

    // Anonymous typedef structs/classes: typedef struct { … } Name;
    // tree-sitter produces: type_definition > struct_specifier (no 'name' field) + declarator (the alias)
    for (const td of collect(tree.rootNode, 'type_definition')) {
      const typeNode = td.childForFieldName('type');
      if (!typeNode || (typeNode.type !== 'struct_specifier' && typeNode.type !== 'class_specifier')) continue;
      if (fieldText(typeNode, 'name')) continue; // named struct: already handled in the loop above
      const tdName = findName(td.childForFieldName('declarator'));
      if (!tdName) continue;
      const kind: SymbolKind = typeNode.type === 'class_specifier' ? 'class' : 'struct';
      buildSymbol(typeNode, tdName, kind);
    }

    // Collect top-level free functions and global variable declarations.
    const moduleName = file.replace(/\.[^.]+$/, '').split(/[/\\]/).pop() ?? 'module';
    const modMembers: CodeMember[] = [];
    const usedMod = new Set<string>();
    const pushMod = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(moduleName, base.kind, base.name);
      while (usedMod.has(id)) id += '_';
      usedMod.add(id);
      modMembers.push({ ...base, id, text: renderMember(base) });
    };

    const SKIP_TYPES = new Set(['struct_specifier', 'class_specifier', 'enum_specifier', 'union_specifier']);

    for (const child of tree.rootNode.namedChildren) {
      if (child.type === 'function_definition') {
        const decl = child.childForFieldName('declarator');
        const fn = functionDeclarator(decl);
        const nm = findName(decl);
        if (nm && fn) pushMod({ kind: 'method', name: nm, visibility: 'public', type: fieldText(child, 'type'), params: cppParams(fn) });
      } else if (child.type === 'declaration') {
        // Skip if this is a struct/class/enum forward declaration or type containing one
        const typeNode = child.childForFieldName('type');
        if (typeNode && SKIP_TYPES.has(typeNode.type)) continue;
        const decl = child.childForFieldName('declarator');
        const fn = functionDeclarator(decl);
        const nm = findName(decl);
        if (!nm) continue;
        const type = fieldText(child, 'type');
        if (fn) pushMod({ kind: 'method', name: nm, visibility: 'public', type, params: cppParams(fn) });
        else pushMod({ kind: 'field', name: nm, visibility: 'public', type });
      }
    }

    if (modMembers.length > 0) {
      symbols.push({ id: symbolId(moduleName), name: moduleName, kind: 'module', file, language, extends: [], implements: [], members: modMembers });
    }

    return symbols;
  }
}
