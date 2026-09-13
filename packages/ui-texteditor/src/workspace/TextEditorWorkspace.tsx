import { useCallback, useMemo, useRef, useState } from 'react';
import type { FileSystemProvider } from '@hestia/core';
import '@xterm/xterm/css/xterm.css';
import {
  MonacoMultiEditor, WordCountPluginV2, GenerateUuidPlugin,
} from '../monaco';
import type { ReactNode } from 'react';
import type { IPlugin } from '../monaco';
import type { VfsProviderDef, VfsMountPreset, VfsProjectContext } from '../vfs';
import type { ProjectDeps } from '../vfs/project/types';
import {
  FoldingPlugin, MarkdownPreviewPlugin, createMjdEditorPlugin, createTypeScriptPlugin,
  createPythonPlugin, createCppPlugin, createSnippetsPlugin, createCommentToolsPlugin,
  createBlocklyPlugin, VisualMinisLibPlugin, type UmlProjectSource,
  createMarkdownLspPlugin, createMarkdownLspServerPlugin,
} from '../plugins';
import { ArduinoBoardConfigDialog } from './ArduinoBoardConfigDialog';
import { RemoteTerminalConfigDialog } from './RemoteTerminalConfigDialog';

const DEFAULT_TERMINAL_TOKEN_KEY = 'texteditor.remote-terminal-token';

export interface TextEditorWorkspaceProps {
  /** Root filesystem the editor browses; also feeds the IntelliSense plugins. */
  provider: FileSystemProvider;
  /** Editor height. Defaults to `'100%'`. */
  height?: number | string;
  /** VFS mount-manager provider registry. */
  providerRegistry?: VfsProviderDef[];
  /** Built-in mount presets shown in the mount manager (cannot be deleted). */
  defaultMountPresets?: VfsMountPreset[];
  /** Extra plugins activated on top of the built-in set (e.g. app-specific editors). */
  extraPlugins?: IPlugin[];
  /**
   * Dodatkowe deklaracje `.d.ts` dla IntelliSense TypeScriptu — mapa
   * `ścieżka → treść`, wstrzykiwana raz przy starcie (np. pełne `@types/three`
   * w cad-app). Musi iść przez plugin TS, bo osobne `setExtraLibs` po stronie
   * aplikacji nadpisałoby jego własne deklaracje.
   */
  tsPreloadDts?: () => Promise<Record<string, string>>;
  /** AI agent panel. */
  /**
   * The assistant panel, supplied by the host — `@hestia/ui-ai` has one.
   * Absent means this editor offers no assistant, which is the point: an
   * assistant is a thing a page may or may not want.
   */
  agentPanel?: (opts: {
    onFileOpen: (path: string) => void;
    onFileWritten: (paths: string[]) => void | Promise<void>;
  }) => ReactNode;
  /** A bearer token for the host's API — the Markdown LSP plugin uses it. */
  authToken?: string;
  /** Workspace guide injected into the agent system prompt. */
  agentClaudeMd?: string;
  /** Auth token forwarded to the agent and the markdown LSP server plugin. */
  agentAuthToken?: string;
  /** Integrated terminal. */
  enableTerminal?: boolean;
  /** Server name shown in the built-in terminal API-key dialog. */
  terminalServerName?: string;
  /** URL where terminal API keys are generated (shown as a link in the dialog). */
  terminalApiKeysUrl?: string;
  /** localStorage key for the persisted remote-terminal token. */
  terminalTokenStorageKey?: string;
  /** Project action deps (Compile / Flash / Build via REST). */
  projectDeps?: ProjectDeps;
  /** Called for project dialog actions other than the built-in `board-config`. */
  onDialogAction?: (
    actionId: string,
    context: VfsProjectContext,
    saveProjectJson: (updates: Record<string, unknown>) => Promise<void>,
  ) => void;
  /**
   * Where the block editor gets its UML diagrams, which is what its palette is
   * built from.
   *
   * Injected rather than assumed: this editor is embedded by applications, only
   * some of which have a store of diagrams. Without one Blockly works on its
   * standard blocks and **says so** in the file-options dialog, instead of
   * showing an empty list indistinguishable from a failed load.
   *
   * `createVfsUmlProjectSource()` is a ready implementation over the file system.
   */
  blocklyUmlSource?: UmlProjectSource;
  /** File opened automatically on mount / when changed (path within `provider`). */
  initialPath?: string;
}

/**
 * Complete text/code editor — the reusable form of MyCastle's user-data editor.
 *
 * Composes {@link MonacoMultiEditor} with the full built-in plugin set
 * (word count, UUID, folding, markdown preview, MJD, TS/Python/C++ IntelliSense,
 * Visual MinisLib, snippets, markdown LSP), the AI agent, the integrated
 * terminal, and the project dialogs (Arduino board config, remote-terminal
 * API key). The host supplies only the filesystem provider and identity/auth.
 *
 * NOTE: Monaco web workers must be configured by the host app before this
 * component is used (a Vite `?worker` setup assigning `globalThis.MonacoEnvironment`).
 */
