/**
 * codemap — what the package knows about source code.
 *
 * Parse C/C++/Python/JS/TS into a language-agnostic CodeModel, keep it as a
 * codemap (`*.codemap.json`: UML diagrams + git-like history), diff successive
 * versions into that history, and round-trip a codemap back into source-code
 * skeletons.
 */

// The codemap document (the `*.codemap.json` file) and its history
export type {
  Codemap,
  CodemapSnapshot,
  CodemapCommit,
  CodemapHistory,
  SyncResult,
} from './document.js';
export {
  CODEMAP_EXTENSION,
  codemapFromDiagrams,
  createCodemap,
  commitCodemap,
  parseCodemap,
  stringifyCodemap,
  headCommit,
  branchLog,
  hasUncommittedChanges,
  checkoutBranch,
  createBranch,
  restoreCommit,
} from './document.js';

// Orchestrator
export { CodemapService } from './CodemapService.js';
export type { ScanOptions } from './CodemapService.js';

// IR model
export type {
  Language,
  SymbolKind,
  MemberKind,
  Visibility,
  CodeParam,
  CodeMember,
  CodeSymbol,
  RelationType,
  CodeRelation,
  CodeModel,
  DocMeta,
} from './model/CodeModel.js';
export { emptyModel, VISIBILITY_SIGIL, sigil } from './model/CodeModel.js';
export { renderMember, parseMemberText } from './model/render.js';
export { resolveRelations, finalizeModel, extractTypeNames } from './model/resolve.js';
export * as ids from './model/ids.js';

// Parsers
export { buildModel, parseSource, detectLanguage, SUPPORTED_EXTENSIONS } from './parsers/index.js';
export type { SourceFile, LanguageParser } from './parsers/index.js';
export { TsParser } from './parsers/TsParser.js';
export { PythonParser } from './parsers/PythonParser.js';
export { CppParser } from './parsers/CppParser.js';
export { isGrammarAvailable } from './parsers/treeSitter.js';

// UML view
export type {
  UmlKind,
  RelType,
  UmlMember,
  UmlDoc,
  UmlNodeData,
  UmlNode,
  UmlEdgeData,
  UmlEdge,
  UmlDiagram,
} from './uml/umlTypes.js';
export { modelToDiagram, kindToUml } from './uml/generateUml.js';
export { layoutSymbols, handlesFor } from './uml/layout.js';
export { diffDiagrams, summarizeChanges, describeChanges } from './uml/diffModel.js';
export type { ModelChange, ChangeKind, ChangeTarget } from './uml/diffModel.js';
export { diagramToModel } from './uml/umlToModel.js';

// Code generation
export {
  generateCode,
  generateTs,
  generateTsSymbol,
  generatePython,
  generatePythonSymbol,
  generateCpp,
  generateCppSymbol,
} from './codegen/index.js';
export type { GeneratedFile } from './codegen/index.js';
