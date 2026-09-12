import * as monaco from 'monaco-editor';
import type { FileSystemProvider } from '@hestia/core';
import type { IPlugin } from '../monaco';
import { buildCompilerOptions } from './tsCompilerOptions';
import { needsNodeTypes, extractReferencePaths, resolveReference } from './nodeTypes';

// ── URI ↔ VFS path helpers ───────────────────────────────────────────────────

/** 'file:///home/foo/bar.ts' → '/home/foo/bar.ts' */
function uriToVfsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/** '/home/foo/bar.ts' → 'file:///home/foo/bar.ts' */
function vfsPathToUri(vfsPath: string): string {
  return vfsPath.startsWith('/') ? 'file://' + vfsPath : vfsPath;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function dirOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '/';
}

function resolvePath(base: string, rel: string): string {
  const parts = base.split('/');
  parts.pop(); // remove filename, keep dir
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Parse all static import/require specifiers from TypeScript/JS source. */
function extractSpecifiers(code: string): string[] {
  const seen = new Set<string>();
  const staticRe = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g;
  const dynamicRe = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) seen.add(m[1]);
  }
  return [...seen];
}

/** Parse `/// <reference types="pkg" />` directives from a .d.ts file. */
function extractTypeReferences(code: string): string[] {
  const seen = new Set<string>();
  const re = /\/\/\/\s*<reference\s+types="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) seen.add(m[1]);
  return [...seen];
}

/** '@org/pkg' → 'org__name', 'pkg' → 'pkg' */
function toAtTypesSlug(pkg: string): string {
  return pkg.startsWith('@') ? pkg.slice(1).replace('/', '__') : pkg;
}

/** Return the package root name from an import specifier. */
function pkgNameFrom(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return specifier.split('/')[0];
}

/**
 * Return the JS module name that an @types package provides types for.
 * '@types/express' → 'express', '@types/express-serve-static-core' → 'express-serve-static-core'.
 * Returns null for packages where ambient wrapping is wrong (e.g. @types/node provides
 * global declarations, not a 'node' module import).
 */
function ambientModuleName(pkg: string): string | null {
  if (pkg === 'node' || pkg === '@types/node') return null; // globals, not a module
  if (pkg.startsWith('@types/')) return pkg.slice('@types/'.length);
  return null; // bundled-types packages (non-@types): don't guess the module name
}

/**
 * Wrap CDN-loaded .d.ts content as a `declare module 'X' { ... }` ambient declaration.
 * These are found by TypeScript globally without file-path-based module resolution,
 * guaranteeing that `require('X')` / `import X from 'X'` get proper types.
 * We strip `/// <reference ...>` directives since transitive deps get their own wrappers.
 */
function wrapAsAmbientModule(moduleName: string, content: string): string {
  const stripped = content.replace(/^\/\/\/.*$/gm, '').trim();
  return `declare module '${moduleName}' {\n${stripped}\n}\n`;
}

// ── CDN fallback (jsdelivr) ───────────────────────────────────────────────────

const CDN = 'https://cdn.jsdelivr.net/npm';

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const txt = await res.text();
    if (txt.trimStart().startsWith('<')) return null; // HTML error page
    return txt;
  } catch {
    return null;
  }
}

/**
 * Fetch package types from CDN.
 * Returns libPath as 'file:///node_modules/...' so TypeScript can resolve
 * bare module imports from models with 'file://' URIs (walks up to root).
 */
async function fetchPackageTypesFromCdn(pkg: string): Promise<{ libPath: string; content: string } | null> {
  const slug = toAtTypesSlug(pkg);

  // 1. @types/<slug>/index.d.ts
  const atTypesUrl = `${CDN}/@types/${slug}/index.d.ts`;
  const atTypesContent = await fetchText(atTypesUrl);
  if (atTypesContent) {
    console.log(`[TSPlugin] CDN hit: @types/${slug} (${atTypesContent.length} bytes)`);
    return {
      libPath: `file:///node_modules/@types/${slug}/index.d.ts`,
      content: atTypesContent,
    };
  }

  // 2. Package's own package.json → types/typings field
  const pkgJson = await fetchText(`${CDN}/${pkg}/package.json`);
  if (pkgJson) {
    try {
      const meta = JSON.parse(pkgJson) as { types?: string; typings?: string };
      const typesFile = meta.types ?? meta.typings;
      if (typesFile) {
        const file = typesFile.startsWith('./') ? typesFile.slice(2) : typesFile;
        const content = await fetchText(`${CDN}/${pkg}/${file}`);
        if (content) {
          console.log(`[TSPlugin] CDN hit: ${pkg}/${file} (${content.length} bytes)`);
          return {
            libPath: `file:///node_modules/${pkg}/${file}`,
            content,
          };
        }
      }
    } catch { /* bad json */ }
  }

  // 3. package/index.d.ts
  const indexDts = await fetchText(`${CDN}/${pkg}/index.d.ts`);
  if (indexDts) {
    console.log(`[TSPlugin] CDN hit: ${pkg}/index.d.ts (${indexDts.length} bytes)`);
    return {
      libPath: `file:///node_modules/${pkg}/index.d.ts`,
      content: indexDts,
    };
  }

  console.log(`[TSPlugin] CDN miss: ${pkg} (no @types/${slug}, no bundled types, no index.d.ts)`);
  return null;
}

