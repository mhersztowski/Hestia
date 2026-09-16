/**
 * The codemap store — the editor's only door to the world of files.
 *
 * In MyCastle the page talked straight to that backend's REST VFS
 * (`/api/users/:user/vfs/…`, contents in base64, a token read from
 * `localStorage`) and to its own sync endpoint. None of that exists in Hestia,
 * and the page should not know which backend it runs against — so, as with
 * `NoteStore` in `@hestia/ui-cad`, the editor **describes** what it needs and the
 * host supplies it.
 *
 * `list`/`read`/`write` are required. `remove` and `rename` are optional, and
 * the editor draws no button for an operation the store lacks: a button that
 * always ends in an error promises something that will not happen.
 *
 * Paths are complete and relative to the top of the store
 * (`devtools/codemaps/core.codemap.json`). That includes `Codemap.linkedPath`,
 * the class → source-file links and the output files: a host that serves
 * several trees (the user's files and the application's code, say) gives each
 * a prefix and lists them in `roots`, which is what the file picker shows as
 * tabs — the MyCastle `mycastle-code/` prefix, turned into configuration.
 */
import {
  CODEMAP_EXTENSION,
  parseCodemap,
  stringifyCodemap,
  type Codemap,
  type SyncResult,
} from '@hestia/node-devtools/format';
import { normalizeCodemap } from './model';

/** A directory entry. The same shape as `DirEntry` in `@hestia/ui-cad`, so one host function can serve both. */
export interface StoreEntry {
  /** The entry's name including the extension, without the path. */
  name: string;
  directory: boolean;
}

/** A tree the file picker offers as a tab. */
export interface StoreRoot {
  label: string;
  /** Store path of the tree's top; `''` is the top of the store. */
  path: string;
}

export interface CodemapStore {
  /** The directory the codemaps live in (MyCastle: `drive/uml`). */
  codemapDir: string;
  /** Trees the file picker offers. Absent: one tree, the top of the store. */
  roots?: StoreRoot[];

  /** Contents of a directory. A missing directory is an empty list, not an error. */
  list(dir: string): Promise<StoreEntry[]>;
  /** Contents of a text file. Throws when it cannot be read. */
  read(path: string): Promise<string>;
  /** Writes a file, overwriting it and creating missing directories along the way. */
  write(path: string, content: string): Promise<void>;
  /** Deleting a file. Absent = no delete buttons. */
  remove?(path: string): Promise<void>;
  /**
   * Renaming a file. Absent = the editor renames by writing the new file and
   * removing the old one (when `remove` exists), and says so plainly if the
   * removal fails — see `renameCodemapFile`.
   */
  rename?(from: string, to: string): Promise<void>;
}

/** What the editor sends when the user asks to build the codemap from code. */
export interface SyncRequest {
  /** Store path of the source directory. */
  dir: string;
  /** Chosen files, relative to `dir`. Absent or empty = the whole directory. */
  files?: string[];
  /** The codemap as it is now, unsaved edits included — the sync updates it. */
  codemap: Codemap;
}

/**
 * Parsing needs Node (`@hestia/node-devtools` — the TypeScript compiler, tree-sitter,
 * the file system), so it runs on the host's server. Typically a POST handled
 * with `CodemapService.updateFromDir` / `updateFromFiles`.
 */
export type SyncFromCode = (request: SyncRequest) => Promise<SyncResult>;

/** Joining a directory and a name into a store path (with no double slashes). */
export function pathIn(dir: string, name: string): string {
  const d = dir.replace(/^\/+|\/+$/g, '');
  return d ? `${d}/${name}` : name;
}

/** Directories first, then by name — the order the picker shows. */
export function sortEntries(entries: StoreEntry[]): StoreEntry[] {
  return [...entries].sort((a, b) =>
    a.directory !== b.directory ? (a.directory ? -1 : 1) : a.name.localeCompare(b.name)
  );
}

/**
 * A file name for a codemap typed by a person: slashes flattened, the extension
 * added once. Stray `.json`, `.codemap` and the MyCastle `.umlproj` are dropped
 * first, so `core.umlproj.json` becomes `core.codemap.json`, not
 * `core.umlproj.codemap.json`.
 */
export function codemapFileName(raw: string): string {
  let name = raw.trim().replace(/[\\/]+/g, '-');
  if (!name) name = 'codemap';
  if (name.toLowerCase().endsWith(CODEMAP_EXTENSION)) return name;
  return name.replace(/\.json$/i, '').replace(/\.(codemap|umlproj)$/i, '') + CODEMAP_EXTENSION;
}

/** The name shown to the user: the file name without the extension. */
export function codemapDisplayName(file: string): string {
  return file.toLowerCase().endsWith(CODEMAP_EXTENSION)
    ? file.slice(0, -CODEMAP_EXTENSION.length)
    : file;
}

/** Codemap files in the store's codemap directory, sorted by name. */
export async function listCodemaps(store: CodemapStore): Promise<string[]> {
  const entries = await store.list(store.codemapDir);
  return entries
    .filter((e) => !e.directory && e.name.toLowerCase().endsWith(CODEMAP_EXTENSION))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Reads and normalises a codemap. Throws when the file is not one (see `parseCodemap`). */
export async function readCodemap(store: CodemapStore, file: string): Promise<Codemap> {
  return normalizeCodemap(parseCodemap(await store.read(pathIn(store.codemapDir, file))));
}

export async function writeCodemap(
  store: CodemapStore,
  file: string,
  codemap: Codemap
): Promise<void> {
  await store.write(pathIn(store.codemapDir, file), stringifyCodemap(codemap));
}

/**
 * Renames a codemap file. With `store.rename` it is one operation. Without it,
 * the new file is written first and the old one removed after — and if the
 * removal fails, the error says which file is which, so the user is not left
 * with two copies and no idea which is current.
 */
export async function renameCodemapFile(
  store: CodemapStore,
  from: string,
  to: string,
  codemap: Codemap
): Promise<void> {
  const src = pathIn(store.codemapDir, from);
  const dst = pathIn(store.codemapDir, to);
  if (store.rename) {
    await store.rename(src, dst);
    await store.write(dst, stringifyCodemap(codemap));
    return;
  }
  if (!store.remove) throw new Error('this store can neither rename nor remove files');
  await store.write(dst, stringifyCodemap(codemap));
  try {
    await store.remove(src);
  } catch (e) {
    throw new Error(
      `saved as ${to}, but the old ${from} could not be removed (${e instanceof Error ? e.message : String(e)}) — ${to} is the current one`,
      { cause: e }
    );
  }
}
