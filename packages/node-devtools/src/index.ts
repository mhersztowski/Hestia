/**
 * @hestia/node-devtools — tools that work on source code.
 *
 * Two independent layers:
 * - `codemap/` — what is known about source code: parsers for C/C++/Python/JS/TS,
 *   the language-agnostic CodeModel, the `*.codemap.json` document with its UML
 *   view and history, and code generation back from it;
 * - `git/` — a wrapper around the `git` CLI for `.repo.json` clones.
 */
export * from './codemap/index.js';
export * from './git/index.js';
