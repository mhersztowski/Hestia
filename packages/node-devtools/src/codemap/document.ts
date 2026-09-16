/**
 * The codemap document — a `*.codemap.json` file.
 *
 * A codemap is what the package knows about a body of source code: its symbols
 * (classes, interfaces, structs, modules), their members and documentation, the
 * relations between them and the files they come from — shown as UML diagrams,
 * with a git-like history of how that picture changed. The name is not tied to
 * UML on purpose: a diagram is one view of that knowledge, and the parsers are
 * not tied to one language (TS/JS, Python and C/C++ today).
 *
 * The shape started as MyCastle's `uml-project` v2 (`*.umlproj.json`) and is
 * still structurally the same, which is why {@link parseCodemap} reads those
 * files as well.
 *
 * Everything here is plain TypeScript — no `node:*`, no parsers — because the
 * browser needs it too (see `../format.ts`): the editor in
 * `@hestia/ui-devtools` commits, branches and restores with these functions,
 * so the history works the same whether the server or the page writes it.
 */
import { CodeModel } from './model/CodeModel.js';
import { commitId } from './model/ids.js';
import { modelToDiagram } from './uml/generateUml.js';
import type { ModelChange } from './uml/diffModel.js';
import { UmlDiagram } from './uml/umlTypes.js';

/** File name suffix of a codemap, e.g. `core.codemap.json`. */
export const CODEMAP_EXTENSION = '.codemap.json';

/** The state of a codemap recorded by one commit. */
export interface CodemapSnapshot {
  diagrams: UmlDiagram[];
  linkedPath?: string;
}
export interface CodemapCommit {
  id: string;
  message: string;
  at: number;
  parents: string[];
  snapshot: CodemapSnapshot;
}
export interface CodemapHistory {
  commits: Record<string, CodemapCommit>;
  /** Branch name → id of its tip commit. */
  branches: Record<string, string>;
  /** The current branch. */
  head: string;
}

export interface Codemap {
  /** Type discriminator — tells a codemap apart from other *.json files. */
  type: 'codemap';
  version: 1;
  name: string;
  /** The source directory the codemap was built from (as the host sees it). */
  linkedPath?: string;
  /** The working state — what the latest sync produced, plus manual edits. */
  diagrams: UmlDiagram[];
  history: CodemapHistory;
  updatedAt: number;
  /**
   * Files generated from the codemap (`*.schema.json`, `*.d.ts`), as paths the
   * host understands. The editor writes them; this package only carries the
   * list, so the next person to open the codemap finds the same outputs.
   */
  outputs?: string[];
}

/**
 * The result of syncing a codemap with source code: the updated document and
 * what changed. Defined here, next to the document, rather than next to
 * `CodemapService` — the browser has to be able to name this type (it is what a
 * host's sync endpoint returns) without reaching the Node-only service.
 */
export interface SyncResult {
  codemap: Codemap;
  changes: ModelChange[];
  summary: string;
  committed: boolean;
}

let counter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${counter++}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function initialHistory(
  diagrams: UmlDiagram[],
  linkedPath: string | undefined,
  message: string
): CodemapHistory {
  const id = commitId(uid('c'));
  const snapshot: CodemapSnapshot = { diagrams: clone(diagrams), linkedPath };
  return {
    commits: { [id]: { id, message, at: Date.now(), parents: [], snapshot } },
    branches: { main: id },
    head: 'main',
  };
}

/**
 * Create a codemap from diagrams that already exist — drawn by hand, or empty.
 * The first commit records them, so the history starts with what the user saw.
 */
export function codemapFromDiagrams(
  name: string,
  diagrams: UmlDiagram[],
  opts: { linkedPath?: string; message?: string } = {}
): Codemap {
  return {
    type: 'codemap',
    version: 1,
    name,
    linkedPath: opts.linkedPath,
    diagrams,
    history: initialHistory(diagrams, opts.linkedPath, opts.message ?? 'Start'),
    updatedAt: Date.now(),
  };
}

/** Create a brand-new codemap from a parsed model. */
export function createCodemap(model: CodeModel, name: string, linkedPath?: string): Codemap {
  const diagram = modelToDiagram(model, { diagramName: 'Model' });
  return codemapFromDiagrams(name, [diagram], {
    linkedPath,
    message: 'Generated from source code',
  });
}

/** Append a commit (advancing the current branch) to a codemap's history. */
export function commitCodemap(codemap: Codemap, message: string): Codemap {
  const snapshot: CodemapSnapshot = {
    diagrams: clone(codemap.diagrams),
    linkedPath: codemap.linkedPath,
  };
  const head = codemap.history.head;
  const parent = codemap.history.branches[head];
  const id = commitId(uid('c'));
  const commit = { id, message, at: Date.now(), parents: parent ? [parent] : [], snapshot };
  return {
    ...codemap,
    history: {
      ...codemap.history,
      commits: { ...codemap.history.commits, [id]: commit },
      branches: { ...codemap.history.branches, [head]: id },
    },
    updatedAt: Date.now(),
  };
}