export function TextEditorWorkspace({
  provider,
  height = '100%',
  providerRegistry,
  defaultMountPresets,
  extraPlugins,
  tsPreloadDts,
  agentPanel,
  authToken,
  enableTerminal = false,
  terminalServerName = 'the remote server',
  terminalApiKeysUrl,
  terminalTokenStorageKey = DEFAULT_TERMINAL_TOKEN_KEY,
  projectDeps,
  onDialogAction,
  initialPath,
  blocklyUmlSource,
}: TextEditorWorkspaceProps) {
  // Plugins built from the editor's filesystem provider.
  const tsPlugin = useMemo(() => createTypeScriptPlugin(provider, { preloadDts: tsPreloadDts }), [provider, tsPreloadDts]);
  const pyPlugin = useMemo(() => createPythonPlugin(provider), [provider]);
  const cppPlugin = useMemo(() => createCppPlugin(provider), [provider]);
  const mjdPlugin = useMemo(() => createMjdEditorPlugin(provider), [provider]);
  const snippetsPlugin = useMemo(() => createSnippetsPlugin(provider), [provider]);
  const mdLspPlugin = useMemo(() => createMarkdownLspPlugin(provider), [provider]);
  // Embeds a VFS file into the open one and scans for TODO/FIXME markers; it
  // needs nothing but the file system, so it belongs in the built-in set.
  const commentToolsPlugin = useMemo(() => createCommentToolsPlugin(provider), [provider]);
  const blocklyPlugin = useMemo(
    () => createBlocklyPlugin({
      fileSystem: provider,
      ...(blocklyUmlSource ? { umlSource: blocklyUmlSource } : {}),
    }),
    [provider, blocklyUmlSource],
  );
  const mdLspServerPlugin = useMemo(
    () => (authToken ? createMarkdownLspServerPlugin(authToken) : null),
    // recreate only when the token presence flips, not on every value change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!authToken],
  );

  const plugins = useMemo<IPlugin[]>(() => [
    WordCountPluginV2, GenerateUuidPlugin, FoldingPlugin, MarkdownPreviewPlugin,
    mjdPlugin, tsPlugin, pyPlugin, cppPlugin, VisualMinisLibPlugin, snippetsPlugin, commentToolsPlugin,
    mdLspPlugin, blocklyPlugin,
    ...(mdLspServerPlugin ? [mdLspServerPlugin] : []),
    ...(extraPlugins ?? []),
  ], [mjdPlugin, tsPlugin, pyPlugin, cppPlugin, snippetsPlugin, commentToolsPlugin, mdLspPlugin,
      blocklyPlugin, mdLspServerPlugin, extraPlugins]);

  // ── Board-config dialog (project action `board-config`) ──────────────────
  const [boardConfigContext, setBoardConfigContext] = useState<VfsProjectContext | null>(null);
  const boardConfigSaveRef = useRef<((updates: Record<string, unknown>) => Promise<void>) | null>(null);

  const handleDialogAction = useCallback((
    actionId: string,
    context: VfsProjectContext,
    saveProjectJson: (updates: Record<string, unknown>) => Promise<void>,
  ) => {
    if (actionId === 'board-config') {
      boardConfigSaveRef.current = saveProjectJson;
      setBoardConfigContext(context);
    } else {
      onDialogAction?.(actionId, context, saveProjectJson);
    }
  }, [onDialogAction]);

  const handleBoardConfigSave = useCallback(async (updates: Record<string, unknown>) => {
    await boardConfigSaveRef.current?.(updates);
  }, []);

  // ── Remote-terminal API key — persisted in localStorage, separate from JWT ─
  const [terminalToken, setTerminalToken] = useState<string>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(terminalTokenStorageKey) : null) ?? '',
  );
  const [terminalConfigOpen, setTerminalConfigOpen] = useState(false);

  const handleSaveTerminalToken = useCallback((value: string) => {
    if (value) localStorage.setItem(terminalTokenStorageKey, value);
    else localStorage.removeItem(terminalTokenStorageKey);
    setTerminalToken(value);
    setTerminalConfigOpen(false);
  }, [terminalTokenStorageKey]);

  return (
    <>
      <MonacoMultiEditor
        provider={provider}
        height={height}
        providerRegistry={providerRegistry}
        defaultMountPresets={defaultMountPresets}
        plugins={plugins}
        agentPanel={agentPanel}
        enableTerminal={enableTerminal}
        terminalToken={terminalToken || undefined}
        onTerminalConfigRequest={() => setTerminalConfigOpen(true)}
        projectDeps={projectDeps}
        onDialogAction={handleDialogAction}
        initialPath={initialPath}
      />
      {boardConfigContext && (
        <ArduinoBoardConfigDialog
          open
          context={boardConfigContext}
          onClose={() => setBoardConfigContext(null)}
          onSave={handleBoardConfigSave}
        />
      )}
      <RemoteTerminalConfigDialog
        open={terminalConfigOpen}
        currentToken={terminalToken}
        serverName={terminalServerName}
        apiKeysUrl={terminalApiKeysUrl}
        onSave={handleSaveTerminalToken}
        onClose={() => setTerminalConfigOpen(false)}
      />
    </>
  );
}
