/**
 * What the editor needs from its host, and what it does without.
 *
 * The blocks that reach for files — the file and code pickers, the info marks,
 * the embed and file-reference blocks — did it in MyCastle by calling
 * `useMqtt()` straight from the application. That is the one thing this package
 * must not do: it would tie an editor to a transport, and a second host with a
 * different file store could not use it at all.
 *
 * So the host supplies an `EditorFiles`, and the rule is the one
 * `core-ui/src/drive/capabilities.ts` already set: **no provider means the
 * feature is not there at all** — no button, no picker, no dialog explaining
 * that files are unavailable. A picker that cannot list anything is worse than
 * no picker, because it promises something.
 *
 * The interface is deliberately three operations wide. That is not a guess at
 * what an editor might want; it is exactly what the ported blocks call, counted
 * across every one of them.
 */

import { createContext, createElement, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DirectoryTree, FileData, PersonNode, ProjectNode, TaskNode } from '@hestia/core';

export interface EditorFiles {
    /** Reads a file. The path is relative to the host's root, `/` between segments. */
    readFile(path: string): Promise<FileData>;
    /** Writes a file, creating it if it is not there. */
    writeFile(path: string, content: string): Promise<FileData>;
    /** The tree under `path`; the root when `path` is absent. */
    listDirectory(path?: string): Promise<DirectoryTree>;
}

const EditorFilesContext = createContext<EditorFiles | null>(null);

export interface EditorFilesProviderProps {
    /** `null` is a legitimate value: the host has no file store, so the blocks that need one do not appear. */
    files: EditorFiles | null;
    children: ReactNode;
}

export function EditorFilesProvider({ files, children }: EditorFilesProviderProps) {
    return createElement(EditorFilesContext.Provider, { value: files }, children);
}

/**
 * The host's file store, or `null` when there is none.
 *
 * Callers check. They do not fall back to an empty implementation: an empty
 * list looks like an empty drive, and a user cannot tell that apart from a
 * drive that was never connected.
 */
export function useEditorFiles(): EditorFiles | null {
    return useContext(EditorFilesContext);
}

/**
 * Who is signed in, from the host's point of view.
 *
 * The blocks that need this need very little of it: a name to build a drive URL
 * from, and a token to put in an `Authorization` header. They do not need the
 * account, its settings or the sign-in flow — so none of that crosses over.
 *
 * `null` for either is a real state, not an error: a host with no accounts at
 * all is a legitimate host, and the blocks that would have used the name simply
 * do not offer what they cannot address.
 */
export interface EditorSession {
    /** The signed-in user's name, or `null` when nobody is. */
    userName: string | null;
    /** A bearer token for the host's API, or `null` when it needs none. */
    token: string | null;
    /** Only one block asks, and only to show an extra entry. */
    isAdmin?: boolean;
}

const EditorSessionContext = createContext<EditorSession | null>(null);

export interface EditorSessionProviderProps {
    session: EditorSession | null;
    children: ReactNode;
}

export function EditorSessionProvider({ session, children }: EditorSessionProviderProps) {
    return createElement(EditorSessionContext.Provider, { value: session }, children);
}

export function useEditorSession(): EditorSession | null {
    return useContext(EditorSessionContext);
}

/**
 * Spell checking. One extension asks, and it asks one thing.
 *
 * Absent means the extension marks nothing — not that it marks everything as
 * correct. Those look the same on screen and are not the same claim, which is
 * why there is no default implementation returning an empty list.
 */
export interface SpellMatch {
    /** Byte offset into the checked text where the issue starts. */
    offset: number;
    /** Number of bytes the issue spans. */
    length: number;
    /** Human-readable explanation (long form). */
    message: string;
    /** Short label, e.g. "Spelling mistake". */
    shortMessage?: string;
    /** Suggested replacements, ordered by confidence (best first). */
    replacements: string[];
    /** Issue category — 'TYPOS' / 'GRAMMAR' / 'STYLE' / 'PUNCTUATION' / … */
    category: string;
    /** Internal rule id (useful for "ignore this rule" UX). */
    ruleId: string;
}

export interface EditorSpellChecker {
    checkSpelling(text: string, language: string): Promise<SpellMatch[]>;
}

/**
 * Resolving a knowledge-base reference to the block it points at.
 *
 * The editor knows that `[[id]]` is a reference and how to draw the tooltip; it
 * does not know where the knowledge base lives or how it is indexed. That is
 * the host's, and in MyCastle it meant walking the drive.
 */
