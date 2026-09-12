/**
 * CppIntelliSensePlugin — two entry points:
 *
 * 1. `createCppPlugin(provider)` — IPlugin for MonacoMultiEditor (UserDataEditorPage).
 *    Resolves #include "..." via the VFS FileSystemProvider, using the URI of the
 *    currently open file to derive the base directory.
 *
 * 2. `CppIntelliSense` class — standalone for pages that use EditorInstance directly
 *    (CppProjectPage). Caller supplies the readIncludeFile callback.
 */

/**
 * CppIntelliSensePlugin
 *
 * Provides context-aware C++ completions:
 *   - variables, functions, classes, structs, typedefs, enums, macros from the current file
 *   - symbols from files referenced via #include "..." resolved through the provided readFile callback
 *   - member access completions on `.` and `->` with basic type tracking
 *
 * Usage:
 *   const intellisense = new CppIntelliSense((rel) => fetchFileContent(rel));
 *   intellisense.activate();
 *   // when file is opened / changed:
 *   intellisense.onFileOpened(fileContent);
 *   // cleanup:
 *   intellisense.dispose();
 */

import * as monaco from 'monaco-editor';
import type { FileSystemProvider } from '@hestia/core';
import type { IPlugin, IPluginManifest } from '../monaco';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CppSymbol {
  name: string;
  kind: monaco.languages.CompletionItemKind;
  detail?: string;
  doc?: string;
  line?: number;
  /** For classes/structs: member symbols */
  members?: CppSymbol[];
}

// ── Source parser ─────────────────────────────────────────────────────────────

const SKIP_KEYWORDS = new Set([
  'if', 'while', 'for', 'switch', 'catch', 'return', 'else', 'do',
  'case', 'default', 'break', 'continue', 'goto', 'sizeof', 'alignof',
  'new', 'delete', 'throw', 'try', 'class', 'struct', 'enum', 'namespace',
  'template', 'typename', 'typedef', 'using', 'static', 'inline', 'virtual',
  'explicit', 'constexpr', 'const', 'volatile', 'mutable', 'extern',
  'public', 'private', 'protected',
]);

const PRIMITIVE_TYPES = new Set([
  'int', 'float', 'double', 'char', 'bool', 'void', 'long', 'short',
  'unsigned', 'signed', 'auto', 'size_t', 'wchar_t', 'nullptr',
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  'string', 'wstring',
]);

