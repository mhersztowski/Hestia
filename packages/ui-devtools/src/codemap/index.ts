/**
 * codemap — the editor for `*.codemap.json` files (MyCastle's Programming → UML
 * page), and the contract a host implements to embed it.
 */
export { CodemapEditor } from './CodemapEditor';
export type { CodemapEditorProps } from './CodemapEditor';

export {
  codemapDisplayName,
  codemapFileName,
  listCodemaps,
  pathIn,
  readCodemap,
  renameCodemapFile,
  sortEntries,
  writeCodemap,
} from './store';
export type { CodemapStore, StoreEntry, StoreRoot, SyncRequest, SyncFromCode } from './store';

// The generators are pure — a server can produce the same outputs without the page.
export {
  collectTypes,
  generateDts,
  generateJsonSchemaFiles,
  jsonTypeFromTs,
  outputKind,
  planOutput,
} from './generate';
export type { OutputKind } from './generate';