export interface ResolvedKnowledgeRef {
    /** The target block's body — the tooltip is built from it. */
    code?: string;
    kind?: string;
    /** The document's path in the base, relative to `knowledge/`. */
    path: string;
    documentTitle?: string;
}

export interface KnowledgeRefs {
    resolve(id: string): Promise<ResolvedKnowledgeRef | undefined>;
}

/**
 * Round-tripping between a UML diagram and source code.
 *
 * Both directions are the host's API call, not the editor's: the editor has the
 * diagram and shows the result, and knows nothing about repositories, commits
 * or where the code is checked out.
 */
export interface UmlCodeSync {
    syncUmlFromCode<P = unknown>(
        userName: string, dir: string, project?: P, name?: string, files?: string[],
    ): Promise<{
        project: P;
        changes: Array<{ kind: string; target: string; symbol?: string; member?: string; from?: string; to?: string }>;
        summary: string;
        committed: boolean;
    }>;
    generateCodeFromUml<D = unknown>(
        userName: string,
        diagram: D,
        language?: 'typescript' | 'javascript' | 'python' | 'c' | 'cpp',
    ): Promise<{ files: Array<{ file: string; content: string }> }>;
}

/**
 * Everything else the host can supply, in one context.
 *
 * Separate from `EditorFiles` because files are what most blocks want and these
 * are what one block each wants; a host that has files and nothing else should
 * not have to name four nulls.
 */
export interface EditorServices {
    spellChecker?: EditorSpellChecker | null;
    knowledgeRefs?: KnowledgeRefs | null;
    umlCodeSync?: UmlCodeSync | null;
    /** See `ModelWorkerFactory`, declared below. */
    modelWorkerFactory?: ModelWorkerFactory | null;
    /** See `EditorForms`, declared below. */
    forms?: EditorForms | null;
    /**
     * The Plugin Script reference, as Markdown, for the help dialog. MyCastle
     * bundled `docs/MDScript.md` with Vite's `?raw`; a package cannot reach out
     * of itself for a repository file, so the host passes the text.
     */
    mdScriptDocs?: string | null;
    /** See `EditorCommandBus`, declared below. */
    commandBus?: EditorCommandBus | null;
    /** See `EditorScriptTemplates`, declared below. */
    scriptTemplates?: EditorScriptTemplates | null;
    /** See `EditorScriptHost`, declared below. */
    scriptHost?: EditorScriptHost | null;
    /**
     * See `EditorScriptRunner`, declared below. Absent means a Plugin Script
     * block shows its code and does not run it.
     */
    scriptRunner?: EditorScriptRunner | null;
}

const EditorServicesContext = createContext<EditorServices>({});

export interface EditorServicesProviderProps {
    services: EditorServices;
    children: ReactNode;
}

export function EditorServicesProvider({ services, children }: EditorServicesProviderProps) {
    return createElement(EditorServicesContext.Provider, { value: services }, children);
}

export function useEditorServices(): EditorServices {
    return useContext(EditorServicesContext);
}

/**
 * The host's file tree, for the pickers that browse it.
 *
 * Separate from `EditorFiles`, which reads and writes one path at a time. A
 * picker walks: it shows the folders under a folder, the files in it, and a
 * breadcrumb — and it never reads a byte. Handing it `EditorFiles` would mean
 * listing every directory again on every click.
 *
 * In MyCastle this arrived as `useFilesystem()`, which returned two unrelated
 * things under one name: this tree, and a store of projects, tasks and people.
 * Only the tree is here; the other half is domain data and does not belong to
 * an editor's file picker.
 */
export interface EditorFile {
    getName(): string;
    /** Path relative to the tree's root, `/` between segments. */
    getPath(): string;
    /** Extension without the dot, lower case. */
    getExt(): string;
}

export interface EditorDir {
    getName(): string;
    getPath(): string;
    getDirs(): EditorDir[];
    getFiles(): EditorFile[];
    /** Walks down by segments; `undefined` when the path is not there. */
    getSubDir(path: string[]): EditorDir | undefined;
}

export interface EditorFileTree {
    /** `null` until the tree is loaded, and when the host has none. */
    rootDir: EditorDir | null;
    /**
     * Whether the tree has finished loading. Distinct from `rootDir === null`:
     * a picker showing "nothing here" while a load is still running is wrong in
     * a way the user reads as an empty folder.
     */
    isLoaded: boolean;
    /**
     * What a file path is resolved against for `<img src>` and `<video src>`.
     * No trailing slash. In MyCastle this was `getHttpUrl()`, read once at
     * module load — which is exactly why it could not live in a package.
     */
    baseUrl: string;
}