/**
 * Strip .js / .mjs / .cjs extensions from relative import specifiers in .d.ts content.
 * @types/three v0.130+ uses `export * from "./src/Three.js"` — with TypeScript's
 * default node moduleResolution this does NOT resolve to ./src/Three.d.ts (it looks
 * for ./src/Three.js.d.ts which doesn't exist). Removing the extension lets TypeScript
 * probe ./src/Three.ts → ./src/Three.d.ts via its standard extension-probing chain.
 */
function normalizeDtsImports(content: string): string {
  return content.replace(/(['"])(\.\.?\/[^'"]+)\.[cm]?js\1/g, '$1$2$1');
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export interface TypeScriptPluginOptions {
  /**
   * Dodatkowe deklaracje wstrzykiwane przy starcie: mapa `ścieżka → treść`
   * (ścieżki w postaci `file:///node_modules/…` albo `/…`).
   *
   * Musi iść TĄ drogą, a nie osobnym `createModel`/`setExtraLibs` po stronie
   * aplikacji: `setExtraLibs` NADPISUJE całą listę (skasowałoby stuby i typy z
   * VFS), a tworzenie setek modeli trzyma worker TypeScriptu w wiecznym
   * doganianiu i IntelliSense przestaje odpowiadać w ogóle. Tu wszystko ląduje
   * w jednym magazynie i jednym wsadzie.
   */
  preloadDts?: () => Promise<Record<string, string>>;
}

export function createTypeScriptPlugin(
  provider: FileSystemProvider,
  options: TypeScriptPluginOptions = {},
): IPlugin {
  return {
    manifest: {
      id: 'builtin.typescript-intellisense',
      name: 'TypeScript IntelliSense',
      version: '1.0.0',
      description: 'TS completions from VFS node_modules + CDN fallback',
      contributes: [],
    },

    activate(api) {
      // ── Compiler options ────────────────────────────────────────────────────
      // Monaco's TypeScript defaults to `moduleResolution: classic`, which
      // does NOT walk into node_modules — bare imports like
      // `import x from 'some-pkg'` therefore resolve to `any` even when we
      // register the package's .d.ts files. We must explicitly switch to
      // NodeJs resolution so the type registry actually feeds completions.
      // Other options match a modern ESM TS 5.x project so the worker
      // happily reads our generated .d.ts (private fields with `#`, etc.).
      // Ustawienia kompilatora — razem z wyjaśnieniem, dlaczego nie ma wśród
      // nich `lib` — siedzą w `tsCompilerOptions.ts`, żeby dało się je sprawdzić
      // testem bez wczytywania Monaco.
      try {
        const options = buildCompilerOptions(monaco.languages.typescript);
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(options);
        // Plik `.js` obsługuje osobny zestaw ustawień. Bez tego samego
        // rozwiązywania modułów import z `node_modules` kończy się w nim
        // typem `any` — mimo że w sąsiednim `.ts` działa.
        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ ...options, checkJs: false });
      } catch (err) {
        console.warn('[TSPlugin] setCompilerOptions failed:', err);
      }

      // Disable Monaco's "tagged template strings" + similar diagnostics that
      // fire for purely cosmetic stuff in d.ts files registered on the fly.
      try {
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
          // Cannot find module errors are noisy when packages resolve through
          // our model registry rather than the worker's own resolver.
          diagnosticCodesToIgnore: [2307, 2792, 7016, 2691],
        });
      } catch { /* older Monaco — ignore */ }

      // ── State ────────────────────────────────────────────────────────────────
      const resolvedPkgs = new Set<string>();   // packages already resolved (VFS or CDN)
      const processedFiles = new Set<string>(); // VFS files already processed (VFS paths)
      let cdnHits = 0;
      let cdnMisses = 0;

      // Directory of the currently open file — used to plant CDN types adjacent to
      // the edited file so TypeScript's module resolution (which walks UP) finds them.
      let currentFileDir = '';

      // ── Type-definition model registry ───────────────────────────────────────
      // Use monaco.editor.createModel() instead of addExtraLib() / setExtraLibs().
      // createModel does NOT restart the TypeScript worker — it pushes model content
      // incrementally via the existing sync channel.  addExtraLib/setExtraLibs both
      // kill and restart the worker on every call, causing it to be perpetually busy
      // processing initialization work and unable to answer completion queries.
      //
      // TypeScript's module resolution checks monaco.editor.getModel(uri) for
      // file existence, so creating a model at file:///node_modules/@types/express/...
      // is exactly what TS needs to find bare-import types.
      //
      // The express stub is pre-registered at plugin activation — no worker restart.
      const EXPRESS_STUB = `declare module 'express' {
  interface Request {
    params: Record<string, string>;
    query: Record<string, string>;
    body: any;
    method: string;
    url: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
  }
  interface Response {
    send(body?: any): this;
    json(body?: any): this;
    status(code: number): this;
    sendStatus(code: number): this;
    redirect(url: string): this;
    set(field: string, value: string): this;
    end(): void;
  }
  interface NextFunction {
    (err?: any): void;
  }
  type Handler = (req: Request, res: Response, next: NextFunction) => void;
  interface Application {
    get(path: string, ...handlers: Handler[]): this;
    post(path: string, ...handlers: Handler[]): this;
    put(path: string, ...handlers: Handler[]): this;
    patch(path: string, ...handlers: Handler[]): this;
    all(path: string, ...handlers: Handler[]): this;
    use(...handlers: Handler[]): this;
    use(path: string | RegExp, ...handlers: Handler[]): this;
    listen(port: number, callback?: () => void): any;
    set(setting: string, val: any): this;
    enable(setting: string): this;
    disable(setting: string): this;
    locals: Record<string, any>;
    route(path: string): any;
    param(name: string, handler: any): this;
  }
  function express(): Application;
  namespace express {
    function Router(options?: any): any;
    function json(options?: any): Handler;
    function urlencoded(options?: any): Handler;
    function serveStatic(root: string, options?: any): Handler;
  }
  export = express;
}`;

      // ── @mhersztowski/minislib built-in stub ────────────────────────────────
      // Workspace package — not on npm/CDN. Pre-registered so Signal<T> completions
      // work in the Monaco editor without a CDN round-trip.
      const MINISLIB_STUB = `declare module '@mhersztowski/minislib' {
  class Connection {
    constructor(disconnectFn: () => void);
    disconnect(): void;
    get active(): boolean;
  }
  type Slot<T extends unknown[]> = (...args: T) => void;
  interface IConnectionOwner {
    _trackConnection(conn: Connection): void;
  }
  class Signal<T extends unknown[] = []> {
    connect(slot: Slot<T>, context?: IConnectionOwner): Connection;
    emit(...args: T): void;
    blockSignals(blocked: boolean): void;
    get blocked(): boolean;
    get connectionCount(): number;
    disconnectAll(): void;
  }
  class MObject implements IConnectionOwner {
    objectName: string;
    readonly destroyed: Signal<[obj: MObject]>;
    constructor(parent?: MObject, objectName?: string);
    get parent(): MObject | null;
    get children(): readonly MObject[];
    setParent(parent: MObject | null): void;
    get root(): MObject;
    findChild<T extends MObject = MObject>(name: string): T | null;
    findChildren<T extends MObject = MObject>(predicate?: (obj: MObject) => boolean): T[];
    connect<T extends unknown[]>(signal: Signal<T>, slot: Slot<T>): Connection;
    _trackConnection(conn: Connection): void;
    get isDestroyed(): boolean;
    destroy(): void;
  }
  class MProperty<T> {
    readonly changed: Signal<[newValue: T, oldValue: T]>;
    constructor(initialValue: T, validator?: (v: T) => boolean);
    get value(): T;
    set value(next: T);
    setSilent(next: T): void;
    bindTo(source: MProperty<T>, context?: MObject): void;
    toString(): string;
  }
  type TimerMode = 'interval' | 'singleShot';
  class MTimer extends MObject {
    readonly timeout: Signal<[]>;
    constructor(parent?: MObject);
    start(intervalMs: number): void;
    startSingleShot(ms: number): void;
    stop(): void;
    restart(): void;
    get active(): boolean;
    get intervalMs(): number;
    get mode(): TimerMode;
    static create(intervalMs: number, parent?: MObject): MTimer;
    static singleShot(ms: number, parent?: MObject): MTimer;
  }
  class MEventBus extends MObject {
    constructor(parent?: MObject);
    publish<T = unknown>(topic: string, payload: T): void;
    subscribe<T = unknown>(topic: string, slot: (payload: T) => void, context?: IConnectionOwner): Connection;
    subscribeAll(slot: (topic: string, payload: unknown) => void, context?: IConnectionOwner): Connection;
    clearTopic(topic: string): void;
    clearAll(): void;
    get activeTopics(): string[];
    static global(): MEventBus;
    static resetGlobal(): void;
  }
  class MState extends MObject {
    readonly id: string;
    readonly entered: Signal<[from: MState | null]>;
    readonly exited: Signal<[to: MState]>;
    onEnter?: (from: MState | null) => void;
    onExit?: (to: MState) => void;
    constructor(id: string, parent?: MObject);
  }
  interface TransitionDef<TEvent = void> {
    from: string; to: string; event: string;
    guard?: (event: TEvent) => boolean;
    action?: (event: TEvent) => void;
  }
  class MStateMachine extends MObject {
    readonly stateChanged: Signal<[next: MState, prev: MState | null]>;
    readonly transitionFailed: Signal<[event: string, from: string]>;
    constructor(parent?: MObject);
    addState(idOrState: string | MState): MState;
    addTransition<TEvent = void>(def: TransitionDef<TEvent>): void;
    start(initialStateId: string): void;
    stop(): void;
    send<TEvent = void>(event: string, payload?: TEvent): boolean;
    get currentState(): MState | null;
    get currentStateId(): string | null;
    is(stateId: string): boolean;
    get started(): boolean;
    state(id: string): MState | undefined;
    get states(): readonly MState[];
  }
  abstract class MCommand {
    abstract readonly description: string;
    abstract execute(): void;
    abstract undo(): void;
    mergeWith(_prev: MCommand): boolean;
  }
  class MFnCommand extends MCommand {
    readonly description: string;
    constructor(description: string, executeFn: () => void, undoFn: () => void);
    execute(): void;
    undo(): void;
    static create(description: string, executeFn: () => void, undoFn: () => void): MFnCommand;
  }
  class MCommandStack extends MObject {
    readonly changed: Signal<[]>;
    readonly canUndoChanged: Signal<[canUndo: boolean]>;
    readonly canRedoChanged: Signal<[canRedo: boolean]>;
    constructor(parent?: MObject, options?: { maxSize?: number });
    push(cmd: MCommand): void;
    undo(): boolean;
    redo(): boolean;
    clear(): void;
    get canUndo(): boolean;
    get canRedo(): boolean;
    get undoDescription(): string | null;
    get redoDescription(): string | null;
    get undoStackSize(): number;
    get redoStackSize(): number;
  }
  class MListModel<T> extends MObject {
    readonly rowsInserted: Signal<[index: number, count: number]>;
    readonly rowsRemoved: Signal<[index: number, count: number]>;
    readonly rowsMoved: Signal<[from: number, to: number, count: number]>;
    readonly dataChanged: Signal<[index: number, item: T]>;
    readonly modelReset: Signal<[]>;
    constructor(initialItems?: T[], parent?: MObject);
    get(index: number): T;
    getOrUndefined(index: number): T | undefined;
    get count(): number;
    get isEmpty(): boolean;
    indexOf(item: T): number;
    contains(item: T): boolean;
    toArray(): T[];
    find(predicate: (item: T) => boolean): T | undefined;
    filter(predicate: (item: T) => boolean): T[];
    append(...items: T[]): void;
    prepend(...items: T[]): void;
    insert(index: number, ...items: T[]): void;
    set(index: number, item: T): void;
    remove(index: number, count?: number): void;
    removeItem(item: T): boolean;
    move(fromIndex: number, toIndex: number, count?: number): void;
    clear(): void;
    reset(items: T[]): void;
    sort(compareFn?: (a: T, b: T) => number): void;
    [Symbol.iterator](): Iterator<T>;
    forEach(cb: (item: T, index: number) => void): void;
    map<U>(cb: (item: T, index: number) => U): U[];
  }
  type LogLevel = 'debug' | 'info' | 'warn' | 'error';
  interface LogRecord { level: LogLevel; category: string; message: string; data?: unknown; timestamp: number; }
  class MLogger extends MObject {
    readonly category: string;
    readonly logged: Signal<[record: LogRecord]>;
    constructor(category: string, parent?: MObject, options?: { minLevel?: LogLevel });
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
    setMinLevel(level: LogLevel): void;
    get minLevel(): LogLevel;
    static root(): MLogger;
    static silenceConsole(): void;
    static resetRoot(): void;
  }
  function debounce<T extends unknown[]>(fn: (...args: T) => void, delayMs: number, context?: MObject): (...args: T) => void;
  function throttle<T extends unknown[]>(fn: (...args: T) => void, intervalMs: number, context?: MObject): (...args: T) => void;
  function promiseToSignals<T>(promise: Promise<T>, context?: MObject): { resolved: Signal<[value: T]>; rejected: Signal<[error: unknown]> };
  function connectOnce<T extends unknown[]>(signal: Signal<T>, slot: (...args: T) => void, context?: MObject): void;
}`;

      resolvedPkgs.add('@mhersztowski/minislib');

      // ── DTS extra-lib store ────────────────────────────────────────────────
      // .d.ts type definition files are accumulated here and pushed to Monaco's
      // TypeScript service via a single debounced setExtraLibs() call.
      //
      // Why not createModel()?  For packages like @types/three with 900+ .d.ts
      // files, calling createModel('typescript') 900 times triggers 900 incremental
      // TypeScript worker syncs in rapid succession — the worker is perpetually
      // catching up and never settles to answer completion queries.
      //
      // setExtraLibs() causes ONE worker restart.  All files are committed in that
      // single batch; after restart the worker is idle and IntelliSense works.
      const dtsLibStore = new Map<string, string>(); // filePath → content
      let dtsFlushTimer: ReturnType<typeof setTimeout> | null = null;

      function scheduleDtsFlush() {
        if (dtsFlushTimer) clearTimeout(dtsFlushTimer);
        dtsFlushTimer = setTimeout(() => {
          dtsFlushTimer = null;
          const libs = Array.from(dtsLibStore.entries())
            .map(([filePath, content]) => ({ content, filePath }));
          monaco.languages.typescript.typescriptDefaults.setExtraLibs(libs);
          console.log(`[TSPlugin] setExtraLibs: ${libs.length} type definition files`);
        }, 200);
      }

      function registerDtsLib(rawPath: string, content: string) {
        let filePath: string;
        if (rawPath.startsWith('file://')) {
          filePath = rawPath;
        } else if (rawPath.startsWith('/')) {
          filePath = 'file://' + rawPath;
        } else {
          filePath = 'file:///ts-ambient/' + rawPath.replace(/[^a-zA-Z0-9._-]/g, '_');
        }
        if (dtsLibStore.has(filePath)) return;
        // Normalize .js→(no ext) in relative imports so TypeScript's node module
        // resolution finds the corresponding .d.ts via its extension-probing chain.
        dtsLibStore.set(filePath, normalizeDtsImports(content));
        scheduleDtsFlush();
      }

      // Pre-register built-in stubs via the same batch mechanism.
      dtsLibStore.set('file:///ts-ambient/express-stub.d.ts', EXPRESS_STUB);
      dtsLibStore.set('file:///ts-ambient/minislib-stub.d.ts', MINISLIB_STUB);
      scheduleDtsFlush();
      console.log('[TSPlugin] express + minislib stubs queued');

      // Deklaracje dostarczone przez aplikację (np. pełne @types/three w cad-app)
      // — jeden magazyn, jeden wsad, jeden restart workera.
      if (options.preloadDts) {
        void options.preloadDts()
          .then((files) => {
            const entries = Object.entries(files);
            for (const [path, content] of entries) registerDtsLib(path, content);
            console.log(`[TSPlugin] preloadDts: ${entries.length} plików deklaracji z aplikacji`);
          })
          .catch((e: unknown) => {
            console.warn('[TSPlugin] preloadDts nie powiodło się:', e);
          });
      }

      // Track which lib URIs have already been registered to avoid duplicate models.
      // Used only for source files (.ts/.tsx/.js) — .d.ts files use dtsLibStore.
      const createdLibModels = new Set<string>();

      /**
       * Register a TypeScript/JS SOURCE file as a Monaco model so the TS service
       * can resolve relative imports between project files.
       * Only called for non-.d.ts files; .d.ts files go through registerDtsLib().
       */
      function registerLib(libPath: string, content: string) {
        let uriStr: string;
        if (libPath.startsWith('file://')) {
          uriStr = libPath;
        } else if (libPath.startsWith('/')) {
          uriStr = 'file://' + libPath;
        } else {
          uriStr = 'file:///ts-ambient/' + libPath.replace(/[^a-zA-Z0-9._-]/g, '_');
        }
        if (createdLibModels.has(uriStr)) return;
        createdLibModels.add(uriStr);
        const uri = monaco.Uri.parse(uriStr);
        if (!monaco.editor.getModel(uri)) {
          monaco.editor.createModel(content, 'typescript', uri);
        }
      }

      // ── VFS read (uses VFS paths, e.g. '/home/foo/bar.ts') ──────────────────
      async function readVfs(vfsPath: string): Promise<string | null> {
        try {
          return new TextDecoder().decode(await provider.readFile(vfsPath));
        } catch {
          return null;
        }
      }

      /** Walk up from VFS dir to find the nearest node_modules directory. */
      async function findNodeModulesDir(startDir: string): Promise<string | null> {
        const parts = startDir.split('/').filter(Boolean);
        for (let i = parts.length; i >= 1; i--) {
          const candidate = '/' + parts.slice(0, i).join('/') + '/node_modules';
          try {
            await provider.stat(candidate);
            return candidate;
          } catch { /* not found, go up */ }
        }
        return null;
      }

      /**
       * Recursively walk a VFS package directory and register every .d.ts file as a
       * Monaco model. Required for packages like @types/three where types span 900+
       * files with relative imports — Monaco's TS worker needs each file registered
       * individually so TypeScript's module resolution can follow the import graph.
       */
      async function registerAllDtsInDir(dir: string): Promise<void> {
        let entries: Awaited<ReturnType<typeof provider.readDirectory>>;
        try {
          entries = await provider.readDirectory(dir);
        } catch {
          return;
        }
        await Promise.allSettled(
          entries.map(async ({ name, type }) => {
            const fullPath = `${dir}/${name}`;
            if (type === 2 /* FileType.Directory */ && name !== 'node_modules') {
              await registerAllDtsInDir(fullPath);
            } else if (type === 1 /* FileType.File */ && name.endsWith('.d.ts')) {
              const uri = vfsPathToUri(fullPath);
              if (dtsLibStore.has(uri)) return;
              const content = await readVfs(fullPath);
              if (content) registerDtsLib(uri, content);
            }
          }),
        );
      }

      /**
       * Load package types from VFS node_modules.
       * Registers at 'file:///node_modules/...' so TypeScript resolves bare imports.
       */
      async function loadPkgTypesFromVfs(pkg: string, nodeModulesDir: string): Promise<boolean> {
        const slug = toAtTypesSlug(pkg);

        for (const pkgDir of [`${nodeModulesDir}/@types/${slug}`, `${nodeModulesDir}/${pkg}`]) {
          const pkgJsonPath = `${pkgDir}/package.json`;
          const pkgJsonContent = await readVfs(pkgJsonPath);
          if (!pkgJsonContent) continue;

          let typesFile: string | null = null;
          try {
            const meta = JSON.parse(pkgJsonContent) as {
              types?: string;
              typings?: string;
              exports?: Record<string, unknown>;
            };
            typesFile = meta.types ?? meta.typings ?? null;

            // Support exports map for packages that declare types only via
            // exports['.'].types (e.g. three v0.182 has no root types/typings field).
            if (!typesFile && meta.exports) {
              const mainExport = meta.exports['.'];
              if (mainExport && typeof mainExport === 'object') {
                const m = mainExport as Record<string, unknown>;
                typesFile =
                  (typeof m.types === 'string' ? m.types : null) ??
                  (typeof m.typings === 'string' ? m.typings : null) ??
                  (m.import && typeof (m.import as Record<string, string>).types === 'string'
                    ? (m.import as Record<string, string>).types : null) ??
                  (m.require && typeof (m.require as Record<string, string>).types === 'string'
                    ? (m.require as Record<string, string>).types : null);
              }
            }
          } catch { /* bad json */ }

          // Verify there's a reachable .d.ts entry in this package directory.
          const normalized = typesFile
            ? (typesFile.startsWith('./') ? typesFile.slice(2) : typesFile)
            : 'index.d.ts';
          const entryPath = `${pkgDir}/${normalized}`;
          const hasEntry =
            (await readVfs(entryPath)) !== null ||
            (normalized !== 'index.d.ts' && (await readVfs(`${pkgDir}/index.d.ts`)) !== null);
          if (!hasEntry) continue;

          // Register package.json as a Monaco model so TypeScript's module resolver
          // can read the 'types' field when it encounters a bare import specifier.
          const pkgJsonUri = vfsPathToUri(pkgJsonPath);
          if (!createdLibModels.has(pkgJsonUri)) {
            createdLibModels.add(pkgJsonUri);
            const pkgJsonMonacoUri = monaco.Uri.parse(pkgJsonUri);
            if (!monaco.editor.getModel(pkgJsonMonacoUri)) {
              monaco.editor.createModel(pkgJsonContent, 'json', pkgJsonMonacoUri);
            }
          }

          // Register ALL .d.ts files in the package — not just the entry point.
          // TypeScript resolves relative imports inside .d.ts files through Monaco
          // models, so every file the type graph references must be registered.
          // (e.g. @types/three has 900+ files; loading only index.d.ts leaves all
          // relative re-exports unresolvable and kills IntelliSense.)
          console.log(`[TSPlugin] VFS types: scanning all .d.ts in ${pkgDir}`);
          await registerAllDtsInDir(pkgDir);
          return true;
        }
        return false;
      }

      /** Resolve types for an npm package: VFS node_modules first, CDN fallback. */
      async function resolvePackage(pkg: string, nodeModulesDir: string | null): Promise<void> {
        if (resolvedPkgs.has(pkg)) return;
        resolvedPkgs.add(pkg);

        if (nodeModulesDir) {
          const found = await loadPkgTypesFromVfs(pkg, nodeModulesDir);
          if (found) return;
        }

        // CDN fallback
        const result = await fetchPackageTypesFromCdn(pkg);
        if (result) {
          cdnHits++;

          // Strategy 1 — root node_modules (may or may not be found by TS resolver).
          registerLib(result.libPath, result.content);

          // Strategy 2 — file-adjacent node_modules.
          // TypeScript's module resolution starts at the importing file's directory
          // and walks UP looking for node_modules/. Monaco may not traverse all the
          // way to the URI root (file:///), so we also plant the types right next to
          // the file being edited. This guarantees the resolver finds them on the very
          // first lookup.
          if (currentFileDir) {
            const fileLocalPath = result.libPath.replace(
              'file:///node_modules/',
              `file://${currentFileDir}/node_modules/`,
            );
            if (fileLocalPath !== result.libPath) {
              registerLib(fileLocalPath, result.content);
            }
          }

          // Strategy 3 — ambient `declare module 'X' { ... }` declaration.
          // Found by TypeScript globally without any file-path resolution, so it
          // works even if both path strategies above fail.
          // Use file:/// scheme (not ts:///) so Monaco's TS host recognises the file.
          const modName = ambientModuleName(pkg);
          if (modName) {
            const safeKey = modName.replace(/[/@]/g, '-');
            registerLib(`file:///ambient-${safeKey}.d.ts`, wrapAsAmbientModule(modName, result.content));
          }

          // Recursively resolve package-level imports and /// <reference types="..." />
          const pkgImports = [
            ...extractSpecifiers(result.content).filter(s => !s.startsWith('.')),
            ...extractTypeReferences(result.content),
          ];
          await Promise.allSettled(
            pkgImports
              .filter(s => !s.startsWith('node:') && !s.startsWith('bun:'))
              .map(s => resolvePackage(pkgNameFrom(s), nodeModulesDir)),
          );
        } else {
          cdnMisses++;
        }
      }

      /**
       * Add a local VFS file as an extra lib so TypeScript can resolve relative imports.
       * Uses 'file://' URI so paths match those TypeScript resolves from editing models.
       * Skips files already open as Monaco models (they're already in the TS service).
       */
      async function addVfsFile(vfsPath: string, nodeModulesDir: string | null, visited: Set<string>): Promise<void> {
        if (visited.has(vfsPath) || processedFiles.has(vfsPath)) return;
        visited.add(vfsPath);

        const content = await readVfs(vfsPath);
        if (!content) return;

        processedFiles.add(vfsPath);

        // .d.ts files go through the batch setExtraLibs mechanism; source files
        // become individual Monaco models so the TS worker can resolve relative imports.
        const modelUri = vfsPathToUri(vfsPath);
        if (vfsPath.endsWith('.d.ts')) {
          registerDtsLib(modelUri, content);
        } else {
          const monacoUri = monaco.Uri.parse(modelUri);
          if (!monaco.editor.getModel(monacoUri)) {
            registerLib(modelUri, content);
          }
        }

        await resolveImports(vfsPath, content, nodeModulesDir, visited);
      }

      // ── `mycastle/…` imports: resolve against the backend monorepo source ────
      // The editor can't reach the monorepo filesystem, so we fetch source files
      // from GET /api/mycastle-src and register them under
      // file:///node_modules/mycastle/<repoRel> — that path lets TypeScript's node
      // resolution satisfy `import 'mycastle/packages/…/index.ts'`.
      const mcAuthHeaders = (): Record<string, string> => {
        try {
          const raw = localStorage.getItem('minis_current_user');
          const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch { return {}; }
      };
      const fetchMycastleSrc = async (repoRel: string): Promise<string | null> => {
        try {
          const u = new URL('/api/mycastle-src', window.location.origin);
          u.searchParams.set('path', repoRel);
          const r = await fetch(u.pathname + u.search, { headers: mcAuthHeaders() });
          return r.ok ? await r.text() : null;
        } catch { return null; }
      };
      const joinRepo = (dir: string, spec: string): string => {
        const out: string[] = [];
        for (const p of `${dir ? dir + '/' : ''}${spec}`.split('/')) {
          if (p === '..') out.pop();
          else if (p !== '.' && p !== '') out.push(p);
        }
        return out.join('/');
      };
      async function resolveMycastleFile(repoRel: string, visited: Set<string>): Promise<void> {
        repoRel = repoRel.replace(/^\/+/, '');
        const key = `mc:${repoRel}`;
        if (visited.has(key)) return;
        visited.add(key);
        const hasExt = /\.(d\.ts|ts|tsx|js|jsx|mts|cts|json)$/i.test(repoRel);
        const candidates = hasExt
          ? [repoRel]
          : [`${repoRel}.ts`, `${repoRel}.tsx`, `${repoRel}/index.ts`, `${repoRel}/index.tsx`, `${repoRel}.d.ts`, `${repoRel}.js`];
        for (const c of candidates) {
          const content = await fetchMycastleSrc(c);
          if (content === null) continue;
          const modelUri = `file:///node_modules/mycastle/${c}`;
          if (c.endsWith('.d.ts')) registerDtsLib(modelUri, content);
          else registerLib(modelUri, content);
          const dir = c.split('/').slice(0, -1).join('/');
          await Promise.allSettled(extractSpecifiers(content).map(async (spec) => {
            if (spec.startsWith('.')) await resolveMycastleFile(joinRepo(dir, spec), visited);
            else if (spec.startsWith('mycastle/')) await resolveMycastleFile(spec.slice('mycastle/'.length), visited);
          }));
          return;
        }
      }

      /** Resolve all imports found in a file (receives VFS path). */
      async function resolveImports(
        currentVfsPath: string,
        code: string,
        nodeModulesDir: string | null,
        visited = new Set<string>(),
      ): Promise<void> {
        const specifiers = extractSpecifiers(code);

        await Promise.allSettled(specifiers.map(async (spec) => {
          if (spec.startsWith('.')) {
            // Relative import — load from VFS
            const resolved = resolvePath(currentVfsPath, spec);
            const candidates = [
              `${resolved}.ts`, `${resolved}.tsx`,
              `${resolved}/index.ts`, `${resolved}/index.tsx`,
              `${resolved}.d.ts`, resolved,
            ];
            for (const c of candidates) {
              if (!processedFiles.has(c) && (await readVfs(c)) !== null) {
                await addVfsFile(c, nodeModulesDir, visited);
                break;
              }
            }
          } else if (spec === 'mycastle' || spec.startsWith('mycastle/')) {
            // MyCastle monorepo source (fetched from the backend).
            await resolveMycastleFile(spec.replace(/^mycastle\/?/, ''), visited);
          } else if (!spec.startsWith('node:') && !spec.startsWith('bun:')) {
            // npm package
            await resolvePackage(pkgNameFrom(spec), nodeModulesDir);
          }
        }));
      }

      /** Load types for all deps listed in the nearest package.json. */
      async function loadAllPackageJsonDeps(fileDir: string, nodeModulesDir: string | null): Promise<void> {
        const parts = fileDir.split('/').filter(Boolean);
        for (let i = parts.length; i >= 0; i--) {
          const pkgPath = (i === 0 ? '' : '/' + parts.slice(0, i).join('/')) + '/package.json';
          const content = await readVfs(pkgPath);
          if (!content) continue;
          try {
            const pkg = JSON.parse(content) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
            await Promise.allSettled(deps.map(dep => resolvePackage(dep, nodeModulesDir)));
          } catch { /* bad json */ }
          break;
        }
      }

      // ── Handle file open ─────────────────────────────────────────────────────
      /**
       * Called with the model URI (e.g. 'file:///home/foo/index.ts').
       * Converts to VFS path for provider operations.
       * Does NOT register the file itself as extra lib — Monaco has it as a model.
       */
      /**
       * Typy Node — `process`, `Buffer`, `fs`, `path` i reszta modułów wbudowanych.
       *
       * Ładowane **raz na sesję i tylko dla plików, które na nie wskazują**:
       * `@types/node` to kilkadziesiąt plików spiętych dyrektywami
       * `/// <reference path="…" />`, a plik czysto przeglądarkowy nie ma powodu
       * ich ściągać. Samo `index.d.ts` nie wystarczy — deklaruje prawie nic,
       * a `fs` i `path` mieszkają w plikach obok.
       *
       * Najpierw `node_modules` projektu: jeśli użytkownik zrobił `npm install`,
       * ma tam wersję zgodną ze swoim kodem. Dopiero potem CDN.
       */
      let nodeTypesState: 'brak' | 'ładowanie' | 'gotowe' = 'brak';
      async function ensureNodeTypes(nodeModulesDir: string | null): Promise<void> {
        if (nodeTypesState !== 'brak') return;
        nodeTypesState = 'ładowanie';
        try {
          if (nodeModulesDir && await loadPkgTypesFromVfs('node', nodeModulesDir)) {
            console.log('[TSPlugin] typy Node z node_modules projektu');
            nodeTypesState = 'gotowe';
            return;
          }
          await loadNodeTypesFromCdn();
          nodeTypesState = 'gotowe';
        } catch (err) {
          // Kolejny plik może mieć więcej szczęścia (sieć wróci, projekt dostanie
          // node_modules), więc nie zostawiamy stanu „gotowe" po nieudanej próbie.
          nodeTypesState = 'brak';
          console.warn('[TSPlugin] nie udało się wczytać typów Node:', err);
        }
      }

      /**
       * Pobiera `@types/node` z CDN, idąc po dyrektywach referencji.
       *
       * Limit plików jest zabezpieczeniem, nie oszczędnością: gdyby paczka
       * kiedyś zapętliła referencje, pętla bez granicy zawiesiłaby edytor.
       * Cały zbiór to dziś 83 pliki (~2,4 MB), więc granica jest nad nim,
       * a nie w poprzek — inaczej ucięłaby typy w losowym miejscu.
       */
      async function loadNodeTypesFromCdn(): Promise<void> {
        const BASE = '/node_modules/@types/node';
        const doPobrania = ['index.d.ts'];
        const pobrane = new Set<string>();
        let licznik = 0;

        while (doPobrania.length > 0 && licznik < 200) {
          const rel = doPobrania.shift()!;
          const vfsPath = `${BASE}/${rel}`;
          if (pobrane.has(vfsPath)) continue;
          pobrane.add(vfsPath);
          licznik++;

          const content = await fetchText(`${CDN}/@types/node/${rel}`);
          if (!content) continue;
          registerDtsLib(`file://${vfsPath}`, content);

          for (const ref of extractReferencePaths(content)) {
            const target = resolveReference(vfsPath, ref);
            if (!target.startsWith(BASE)) continue;   // paczka nie sięga poza siebie
            const targetRel = target.slice(BASE.length + 1);
            if (!pobrane.has(target)) doPobrania.push(targetRel);
          }
        }
        console.log(`[TSPlugin] typy Node z CDN: ${pobrane.size} plików`);
      }

      async function handleFile(modelUri: string, code: string): Promise<void> {
        const vfsPath = uriToVfsPath(modelUri);
        const ext = vfsPath.split('.').pop()?.toLowerCase();
        if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mts', 'cts'].includes(ext)) return;

        const fileDir = dirOf(vfsPath);
        // Track the current file's directory so resolvePackage can plant CDN types
        // right next to the file (file-adjacent node_modules strategy).
        currentFileDir = fileDir;
        const modelLang = monaco.editor.getModel(monaco.Uri.parse(modelUri))?.getLanguageId() ?? 'no-model';
        console.log(`[TSPlugin] handleFile start: ${vfsPath} | lang=${modelLang}`);
        const nodeModulesDir = await findNodeModulesDir(fileDir);
        console.log(`[TSPlugin] nodeModulesDir: ${nodeModulesDir ?? 'none (CDN fallback)'} | fileDir: ${fileDir}`);

        await resolveImports(vfsPath, code, nodeModulesDir);
        await loadAllPackageJsonDeps(fileDir, nodeModulesDir);

        // Skrypty w Drive uruchamia Node, więc `process` czy `fs` są tu na
        // porządku dziennym — ale typy ściągamy dopiero, gdy plik ich używa.
        if (needsNodeTypes(code, extractSpecifiers(code))) {
          await ensureNodeTypes(nodeModulesDir);
        }

        // .d.ts files are batched into dtsLibStore and flushed via a single debounced
        // setExtraLibs() call (one worker restart, all 900+ files committed at once).
        // Source files (.ts/.tsx) are registered as individual Monaco models so the TS
        // worker can follow relative imports between project files without restarting.

        console.log(`[TSPlugin] handleFile done: ${vfsPath} | pkgs: ${resolvedPkgs.size} | CDN hits: ${cdnHits} misses: ${cdnMisses} | dts: ${dtsLibStore.size} | models: ${createdLibModels.size}`);

        // ── Diagnostic probe (fire-and-forget, does not block completions) ────
        void (async () => {
          try {
            const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
            const proxy = await Promise.race([
              getWorker(monaco.Uri.parse(modelUri)),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]);
            const diags = await proxy.getSemanticDiagnostics(modelUri);
            if (diags.length === 0) {
              console.log(`[TSPlugin:diag] ✓ NO ERRORS for ${vfsPath}`);
            } else {
              console.log(`[TSPlugin:diag] ✗ ${diags.length} errors in ${vfsPath}:`,
                diags.map(d => ({
                  code: d.code,
                  msg: typeof d.messageText === 'string' ? d.messageText : (d.messageText as { messageText: string }).messageText,
                })));
            }
          } catch (e) {
            console.log(`[TSPlugin:diag] probe failed (${(e as Error).message}) — worker still initializing`);
          }
        })();
      }

      // Switch .js/.jsx models to TypeScript language service at model creation time.
      // Using onDidCreateModel (not onDidOpenDocument) because the model is guaranteed
      // to exist at this point. The JS language service worker hangs after many
      // addExtraLib calls; the TS worker handles them reliably.
      monaco.editor.onDidCreateModel((model) => {
        const uri = model.uri.toString();
        const lower = uri.toLowerCase();
        if ((lower.endsWith('.js') || lower.endsWith('.jsx')) && model.getLanguageId() === 'javascript') {
          monaco.editor.setModelLanguage(model, 'typescript');
          console.log(`[TSPlugin] onDidCreateModel: switched ${uri} → typescript`);
        }
      });

      api.editor.onDidOpenDocument((uri, text) => {
        handleFile(uri, text).catch(() => {});
      });

      let currentUri = '';
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      api.editor.onDidChangeModel((uri) => { currentUri = uri; });

      api.editor.onDidChangeContent((text) => {
        if (!currentUri) return;
        const ext = currentUri.split('.').pop()?.toLowerCase() ?? '';
        if (ext !== 'ts' && ext !== 'tsx' && ext !== 'js' && ext !== 'jsx') return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          debounceTimer = null;
          const vfsPath = uriToVfsPath(currentUri);
          const nodeModulesDir = await findNodeModulesDir(dirOf(vfsPath)).catch(() => null);
          resolveImports(vfsPath, text, nodeModulesDir).catch(() => {});
        }, 1500);
      });

      api.logger.info('TypeScript IntelliSense activated (VFS node_modules + CDN fallback)');
    },
  };
}
