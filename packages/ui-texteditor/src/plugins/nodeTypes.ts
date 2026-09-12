/**
 * nodeTypes.ts — rozpoznanie, czy plik potrzebuje typów Node, i złożenie ich
 * z rozproszonych plików `@types/node`.
 *
 * Typy Node to nie jeden plik: `index.d.ts` prawie nic nie deklaruje, a całość
 * wisi na `/// <reference path="fs.d.ts" />` do kilkudziesięciu innych. Pobranie
 * samego wejścia daje więc `process` bez `fs` i bez `path` — czyli podpowiedzi,
 * które wyglądają na działające, dopóki się z nich nie skorzysta.
 *
 * Ładujemy je **na żądanie**, a nie zawsze: plik czysto przeglądarkowy nie ma
 * powodu ściągać kilkudziesięciu deklaracji, których nigdy nie użyje.
 */

/** Moduły wbudowane Node — bez prefiksu `node:`, w wersji, w jakiej się je pisze. */
const BUILTIN_MODULES = new Set([
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http',
    'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
    'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers',
    'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Globalne nazwy, które istnieją wyłącznie w Node.
 *
 * `console`, `setTimeout` czy `fetch` są i w przeglądarce, więc nie mówią nic
 * o środowisku — po nich nie da się poznać, że plik jest node'owy.
 */
const NODE_GLOBALS = ['process', 'Buffer', '__dirname', '__filename', 'require', 'module', 'globalThis.process'];

/** Czy specyfikator importu wskazuje moduł wbudowany Node. */
export function isNodeBuiltin(specifier: string): boolean {
    if (specifier.startsWith('node:')) return true;
    const root = specifier.split('/')[0];
    return BUILTIN_MODULES.has(root);
}

/**
 * Czy plik wygląda na node'owy — po imporcie modułu wbudowanego albo po użyciu
 * globalu, którego w przeglądarce nie ma.
 *
 * Nazwy szukamy jako całego słowa: `process` w `processData` albo w napisie
 * „przetwarzam process" nie znaczy, że plik działa w Node.
 */
export function needsNodeTypes(code: string, specifiers: readonly string[]): boolean {
    if (specifiers.some(isNodeBuiltin)) return true;
    // Komentarze i napisy odpadają — inaczej wystarczyłaby wzmianka w opisie.
    const bezKomentarzy = code
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, ' ');
    return NODE_GLOBALS.some((nazwa) => new RegExp(`\\b${nazwa.replace('.', '\\.')}\\b`).test(bezKomentarzy));
}

/**
 * Ścieżki z dyrektyw `/// <reference path="…" />`.
 *
 * To po nich chodzi się po `@types/node`: `types="…"` (obsługiwane osobno)
 * wskazuje pakiet, a `path="…"` plik obok — i właśnie tak zbudowane są typy Node.
 */
export function extractReferencePaths(code: string): string[] {
    const out = new Set<string>();
    const re = /\/\/\/\s*<reference\s+path="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) out.add(m[1]);
    return [...out];
}

/** Skleja ścieżkę z dyrektywy z katalogiem pliku, w którym stała. */
export function resolveReference(fromFile: string, relative: string): string {
    const parts = fromFile.split('/');
    parts.pop();
    for (const seg of relative.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.' && seg !== '') parts.push(seg);
    }
    return parts.join('/');
}
