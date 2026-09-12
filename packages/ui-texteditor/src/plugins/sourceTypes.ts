/**
 * sourceTypes.ts — lista typów dostępnych w pliku otwartym w MinisLib Graph.
 *
 * Bloczek deklaracji zmiennej pozwala nadać jej typ, a sensowne podpowiedzi są
 * trzy: typy wbudowane TypeScriptu, typy zadeklarowane w tym pliku (klasa,
 * interfejs, alias, enum) oraz to, co plik importuje. Wszystko liczone jest
 * z treści pliku, bo plugin i tak nie ma dostępu do kompilatora.
 */

/** Typy wbudowane — pierwsze na liście, bo najczęściej używane. */
export const BUILTIN_TS_TYPES = [
  'string', 'number', 'boolean', 'bigint', 'symbol',
  'any', 'unknown', 'void', 'never', 'object',
  'Date', 'RegExp', 'Error',
  'string[]', 'number[]', 'boolean[]',
  'Array<string>', 'Array<number>',
  'Record<string, unknown>', 'Map<string, string>', 'Set<string>',
  'Promise<void>', 'Promise<string>', 'Promise<number>',
] as const;

export interface TypeOption {
  label: string;
  /** Skąd typ pochodzi — do pogrupowania listy. */
  group: string;
}

/** Deklaracje w pliku: `class X`, `interface X`, `type X =`, `enum X`. */
export function collectDeclaredTypes(code: string): string[] {
  const src = String(code ?? '');
  const out = new Set<string>();
  const patterns = [
    /(?:^|\n)\s*(?:export\s+)?(?:export\s+default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^=]*>)?\s*=/g,
    /(?:^|\n)\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * Nazwy sprowadzane importami — z `import { A, B as C }`, `import D from` oraz
 * `import type { E }`. Aliasy (`B as C`) dają nazwę użyteczną w kodzie, czyli `C`.
 */
export function collectImportedTypes(code: string): Array<{ name: string; from: string }> {
  const src = String(code ?? '');
  const out: Array<{ name: string; from: string }> = [];
  const seen = new Set<string>();
  const push = (name: string, from: string) => {
    const clean = name.trim();
    if (!clean || seen.has(clean)) return;
    // Typy zaczynają się wielką literą — `import { useState }` nie jest typem
    // i tylko zaśmiecałby listę.
    if (!/^[A-Z]/.test(clean)) return;
    seen.add(clean);
    out.push({ name: clean, from });
  };

  const importRe = /import\s+(type\s+)?([^;'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(importRe)) {
    const clause = m[2].trim();
    const from = m[3];

    const braced = clause.match(/\{([^}]*)\}/);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const alias = part.split(/\s+as\s+/);
        push(alias.length > 1 ? alias[1] : alias[0].replace(/^type\s+/, ''), from);
      }
    }
    // Import domyślny / przestrzeń nazw: `import Foo from`, `import * as Foo from`.
    const head = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    const ns = head.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) push(ns[1], from);
    else if (head && /^[A-Za-z_$][\w$]*$/.test(head)) push(head, from);
  }
  return out;
}

/**
 * Pełna lista podpowiedzi dla pola typu — w kolejności użyteczności:
 * wbudowane, z tego pliku, z importów. Duplikaty (typ zadeklarowany i zarazem
 * zaimportowany) pojawiają się raz, w pierwszej pasującej grupie.
 */
export function buildTypeOptions(code: string, extra: TypeOption[] = []): TypeOption[] {
  const seen = new Set<string>();
  const out: TypeOption[] = [];
  const add = (label: string, group: string) => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    out.push({ label, group });
  };

  for (const t of BUILTIN_TS_TYPES) add(t, 'TypeScript');
  for (const t of collectDeclaredTypes(code)) add(t, 'Ten plik');
  for (const { name, from } of collectImportedTypes(code)) add(name, `import: ${from}`);
  for (const o of extra) add(o.label, o.group);
  return out;
}

/**
 * Indeks TUŻ ZA ostatnią deklaracją importu (0 = brak importów).
 *
 * Import bywa wieloliniowy:
 *
 *     import {
 *       A, B,
 *     } from './x';
 *
 * Dopasowanie „linia zaczynająca się od import" trafiałoby wtedy w `import {`
 * i nowy import lądował w środku listy nazw — dlatego wzorzec obejmuje całą
 * deklarację, aż do specyfikatora modułu.
 */
export function lastImportEnd(code: string): number {
  const src = String(code ?? '');
  // Trzy kształty: `import … from 'x'`, `import 'x'` (side-effect), `import type … from 'x'`.
  const re = /(^|\n)[ \t]*import\b(?:[^'"();]|\{[\s\S]*?\})*?from\s*['"][^'"]+['"][ \t]*;?|(^|\n)[ \t]*import\s*['"][^'"]+['"][ \t]*;?/g;
  let end = 0;
  for (const m of src.matchAll(re)) {
    end = (m.index ?? 0) + m[0].length;
  }
  return end;
}

/**
 * Wstawia linię importu za ostatnią istniejącą deklaracją (albo na początku
 * pliku, gdy importów nie ma). Nie dotyka reszty pliku — pozycja kursora ani
 * układ kodu nie mają tu znaczenia.
 */
export function insertImportLine(code: string, line: string): string {
  const src = String(code ?? '');
  const withNewline = line.endsWith('\n') ? line : `${line}\n`;
  const at = lastImportEnd(src);
  if (at <= 0) return withNewline + src;
  const rest = src.slice(at);
  // Po ostatnim imporcie zwykle jest już `\n` — nie dokładamy drugiego.
  return src.slice(0, at) + '\n' + withNewline.replace(/\n$/, '') + (rest.startsWith('\n') ? rest : `\n${rest}`);
}