const EditorFileTreeContext = createContext<EditorFileTree | null>(null);

export interface EditorFileTreeProviderProps {
    tree: EditorFileTree | null;
    children: ReactNode;
}

export function EditorFileTreeProvider({ tree, children }: EditorFileTreeProviderProps) {
    return createElement(EditorFileTreeContext.Provider, { value: tree }, children);
}

export function useEditorFileTree(): EditorFileTree | null {
    return useContext(EditorFileTreeContext);
}

/**
 * The projects, tasks and people a document can point at.
 *
 * One block embeds them (`ComponentEmbed`) and two hooks look one up by id for
 * a task card. All of it is reading — the editor never creates or edits a task.
 *
 * Unlike the capabilities above, this one speaks in `@hestia/core`'s nodes
 * rather than in structures of its own. Files, tokens and directory trees have
 * no canonical model here — every host may hold them differently, so an
 * interface is the honest shape. Projects, tasks and people do have one, and it
 * is exactly what `@hestia/core` exists for: the model a server and a browser
 * have to agree about. Declaring `EditorTask` beside `TaskNode` would be a
 * second definition of the same thing, and the host would write adapters to
 * satisfy a contract describing what its nodes already do.
 *
 * In MyCastle this arrived as the `dataSource` half of `useFilesystem()` —
 * which is why it was mistaken for a file concern for so long.
 */
export interface EditorProjectData {
    projects: ProjectNode[];
    tasks: TaskNode[];
    persons: PersonNode[];

    getTaskById(id: string): TaskNode | undefined;
    getPersonById(id: string): PersonNode | undefined;
    /** Searches the whole project tree, not only the top level. */
    findProjectByIdDeep(id: string): ProjectNode | undefined;
    getTasksByProjectId(projectId: string): TaskNode[];
    /** Tasks belonging to no project. */
    getUnassignedTasks(): TaskNode[];
    findPersons(filter: string): PersonNode[];

    /**
     * Whether the store has finished loading. Same reason as in
     * `EditorFileTree`: "nothing found" during a load reads as "nothing there".
     */
    isLoaded: boolean;
}

const EditorProjectDataContext = createContext<EditorProjectData | null>(null);

export interface EditorProjectDataProviderProps {
    data: EditorProjectData | null;
    children: ReactNode;
}

export function EditorProjectDataProvider({ data, children }: EditorProjectDataProviderProps) {
    return createElement(EditorProjectDataContext.Provider, { value: data }, children);
}

export function useEditorProjectData(): EditorProjectData | null {
    return useContext(EditorProjectDataContext);
}

/**
 * A Web Worker for running a model out of the main thread.
 *
 * `sci-blocks` already declares the port (`WorkerFactory` on `ModelViews`,
 * `ReaderView`, `ScriptBlock`) — this is only the way a host hands one in
 * through the editor. Absent means the block runs on the main thread, which is
 * what it does outside an application anyway.
 */
export type ModelWorkerFactory = () => Worker;

/**
 * A UI form rendered inside a document.
 *
 * `UIFormExtension` asks four things of the host's form service and draws
 * whatever it returns. The form model itself stays opaque here (`unknown`
 * behind `UIForm`): the editor never reads a field of it, it only passes it
 * back to `render`. Declaring its shape would be describing somebody else's
 * model for no gain.
 */
export type UIForm = unknown;

/** What the picker lists: enough to choose a form, nothing more. */
export interface UIFormSummary {
    id: string;
    name: string;
    description?: string;
}

export interface EditorForms {
    /** Whether the form list has been loaded. */
    loaded: boolean;
    loadForms(): Promise<UIFormSummary[]>;
    /**
     * The form itself, ready to render — not a node to convert. MyCastle
     * returned a node here and the caller called `toModel()` on it; that is the
     * host's half of the work, and doing it there keeps `UIForm` opaque.
     */
    getFormById(id: string): UIForm | null;
    /** A form written into the document rather than stored by id. */
    parseInlineForm(data: string): UIForm | null;
    /** Draws a form. The editor supplies no markup of its own. */
    render(form: UIForm, mode: 'view' | 'edit'): ReactNode;
}

/**
 * Commands arriving from outside the editor.
 *
 * MyCastle's plugin toolbar sent formatting commands over a global event bus in
 * `web-client`, and `MdEditor` reached for it with a dynamic import to dodge a
 * circular dependency. A package cannot have a global of somebody else's, so
 * the host passes a subscription and keeps the bus.
 *
 * Absent means nothing outside can drive the editor — which is the normal case.
 */
