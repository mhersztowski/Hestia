/**
 * `@hestia/node-devtools/format` — the codemap file format, safe in the browser.
 *
 * Everything reachable from here is plain TypeScript: no `node:*`, no parsers,
 * no `git` (`format.test.ts` walks the imports and fails if that changes). A
 * web page — the editor in `@hestia/ui-devtools` — imports this entry to read,
 * write, commit and diff codemaps with the same code the server uses. Were the
 * two to compute separately, at the first discrepancy there would be no telling
 * which one is right.
 *
 * The main entry (`@hestia/node-devtools`) exports all of this too, plus what needs
 * Node: the parsers, `CodemapService` and `GitRepoService`.
 */

// The document and its history
export type { Codemap, CodemapSnapshot, CodemapCommit, CodemapHistory, SyncResult } from './codemap/document.js';
export {
  CODEMAP_EXTENSION, codemapFromDiagrams, createCodemap, commitCodemap, parseCodemap, stringifyCodemap,
  headCommit, branchLog, hasUncommittedChanges, checkoutBranch, createBranch, restoreCommit,
} from './codemap/document.js';

// The UML view
export type {
  UmlKind, RelType, UmlMember, UmlDoc, UmlNodeData, UmlNode, UmlEdgeData, UmlEdge, UmlDiagram,
} from './codemap/uml/umlTypes.js';
export { diffDiagrams, summarizeChanges, describeChanges } from './codemap/uml/diffModel.js';
export type { ModelChange, ChangeKind, ChangeTarget } from './codemap/uml/diffModel.js';
