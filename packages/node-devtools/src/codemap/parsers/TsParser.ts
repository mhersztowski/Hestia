/**
 * TypeScript / JavaScript parser built on the TypeScript Compiler API — the
 * best-in-class option for these languages (no native deps). Syntactic-only
 * (ts.createSourceFile) which is enough to extract structure cheaply.
 */
import ts from 'typescript';
import {
  CodeMember,
  CodeParam,
  CodeSymbol,
  DocMeta,
  Language,
  Visibility,
} from '../model/CodeModel.js';
import { memberId, symbolId } from '../model/ids.js';
import { renderMember } from '../model/render.js';
import { LanguageParser } from './types.js';

function visibilityOf(mods: readonly ts.ModifierLike[] | undefined): Visibility {
  if (!mods) return 'public';
  for (const m of mods) {
    if (m.kind === ts.SyntaxKind.PrivateKeyword) return 'private';
    if (m.kind === ts.SyntaxKind.ProtectedKeyword) return 'protected';
    if (m.kind === ts.SyntaxKind.PublicKeyword) return 'public';
  }
  return 'public';
}
const hasMod = (mods: readonly ts.ModifierLike[] | undefined, k: ts.SyntaxKind) =>
  !!mods?.some((m) => m.kind === k);

/**
 * Extracts TSDoc/JSDoc documentation from a declaration.
 *
 * It reads from the tree (`node.jsDoc`), not from the raw comment text — that
 * gives the tags already split up (`@param`, `@returns`) without a parser of our
 * own and without sensitivity to how the asterisks are formatted. `undefined`
 * when the element has no comment — an empty object would only clutter the
 * saved codemap.
 */
function docOf(node: ts.Node): DocMeta | undefined {
  const blocks = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (!blocks?.length) return undefined;

  const doc: DocMeta = {};
  const paragraphs: string[] = [];
  const examples: string[] = [];
  const see: string[] = [];
  const tags: string[] = [];

  const textOf = (comment: string | ts.NodeArray<ts.JSDocComment> | undefined): string => {
    if (!comment) return '';
    if (typeof comment === 'string') return comment.trim();
    return comment
      .map((c) => c.text ?? '')
      .join('')
      .trim();
  };

  for (const block of blocks) {
    const body = textOf(block.comment);
    if (body) paragraphs.push(body);

    for (const tag of block.tags ?? []) {
      const name = tag.tagName.text;
      const value = textOf(tag.comment);
      switch (name) {
        case 'param': {
          const paramName = (tag as ts.JSDocParameterTag).name?.getText();
          if (paramName) {
            doc.params = { ...doc.params, [paramName]: value };
          }
          break;
        }
        case 'returns':
        case 'return':
          if (value) doc.returns = value;
          break;
        case 'remarks':
          doc.remarks = doc.remarks ? `${doc.remarks}\n\n${value}` : value;
          break;
        case 'example':
          examples.push(value);
          break;
        case 'see': {
          // TypeScript splits `@see https://x` into name=`https` and comment=`://x`
          // (it takes the start for a symbol reference) — they have to be joined
          // back, otherwise all that is left of the address is `://x`.
          const ref = (tag as ts.JSDocSeeTag).name?.getText() ?? '';
          see.push(`${ref}${value}`.trim());
          break;
        }
        case 'deprecated':
          doc.deprecated = value;
          break;
        default:
          tags.push(value ? `${name} ${value}` : name);
      }
    }
  }

  // The first paragraph is the summary, the rest goes into `remarks` — that split
  // lets the UI show one sentence in a list and the whole text in the details.
  if (paragraphs.length) {
    const [first, ...rest] = paragraphs.join('\n\n').split(/\n\s*\n/);
    doc.summary = first.trim();
    const tail = rest.join('\n\n').trim();
    if (tail) doc.remarks = doc.remarks ? `${tail}\n\n${doc.remarks}` : tail;
  }
  if (examples.length) doc.examples = examples;
  if (see.length) doc.see = see.filter(Boolean);
  if (tags.length) doc.tags = tags;

  return Object.keys(doc).length ? doc : undefined;
}

function typeText(node: ts.TypeNode | undefined): string | undefined {
  return node ? node.getText().replace(/\s+/g, ' ').trim() : undefined;
}

function params(decl: ts.SignatureDeclarationBase): CodeParam[] {
  return decl.parameters.map((p) => ({ name: p.name.getText(), type: typeText(p.type) }));
}

function heritage(node: ts.ClassDeclaration | ts.InterfaceDeclaration): {
  ext: string[];
  impl: string[];
} {
  const ext: string[] = [];
  const impl: string[] = [];
  for (const h of node.heritageClauses ?? []) {
    for (const t of h.types) {
      const name = t.expression.getText();
      if (h.token === ts.SyntaxKind.ExtendsKeyword) ext.push(name);
      else impl.push(name);
    }
  }
  return { ext, impl };
}

function fileBaseName(file: string): string {
  return (
    file
      .replace(/\.[^.]+$/, '')
      .split(/[/\\]/)
      .pop() ?? 'module'
  );
}

export class TsParser implements LanguageParser {
  readonly languages: Language[] = ['typescript', 'javascript'];

