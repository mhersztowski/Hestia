/**
 * `@hestia/ui-devtools` — developer tools that run in a browser, and the
 * browser counterpart of `@hestia/node-devtools`.
 *
 * The package is an umbrella over independent tools; each lives in a
 * subdirectory of `src/` with a public barrel and an entry of its own:
 *
 *   • `diagrams/` — the graphical diagram editor (model, format adapters,
 *     editors over `@xyflow/react`) — `@hestia/ui-devtools/diagrams`.
 *   • `codemap/`  — the codemap editor, MyCastle's Programming → UML page,
 *     over a `CodemapStore` the host supplies — `@hestia/ui-devtools/codemap`.
 *     From `@hestia/node-devtools` only the browser-safe `/format` entry.
 *
 * The root exposes them as **namespaces**, not flattened. Both define an
 * `emptyDiagram` and they are different functions — one makes a diagram
 * document of a given kind, the other a named UML diagram — so a flat
 * `export *` from both would be ambiguous. Namespacing says which tool a name
 * belongs to instead of hiding the question.
 *
 * Import the entries directly where it matters: a page that wants only diagrams
 * must not carry the codemap editor.
 */
export * as diagrams from './diagrams';
export * as codemap from './codemap';