export interface EditorCommandBus {
    /** Subscribes; the returned function unsubscribes. */
    on(event: string, handler: (payload: { type: string }) => void): () => void;
}

/**
 * Script templates the host contributes to the slash menu.
 *
 * In MyCastle these came from `pluginRegistry.getTemplates()` — whatever web
 * plugins happened to be loaded. The editor needs none of that machinery: it
 * needs a list, rebuilt whenever the menu opens. What produces the list, and
 * whether a plugin system exists at all, stays the host's business.
 */
export interface ScriptTemplate {
    /** Where it came from; shown so the user can tell templates apart. */
    source: string;
    label: string;
    description?: string;
    code: string;
    mode?: string;
}

export interface EditorScriptTemplates {
    /** Called each time the menu is built, not cached — the set can change. */
    list(): ScriptTemplate[];
}

/**
 * What a Plugin Script block needs from the host to run at all.
 *
 * This is the widest capability here, and deliberately the last: a script block
 * is a place where somebody else's code runs, and the editor's whole job is to
 * hand it over and show what comes back. What it hands over — the Monaco
 * configuration, the scene host, the declarations for completion — is the
 * host's, because the host is what defines the language the script is written
 * in.
 *
 * Absent means the block shows its code and a note that it cannot be run. The
 * text is never lost; only the running of it is missing.
 */
export interface EditorScriptScene {
    /** The scene object the script produced; opaque to the editor. */
    scene: unknown;
    path: string;
}

export interface EditorScriptHost {
    /**
     * Configures a Monaco instance for scripts — defaults plus the type
     * declarations. `monaco` is `unknown` because this package does not depend
     * on Monaco's types and only passes the instance through.
     */
    configureMonaco?(monaco: unknown): void;
    /**
     * Installs the scene bridge for the length of one run, and removes it after.
     * `null` takes it down. Two blocks on a page have panels of their own, and
     * a scene from one must not land in the other's output.
     */
    setSceneHost?(host: {
        readFile(path: string): Promise<string | null>;
        writeFile(path: string, content: string): Promise<void>;
        present(scene: unknown, info: { path: string }): void;
    } | null): void;
    /** Draws a scene the script presented. */
    renderScene?(scene: EditorScriptScene, height: string): ReactNode;
    /**
     * Changes whenever the host's set of plugins does. The block re-reads its
     * environment when it moves; what a plugin is stays the host's business.
     */
    pluginsVersion?: number;
}

/**
 * Running the code in a Plugin Script block.
 *
 * A document may run what the user wrote, and this is the only way it does:
 * through an implementation the host passes in. Without one the block shows its
 * code and will not run it — the text is never lost, only the running of it is
 * missing, and there is no button that ends in an error.
 *
 * MyCastle had the runtime as a module the extension imported directly
 * (`executeScript`, `buildScriptContext`, `ReactiveValue`, `OutputRenderer`),
 * which is what tied the editor to one application. Two of those do not survive
 * as functions: `result instanceof ReactiveValue` became `isLive`, because the
 * editor must not hold the runtime's classes, and the output component became
 * `renderOutput`, because the editor supplies no markup for somebody else's
 * result.
 */

/** What a script prints while it runs. The editor collects and shows these. */
export interface ScriptDisplayItem {
    type: 'text' | 'table' | 'list' | 'json';
    data: unknown;
}

/** The handle a running script prints through. */
export interface ScriptDisplayApi {
    text(str: string): void;
    table(data: Record<string, unknown>[] | unknown[][]): void;
    list(items: unknown[]): void;
    json(obj: unknown): void;
}

/** Opaque: the editor builds it, hands it back and never reads it. */
export type ScriptContext = unknown;
/** Likewise — whatever the script returned, on its way to `renderOutput`. */
export type ScriptOutput = unknown;

export interface EditorScriptRunner {
    /** The environment a run starts in: who is running it, and the document's `env` values. */
    buildContext(
        session: { currentUser: string | null; token: string | null; isAdmin: boolean },
        env: { get(name: string): unknown; all(): Record<string, unknown> },
    ): ScriptContext;

    execute(code: string, context: ScriptContext, display: ScriptDisplayApi): Promise<ScriptOutput>;

    /**
     * Whether the result keeps changing after the run — MyCastle asked
     * `result instanceof ReactiveValue`. A class cannot cross this boundary, so
     * the runtime answers the question instead of exporting the type.
     */
    isLive(result: ScriptOutput): boolean;

    /** Draws what the script returned. */
    renderOutput(output: ScriptOutput): ReactNode;
}