  parse(content: string, file: string, language: Language): CodeSymbol[] {
    const sf = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      language === 'javascript' ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
    );
    const symbols: CodeSymbol[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const { ext, impl } = heritage(node);
        symbols.push({
          id: symbolId(name),
          name,
          kind: 'class',
          file,
          language,
          isAbstract: hasMod(node.modifiers, ts.SyntaxKind.AbstractKeyword),
          doc: docOf(node),
          extends: ext,
          implements: impl,
          members: this.classMembers(name, node.members),
        });
      } else if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const ext: string[] = [];
        for (const h of node.heritageClauses ?? [])
          for (const t of h.types) ext.push(t.expression.getText());
        symbols.push({
          id: symbolId(name),
          name,
          kind: 'interface',
          file,
          language,
          doc: docOf(node),
          extends: ext,
          implements: [],
          members: this.interfaceMembers(name, node.members),
        });
      } else if (ts.isEnumDeclaration(node)) {
        const name = node.name.text;
        const members: CodeMember[] = node.members.map((em, i) => {
          const mn = em.name.getText();
          const base = { kind: 'field' as const, name: mn, visibility: 'public' as Visibility };
          return { id: memberId(name, 'field', mn) + `#${i}`, ...base, text: mn };
        });
        symbols.push({
          id: symbolId(name),
          name,
          kind: 'enum',
          file,
          language,
          doc: docOf(node),
          extends: [],
          implements: [],
          members,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    // Collect top-level (module-level) functions, variables and type aliases.
    // exported → public, non-exported → package (~).
    const moduleName = fileBaseName(file);
    const modMembers: CodeMember[] = [];
    const usedMod = new Set<string>();
    const pushMod = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(moduleName, base.kind, base.name);
      while (usedMod.has(id)) id += '_';
      usedMod.add(id);
      modMembers.push({ ...base, id, text: renderMember(base) });
    };

    for (const stmt of sf.statements) {
      const isExported = hasMod((stmt as ts.HasModifiers).modifiers, ts.SyntaxKind.ExportKeyword);
      const vis: Visibility = isExported ? 'public' : 'package';
      if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        pushMod({
          kind: 'method',
          name: stmt.name.text,
          visibility: vis,
          type: typeText(stmt.type),
          params: params(stmt),
          isAsync: hasMod(stmt.modifiers, ts.SyntaxKind.AsyncKeyword),
          doc: docOf(stmt),
        });
      } else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          const name = decl.name.getText();
          if (name && !name.startsWith('{') && !name.startsWith('[')) {
            pushMod({
              kind: 'field',
              name,
              visibility: vis,
              type: typeText(decl.type),
              doc: docOf(stmt),
            });
          }
        }
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        pushMod({
          kind: 'field',
          name: stmt.name.text,
          visibility: vis,
          type: stmt.type.getText().replace(/\s+/g, ' ').slice(0, 60),
          doc: docOf(stmt),
        });
      }
    }

    if (modMembers.length > 0) {
      symbols.push({
        id: symbolId(moduleName),
        name: moduleName,
        kind: 'module',
        file,
        language,
        extends: [],
        implements: [],
        members: modMembers,
      });
    }

    return symbols;
  }

  private classMembers(owner: string, members: ts.NodeArray<ts.ClassElement>): CodeMember[] {
    const out: CodeMember[] = [];
    const used = new Set<string>();
    const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(owner, base.kind, base.name);
      while (used.has(id)) id += '_';
      used.add(id);
      out.push({ ...base, id, text: renderMember(base) });
    };
    for (const m of members) {
      if (ts.isPropertyDeclaration(m)) {
        push({
          kind: 'field',
          name: m.name.getText(),
          visibility: visibilityOf(m.modifiers),
          type: typeText(m.type),
          isStatic: hasMod(m.modifiers, ts.SyntaxKind.StaticKeyword),
          doc: docOf(m),
        });
      } else if (ts.isMethodDeclaration(m)) {
        push({
          kind: 'method',
          name: m.name.getText(),
          visibility: visibilityOf(m.modifiers),
          type: typeText(m.type),
          params: params(m),
          isStatic: hasMod(m.modifiers, ts.SyntaxKind.StaticKeyword),
          isAbstract: hasMod(m.modifiers, ts.SyntaxKind.AbstractKeyword),
          isAsync: hasMod(m.modifiers, ts.SyntaxKind.AsyncKeyword),
          doc: docOf(m),
        });
      } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
        push({
          kind: 'method',
          name: m.name.getText(),
          visibility: visibilityOf(m.modifiers),
          type: typeText(m.type),
          params: params(m),
          doc: docOf(m),
        });
      } else if (ts.isConstructorDeclaration(m)) {
        push({
          kind: 'method',
          name: 'constructor',
          visibility: 'public',
          params: params(m),
          doc: docOf(m),
        });
        // constructor parameter properties become fields
        for (const p of m.parameters) {
          if (p.modifiers?.length)
            push({
              kind: 'field',
              name: p.name.getText(),
              visibility: visibilityOf(p.modifiers),
              type: typeText(p.type),
            });
        }
      }
    }
    return out;
  }

  private interfaceMembers(owner: string, members: ts.NodeArray<ts.TypeElement>): CodeMember[] {
    const out: CodeMember[] = [];
    const used = new Set<string>();
    const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(owner, base.kind, base.name);
      while (used.has(id)) id += '_';
      used.add(id);
      out.push({ ...base, id, text: renderMember(base) });
    };
    for (const m of members) {
      if (ts.isPropertySignature(m))
        push({
          kind: 'field',
          name: m.name.getText(),
          visibility: 'public',
          type: typeText(m.type),
          doc: docOf(m),
        });
      else if (ts.isMethodSignature(m))
        push({
          kind: 'method',
          name: m.name.getText(),
          visibility: 'public',
          type: typeText(m.type),
          params: params(m),
          doc: docOf(m),
        });
    }
    return out;
  }
}