export function parseCppSource(source: string, origin?: string): CppSymbol[] {
  const symbols: CppSymbol[] = [];
  const seen = new Set<string>();
  const lines = source.split('\n');

  let braceDepth = 0;
  let insideClass: { name: string; depth: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Count braces for class-body tracking
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth--;
        if (insideClass && braceDepth < insideClass.depth) {
          insideClass = null;
        }
      }
    }

    // Skip comments / block comment lines (don't skip preprocessor — handled below)
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    const lineNum = i + 1;
    const doc = origin ? `${origin}:${lineNum}` : `line ${lineNum}`;

    // ── #define macros ───────────────────────────────────────────────────────
    const defineMatch = line.match(/^\s*#define\s+(\w+)/);
    if (defineMatch) {
      const name = defineMatch[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        symbols.push({ name, kind: monaco.languages.CompletionItemKind.Constant, detail: 'macro', doc, line: lineNum });
      }
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    // ── class / struct ───────────────────────────────────────────────────────
    const classMatch = trimmed.match(/^(?:template\s*<[^>]*>\s*)?(?:class|struct)\s+(\w+)\s*(?:[:{;]|$)/);
    if (classMatch) {
      const name = classMatch[1];
      const isStruct = /\bstruct\b/.test(trimmed);
      if (!SKIP_KEYWORDS.has(name) && !seen.has(name)) {
        seen.add(name);
        const sym: CppSymbol = {
          name,
          kind: isStruct ? monaco.languages.CompletionItemKind.Struct : monaco.languages.CompletionItemKind.Class,
          detail: trimmed.replace(/\s*[{;].*$/, '').trim(),
          doc, line: lineNum, members: [],
        };
        symbols.push(sym);
        insideClass = { name, depth: braceDepth };
      }
      continue;
    }

    // ── enum ─────────────────────────────────────────────────────────────────
    const enumMatch = trimmed.match(/^enum\s+(?:class\s+)?(\w+)/);
    if (enumMatch) {
      const name = enumMatch[1];
      if (!seen.has(name)) {
        seen.add(name);
        symbols.push({ name, kind: monaco.languages.CompletionItemKind.Enum, detail: trimmed, doc, line: lineNum });
      }
      continue;
    }

    // ── typedef / using ──────────────────────────────────────────────────────
    const typedefMatch = trimmed.match(/^(?:typedef\s+.+\s+(\w+)|using\s+(\w+)\s*=)/);
    if (typedefMatch) {
      const name = typedefMatch[1] ?? typedefMatch[2];
      if (name && !seen.has(name)) {
        seen.add(name);
        symbols.push({ name, kind: monaco.languages.CompletionItemKind.TypeParameter, detail: trimmed, doc, line: lineNum });
      }
      continue;
    }

    // ── method inside class body (with or without return type) ──────────────
    // Must run before the general function regex to catch:
    //   init() {}  update() const {}  ~Foo() {}  operator=(…) {}
    if (insideClass) {
      const methodMatch = trimmed.match(
        /^(?:~|operator\S+\s*|(?:(?:inline|static|virtual|explicit|constexpr|const|override|final)\s+)*(?:\w[\w:<>*& ,]*?\s+)?)?(~?\w+|operator\S+)\s*\(([^)]*)\)/
      );
      if (methodMatch) {
        const name = methodMatch[1]?.trim();
        const params = methodMatch[2]?.trim() ?? '';
        if (name && !SKIP_KEYWORDS.has(name) && name.length > 0) {
          const owner = symbols.find((s) => s.name === insideClass!.name);
          if (owner?.members && !owner.members.some((m) => m.name === name)) {
            owner.members.push({
              name,
              kind: monaco.languages.CompletionItemKind.Method,
              detail: `${name}(${params})`,
              doc, line: lineNum,
            });
          }
        }
        continue;
      }
    }

    // ── function definition / declaration (outside class) ─────────────────
    // Matches: [qualifiers] returnType funcName(params) [qualifiers] [{ or ; or {…}]
    //
    // Każdy człon listy kwalifikatorów musi pochłonąć co najmniej jeden znak.
    // Wcześniej stało tu `[[nodiscard\]]*` — klasa znaków z gwiazdką, a więc
    // alternatywa pasująca do **pustego** napisu. Cała grupa redukowała się
    // wtedy do `(?:\s+)*`, czyli do pytania „na ile sposobów da się podzielić
    // ciąg spacji na niepuste kawałki". Odpowiedź rośnie wykładniczo: wiersz
    // wcięty 28 spacjami bez dopasowania zajmował 3,7 s, a 47 spacji — tyle,
    // że przeglądarka po prostu przestawała odpowiadać. Wcięcie takiej
    // głębokości daje zwykłe zawijanie warunku albo listy argumentów.
    const funcMatch = line.match(
      /^\s*(?:(?:inline|static|virtual|explicit|constexpr|const|\[\[nodiscard\]\])\s+)*(\w[\w:<>*& ,]*?)\s+(\w+)\s*\(([^)]*)\)/
    );
    if (funcMatch) {
      const ret = funcMatch[1].trim();
      const name = funcMatch[2].trim();
      const params = funcMatch[3].trim();
      if (!SKIP_KEYWORDS.has(name) && !PRIMITIVE_TYPES.has(name) && name.length > 1 && !seen.has(name)) {
        seen.add(name);
        symbols.push({
          name, kind: monaco.languages.CompletionItemKind.Function,
          detail: `${ret} ${name}(${params})`, doc, line: lineNum,
        });
      }
      continue;
    }

    // ── variable declarations ─────────────────────────────────────────────────
    const varPatterns: [RegExp, (m: RegExpMatchArray) => { name: string; type: string } | null][] = [
      // std::Type<...> name
      [
        /^\s*(?:const\s+)?(?:static\s+)?std::(\w+)(?:<[^>]+>)?\s+(\w+)\s*(?:=|;|\(|\[)/,
        (m) => ({ type: `std::${m[1]}`, name: m[2] }),
      ],
      // auto name =
      [
        /^\s*(?:const\s+)?auto\s+(\w+)\s*=/,
        (m) => ({ type: 'auto', name: m[1] }),
      ],
      // Type[*&] name [= ; [ (]
      [
        /^\s*(?:const\s+)?(?:static\s+)?(\w[\w:<> ]*?)\s*[*&]?\s+(\w+)\s*(?:=|;|\[)/,
        (m) => ({ type: m[1].trim(), name: m[2] }),
      ],
    ];

    for (const [pat, extract] of varPatterns) {
      const m = line.match(pat);
      if (!m) continue;
      const r = extract(m);
      if (!r) continue;
      const { name, type } = r;
      if (!name || !type || SKIP_KEYWORDS.has(name) || PRIMITIVE_TYPES.has(name) || name.length <= 1) break;

      const sym: CppSymbol = {
        name, kind: monaco.languages.CompletionItemKind.Variable,
        detail: type, doc, line: lineNum,
      };
      if (insideClass) {
        const owner = symbols.find((s) => s.name === insideClass!.name);
        if (owner?.members && !owner.members.some((mm) => mm.name === name)) {
          owner.members.push({ ...sym });
        }
      } else if (!seen.has(name)) {
        seen.add(name);
        symbols.push(sym);
      }
      break;
    }
  }

  return symbols;
}

/** Extract `#include "..."` local paths from source. */
function extractLocalIncludes(source: string): string[] {
  const paths: string[] = [];
  const re = /^\s*#include\s+"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) paths.push(m[1]);
  return paths;
}

// ── CppIntelliSense class ─────────────────────────────────────────────────────

/**
 * Standalone C++ IntelliSense provider.
 *
 * @param readIncludeFile - Async callback that receives a relative include path (e.g. "utils.h")
 *   and should return the file content as a string, or null if not found.
 */
export class CppIntelliSense {
  private symbols: CppSymbol[] = [];
  private disposables: monaco.IDisposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly fileCache = new Map<string, CppSymbol[]>();

  constructor(
    private readonly readIncludeFile: (relativePath: string) => Promise<string | null>
  ) {}

  /** Register Monaco completion + hover providers. Call once after Monaco is ready. */
  activate(): void {
    const self = this;

    const completionDisposable = monaco.languages.registerCompletionItemProvider(['cpp', 'c'], {
      triggerCharacters: ['.', ':', '>', '"', '/'],

      async provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
      ): Promise<monaco.languages.CompletionList> {
        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const lineContent = model.getLineContent(position.lineNumber);
        const textUntil = lineContent.substring(0, position.column - 1);
        const suggestions: monaco.languages.CompletionItem[] = [];

        // Member access: obj.member  or  ptr->member
        const memberMatch = textUntil.match(/(\w+)\s*(?:\.|->\s*)\w*$/);
        if (memberMatch) {
          const varName = memberMatch[1];

          // Look up the variable's declared type
          const varSym = self.symbols.find(
            (s) => s.name === varName &&
              (s.kind === monaco.languages.CompletionItemKind.Variable ||
               s.kind === monaco.languages.CompletionItemKind.Field)
          );
          // Strip qualifiers like const, *, & and std:: prefix from type string
          const rawType = varSym?.detail ?? '';
          const typeName = rawType
            .replace(/\bconst\b|\bstatic\b|\bvolatile\b/g, '')
            .replace(/std::/g, '')
            .replace(/[*&<>[\] ]/g, '')
            .trim();

          // Find the class/struct that owns these members
          const ownerClass = typeName
            ? self.symbols.find(
                (s) => s.name === typeName &&
                  (s.kind === monaco.languages.CompletionItemKind.Class ||
                   s.kind === monaco.languages.CompletionItemKind.Struct) &&
                  s.members
              )
            : null;

          // If we found the type, show only its members.
          // If type unknown, show members from all known classes as a best-effort.
          const members = ownerClass
            ? (ownerClass.members ?? [])
            : self.symbols.flatMap((s) => s.members ?? []);

          for (const m of members) {
            const isMethod = m.kind === monaco.languages.CompletionItemKind.Method ||
                             m.kind === monaco.languages.CompletionItemKind.Function;
            suggestions.push({
              label: m.name,
              kind: m.kind,
              insertText: isMethod ? `${m.name}($1)` : m.name,
              insertTextRules: isMethod ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              detail: m.detail,
              documentation: m.doc,
              sortText: `0_${m.name}`,
              range,
            });
          }
          return { suggestions, incomplete: false };
        }

        // Regular completions from current file + includes
        for (const sym of self.symbols) {
          const isCallable = sym.kind === monaco.languages.CompletionItemKind.Function ||
                             sym.kind === monaco.languages.CompletionItemKind.Method;
          suggestions.push({
            label: sym.name,
            kind: sym.kind,
            insertText: isCallable ? `${sym.name}($1)` : sym.name,
            insertTextRules: isCallable ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            detail: sym.detail,
            documentation: sym.doc,
            sortText: sym.line !== undefined ? `0_${sym.name}` : `1_${sym.name}`,
            range,
          });
        }

        return { suggestions, incomplete: false };
      },
    });
    this.disposables.push(completionDisposable);

    const hoverDisposable = monaco.languages.registerHoverProvider(['cpp', 'c'], {
      provideHover(_model, position, _token) {
        const word = _model.getWordAtPosition(position);
        if (!word) return null;
        const sym = self.symbols.find((s) => s.name === word.word)
          ?? self.symbols.flatMap((s) => s.members ?? []).find((m) => m.name === word.word);
        if (!sym) return null;
        return {
          contents: [
            { value: `**${sym.name}**  \`${sym.detail ?? ''}\`` },
            ...(sym.doc ? [{ value: sym.doc }] : []),
          ],
        };
      },
    });
    this.disposables.push(hoverDisposable);

    // ── Signature help provider ───────────────────────────────────────────────
    const signatureDisposable = monaco.languages.registerSignatureHelpProvider(['cpp', 'c'], {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],

      provideSignatureHelp(model, position): monaco.languages.ProviderResult<monaco.languages.SignatureHelpResult> {
        const lineContent = model.getLineContent(position.lineNumber);
        const textUntil = lineContent.substring(0, position.column - 1);

        // Walk backwards to find the outermost unclosed '(' and the name before it
        let depth = 0;
        let callStart = -1;
        for (let i = textUntil.length - 1; i >= 0; i--) {
          const ch = textUntil[i];
          if (ch === ')') { depth++; continue; }
          if (ch === '(') {
            if (depth === 0) { callStart = i; break; }
            depth--;
          }
        }
        if (callStart < 0) return null;

        const beforeParen = textUntil.substring(0, callStart).trim();

        // Count commas at depth 0 to find active parameter index
        let activeParam = 0;
        let d = 0;
        for (let i = callStart + 1; i < textUntil.length; i++) {
          const ch = textUntil[i];
          if (ch === '(' || ch === '[' || ch === '{') d++;
          else if (ch === ')' || ch === ']' || ch === '}') d--;
          else if (ch === ',' && d === 0) activeParam++;
        }

        // Detect call form: obj.method(  /  obj->method(  /  Cls::method(  /  func(
        let funcName: string | null = null;
        let ownerName: string | null = null;

        const memberCallMatch = beforeParen.match(/(\w+)\s*(?:\.|->)\s*(\w+)$/);
        const scopeCallMatch  = beforeParen.match(/(\w+)\s*::\s*(\w+)$/);
        const plainCallMatch  = beforeParen.match(/(\w+)$/);

        if (memberCallMatch) {
          ownerName = memberCallMatch[1];
          funcName  = memberCallMatch[2];
        } else if (scopeCallMatch) {
          ownerName = scopeCallMatch[1];   // class name (scope)
          funcName  = scopeCallMatch[2];
        } else if (plainCallMatch) {
          funcName = plainCallMatch[1];
        }

        if (!funcName) return null;

        // Look up the symbol
        let sym: CppSymbol | undefined;

        if (ownerName) {
          // For member / scope call: look in the class's members first
          const varSym = self.symbols.find((s) => s.name === ownerName);
          // If it's a variable, resolve its type
          const typeName = varSym?.kind === monaco.languages.CompletionItemKind.Variable
            ? (varSym.detail ?? '').replace(/\bconst\b|\bstatic\b/g, '').replace(/std::/g, '').replace(/[*&<>[\] ]/g, '').trim()
            : ownerName; // used directly as class name for scope calls

          const ownerClass = self.symbols.find(
            (s) => s.name === typeName &&
              (s.kind === monaco.languages.CompletionItemKind.Class ||
               s.kind === monaco.languages.CompletionItemKind.Struct)
          );
          sym = ownerClass?.members?.find((m) => m.name === funcName);
        }

        // Fallback: search in top-level symbols
        if (!sym) {
          sym = self.symbols.find(
            (s) => s.name === funcName &&
              (s.kind === monaco.languages.CompletionItemKind.Function ||
               s.kind === monaco.languages.CompletionItemKind.Method)
          );
        }

        if (!sym?.detail) return null;

        // Parse parameter list from the detail string, e.g. "void foo(int a, float b)"
        // detail format: "returnType name(params)"  OR  "name(params)"  (for methods)
        const detailParamsMatch = sym.detail.match(/\(([^)]*)\)/);
        const paramsStr = detailParamsMatch?.[1]?.trim() ?? '';
        const paramList = paramsStr === '' ? [] : paramsStr.split(',').map((p) => p.trim());

        const parameters: monaco.languages.ParameterInformation[] = paramList.map((p) => ({
          label: p,
          documentation: undefined,
        }));

        return {
          value: {
            signatures: [{
              label: sym.detail,
              documentation: sym.doc,
              parameters,
            }],
            activeSignature: 0,
            activeParameter: Math.min(activeParam, Math.max(0, parameters.length - 1)),
          },
          dispose: () => {},
        };
      },
    });
    this.disposables.push(signatureDisposable);
  }

  /**
   * Parse a newly opened / changed file and load its includes.
   * Call this whenever the editor's content changes.
   */
  onFileOpened(content: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.refresh(content), 600);
  }

  /** Immediate (non-debounced) refresh — useful when the file is first opened. */
  async onFileOpenedImmediate(content: string): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.refresh(content);
  }

  private async refresh(content: string): Promise<void> {
    this.fileCache.clear();
    const current = parseCppSource(content, 'current');
    const includeSymbols = await this.loadIncludes(content, 0);

    const seen = new Set(current.map((s) => s.name));
    for (const s of includeSymbols) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        current.push(s);
      }
    }
    this.symbols = current;
  }

  private async loadIncludes(source: string, depth: number): Promise<CppSymbol[]> {
    if (depth > 4) return [];
    const paths = extractLocalIncludes(source);
    const result: CppSymbol[] = [];
    const seen = new Set<string>();

    for (const p of paths) {
      if (this.fileCache.has(p)) {
        for (const s of this.fileCache.get(p)!) {
          if (!seen.has(s.name)) { seen.add(s.name); result.push(s); }
        }
        continue;
      }
      let includeContent: string | null = null;
      try { includeContent = await this.readIncludeFile(p); } catch { /* ignore */ }
      if (!includeContent) continue;

      const fileSymbols = parseCppSource(includeContent, p);
      const nested = await this.loadIncludes(includeContent, depth + 1);
      const merged = [...fileSymbols];
      const fileNames = new Set(fileSymbols.map((s) => s.name));
      for (const s of nested) { if (!fileNames.has(s.name)) { fileNames.add(s.name); merged.push(s); } }

      this.fileCache.set(p, merged);
      for (const s of merged) {
        if (!seen.has(s.name)) { seen.add(s.name); result.push(s); }
      }
    }
    return result;
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

// ── IPlugin wrapper for MonacoMultiEditor ─────────────────────────────────────

function isCppUri(uri: string): boolean {
  return /\.(c|cpp|cc|cxx|h|hpp|hh|hxx)$/i.test(uri);
}

function uriToVfsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function dirOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '/';
}