/** The commit the current branch points at. */
export function headCommit(history: CodemapHistory): CodemapCommit | undefined {
  return history.commits[history.branches[history.head]];
}

/**
 * The commits of a branch, newest first, following first parents. Stops at a
 * missing commit or a cycle instead of looping — a hand-edited file may have
 * either.
 */
export function branchLog(history: CodemapHistory, branch: string): CodemapCommit[] {
  const out: CodemapCommit[] = [];
  const seen = new Set<string>();
  let id: string | undefined = history.branches[branch];
  while (id !== undefined && !seen.has(id)) {
    const c: CodemapCommit | undefined = history.commits[id];
    if (!c) break;
    seen.add(id);
    out.push(c);
    id = c.parents[0];
  }
  return out;
}

/** Whether the working state differs from the commit the current branch points at. */
export function hasUncommittedChanges(codemap: Codemap): boolean {
  const head = headCommit(codemap.history);
  if (!head) return true;
  const working: CodemapSnapshot = { diagrams: codemap.diagrams, linkedPath: codemap.linkedPath };
  return JSON.stringify(working) !== JSON.stringify(head.snapshot);
}

/**
 * Switch to another branch: the working state becomes that branch's tip.
 * Uncommitted work is replaced — asking first is the caller's job. Throws when
 * the branch or its tip does not exist.
 */
export function checkoutBranch(codemap: Codemap, branch: string): Codemap {
  const snap = codemap.history.commits[codemap.history.branches[branch]]?.snapshot;
  if (!snap) throw new Error(`codemap: branch "${branch}" does not exist`);
  return {
    ...codemap,
    diagrams: clone(snap.diagrams),
    linkedPath: snap.linkedPath,
    history: { ...codemap.history, head: branch },
    updatedAt: Date.now(),
  };
}

/**
 * Create a branch at the current commit and switch to it. Whitespace in the
 * name becomes `-`. Throws on an empty name or one that is already taken.
 */
export function createBranch(codemap: Codemap, name: string): Codemap {
  const clean = name.trim().replace(/\s+/g, '-');
  if (!clean) throw new Error('codemap: a branch needs a name');
  if (codemap.history.branches[clean] !== undefined)
    throw new Error(`codemap: branch "${clean}" already exists`);
  const tip = codemap.history.branches[codemap.history.head];
  return {
    ...codemap,
    history: {
      ...codemap.history,
      branches: { ...codemap.history.branches, [clean]: tip },
      head: clean,
    },
    updatedAt: Date.now(),
  };
}

/**
 * Bring an earlier commit back as the working state. The history is not
 * rewritten: the restored state is an uncommitted change until the user commits
 * it — so going back is itself recorded, and nothing is lost.
 */
export function restoreCommit(codemap: Codemap, id: string): Codemap {
  const snap = codemap.history.commits[id]?.snapshot;
  if (!snap) throw new Error(`codemap: commit "${id}" does not exist`);
  return {
    ...codemap,
    diagrams: clone(snap.diagrams),
    linkedPath: snap.linkedPath,
    updatedAt: Date.now(),
  };
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Parses the contents of a codemap file; throws when it is not one.
 *
 * Also reads MyCastle's `uml-project` v2 (`*.umlproj.json`) — the same shape
 * under an older name — and returns it as a codemap, `outputs` included. The
 * older single-diagram `uml-scene` files are refused: open and save them in the
 * MyCastle editor first, which migrates them to v2.
 *
 * The check is structural, not deep — like `parseRepoJson` in `git/`, it
 * catches the wrong file, not every malformed diagram inside the right one.
 */
export function parseCodemap(text: string): Codemap {
  const raw: unknown = JSON.parse(text);
  if (!isRecord(raw)) throw new Error('codemap: not a JSON object');
  const current = raw.type === 'codemap' && raw.version === 1;
  const legacy = raw.type === 'uml-project' && raw.version === 2;
  if (!current && !legacy) {
    throw new Error(
      `codemap: expected type "codemap" v1 or "uml-project" v2, got ${JSON.stringify(raw.type)} v${JSON.stringify(raw.version)}`
    );
  }
  const h = raw.history;
  const historyOk =
    isRecord(h) &&
    isRecord(h.commits) &&
    isRecord(h.branches) &&
    typeof h.head === 'string' &&
    typeof h.branches[h.head] === 'string';
  if (typeof raw.name !== 'string' || !Array.isArray(raw.diagrams) || !historyOk) {
    throw new Error('codemap: missing or invalid "name", "diagrams" or "history"');
  }
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    type: 'codemap',
    version: 1,
    name: raw.name,
    linkedPath: typeof raw.linkedPath === 'string' ? raw.linkedPath : undefined,
    diagrams: raw.diagrams as UmlDiagram[],
    history: h as unknown as CodemapHistory,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    // Omitted rather than `[]` when there are none — a codemap that never had
    // outputs should round-trip without growing a field.
    ...(outputs.length ? { outputs } : {}),
  };
}

/** Serialises a codemap for writing (indented). */
export function stringifyCodemap(codemap: Codemap): string {
  return JSON.stringify(codemap, null, 2) + '\n';
}
