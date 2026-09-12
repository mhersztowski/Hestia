/**
 * Lazy, guarded loader for tree-sitter (WASM) grammars. Uses `web-tree-sitter`
 * (pure WASM runtime, no native build) + `tree-sitter-wasms` (prebuilt grammar
 * binaries). Everything is dynamically imported so the package builds and the
 * TypeScript path works even if these optional deps are unavailable.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface TSPoint { row: number; column: number }
export interface TSNode {
  type: string;
  text: string;
  namedChildren: TSNode[];
  children: TSNode[];
  childForFieldName(field: string): TSNode | null;
  descendantsOfType(type: string | string[]): TSNode[];
  startPosition: TSPoint;
}
export interface TSTree { rootNode: TSNode }
export type TSGrammar = 'python' | 'c' | 'cpp';

/* eslint-disable @typescript-eslint/no-explicit-any */
let parserClassPromise: Promise<any> | null = null;
const langCache = new Map<string, any>();

async function getParserClass(): Promise<any> {
  if (!parserClassPromise) {
    parserClassPromise = import('web-tree-sitter').then(async (mod: any) => {
      const Parser = mod.default ?? mod;
      await Parser.init({ locateFile: (name: string) => require.resolve(`web-tree-sitter/${name}`) });
      return Parser;
    });
  }
  return parserClassPromise;
}

async function loadLanguage(grammar: TSGrammar): Promise<any> {
  if (langCache.has(grammar)) return langCache.get(grammar);
  const Parser = await getParserClass();
  const wasmPath = require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
  const lang = await Parser.Language.load(wasmPath);
  langCache.set(grammar, lang);
  return lang;
}

/** Returns whether tree-sitter and the requested grammar can be loaded. */
export async function isGrammarAvailable(grammar: TSGrammar): Promise<boolean> {
  try { await loadLanguage(grammar); return true; } catch { return false; }
}

export async function parseTree(grammar: TSGrammar, code: string): Promise<TSTree> {
  const Parser = await getParserClass();
  const lang = await loadLanguage(grammar);
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser.parse(code) as TSTree;
}

/** Depth-first collect all descendant nodes of the given type(s). */
export function collect(root: TSNode, ...types: string[]): TSNode[] {
  const want = new Set(types);
  const out: TSNode[] = [];
  const walk = (n: TSNode) => { if (want.has(n.type)) out.push(n); for (const c of n.namedChildren) walk(c); };
  walk(root);
  return out;
}

export function fieldText(n: TSNode, field: string): string | undefined {
  return n.childForFieldName(field)?.text;
}