function resolvePath(baseDir: string, rel: string): string {
  if (rel.startsWith('/')) return rel;
  const parts = baseDir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Create a C++ IntelliSense plugin compatible with MonacoMultiEditor's IPlugin system.
 * Pass the same VFS provider used by the editor (e.g. CompositeFS from UserDataEditorPage).
 */
export function createCppPlugin(provider: FileSystemProvider): IPlugin {
  let currentDir = '/';

  const intellisense = new CppIntelliSense(async (relativePath) => {
    const fullPath = resolvePath(currentDir, relativePath);
    try {
      const bytes = await provider.readFile(fullPath);
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  });

  const manifest: IPluginManifest = {
    id: 'cpp-intellisense',
    name: 'C++ IntelliSense',
    version: '1.0.0',
    contributes: [],
  };

  return {
    manifest,
    activate(api) {
      intellisense.activate();

      // When a new file is opened, update the base dir and trigger immediate parse
      api.editor.onDidOpenDocument((uri, text) => {
        if (!isCppUri(uri)) return;
        currentDir = dirOf(uriToVfsPath(uri));
        intellisense.onFileOpenedImmediate(text);
      });

      // When the model changes (tab switch) we get the URI but not the text —
      // content will arrive via onDidOpenDocument shortly after
      api.editor.onDidChangeModel((uri) => {
        if (isCppUri(uri)) {
          currentDir = dirOf(uriToVfsPath(uri));
        }
      });

      // Debounced refresh on every keystroke
      api.editor.onDidChangeContent((text) => {
        intellisense.onFileOpened(text);
      });
    },
    deactivate() {
      intellisense.dispose();
    },
  };
}
