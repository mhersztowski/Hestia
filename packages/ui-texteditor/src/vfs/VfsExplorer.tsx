import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SyntheticEvent } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import { normalize, dirname, encodeText, decodeText, WritableGitHubFS, FileType } from '@hestia/core';
import type { CompositeFS, FileSystemProvider } from '@hestia/core';

import { globalEventBus } from '../monaco/plugins/EventBus';
import { useVfsTree } from './useVfsTree';
import { useVfsClipboard } from './clipboard';
import { VfsBreadcrumbs } from './VfsBreadcrumbs';
import { VfsMountManager } from './VfsMountManager';
import { VfsCommitDialog } from './VfsCommitDialog';
import { getFileIcon } from './icons';
import type { VfsExplorerProps, VfsProjectContext, VfsTreeNode } from './types';
import { platformToLanguage } from './types';
import { ProjectPanel, Spinner } from './ProjectPanel';
import type { ProjectPanelHandle } from './ProjectPanel';
import type { OutputLine } from './project/types';
import { classifyLine } from './project/types';
import { createProject } from './project/createProject';
import type { Project } from './project/Project';
import './vfs-explorer.css';

/* ── Toolbar action icons ── */

function IconCompile() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l5 4-5 4" /><path d="M9 12h5" />
    </svg>
  );
}

function IconFlash() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 1L3 9h5l-1 6 7-8H9L9 1z" />
    </svg>
  );
}

function IconRun() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

/** Pick toolbar icon by action id */
function ActionIcon({ actionId }: { actionId: string }) {
  if (actionId === 'compile' || actionId === 'build' || actionId === 'build-web') return <IconCompile />;
  if (actionId === 'flash' || actionId === 'compile-flash') return <IconFlash />;
  return <IconRun />;
}

/* ── Expand / Collapse chevrons ── */

function ChevronRightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── VS Code-like tree styling ── */

const treeViewSx = {
  py: 0.25,
  color: '#cccccc',
  /* MUI X v8 uses data-* attributes for state, not .Mui-* classes */
  '& .MuiTreeItem-content': {
    borderRadius: 0,
    minHeight: '30px',
    py: 0,
    pl: '4px',
    pr: '8px',
    gap: '0px',
    cursor: 'pointer',
    /* Hover — subtle gray */
    '&:hover:not([data-selected])': {
      bgcolor: 'rgba(255, 255, 255, 0.04)',
    },
    /* Selected — VS Code blue */
    '&[data-selected]': {
      bgcolor: '#094771 !important',
      color: '#ffffff',
    },
    '&[data-selected]:hover': {
      bgcolor: '#094771 !important',
    },
    '&[data-selected][data-focused]': {
      bgcolor: '#094771 !important',
    },
    /* Drop target highlight */
    '&[data-drop-target]': {
      bgcolor: 'rgba(255, 255, 255, 0.08)',
      outline: '1px solid #0078d4',
      outlineOffset: '-1px',
    },
  },
  '& .MuiTreeItem-label': {
    fontSize: '14px !important',
    lineHeight: '30px',
    pl: '0 !important',
  },
  '& .MuiTreeItem-iconContainer': {
    width: '20px',
    minWidth: '20px !important',
    mr: '4px',
    color: '#cccccc',
  },
  '& .MuiTreeItem-groupTransition, & .MuiCollapse-root': {
    ml: 0,
    pl: '8px',
  },
} as const;

/* ── Context menu styling ── */

const menuSlotProps = {
  paper: {
    sx: {
      bgcolor: '#3c3c3c',
      color: '#cccccc',
      border: '1px solid #545454',
      borderRadius: '5px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.36)',
      minWidth: 180,
      py: 0.5,
      '& .MuiMenuItem-root': {
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: 26,
        py: 0.25,
        px: 1.5,
        '&:hover': {
          bgcolor: '#094771',
          color: '#ffffff',
        },
      },
      '& .MuiDivider-root': {
        borderColor: '#545454',
        my: 0.5,
      },
    },
  },
} as const;

/* ── Context menu state ── */

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  nodeId: string | null;
  isDirectory: boolean;
}

/* ── Helpers ── */

function findNode(nodes: VfsTreeNode[], id: string): VfsTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function isDescendantOf(childPath: string, parentPath: string): boolean {
  return childPath === parentPath || childPath.startsWith(parentPath + '/');
}

/* ── OS drag-and-drop helpers ── */

/** Reads all entries from a FileSystemDirectoryReader (max 100 per batch). */
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  const readBatch = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  let batch = await readBatch();
  while (batch.length > 0) {
    all.push(...batch);
    batch = await readBatch();
  }
  return all;
}

/* ── Project context traversal ── */

/**
 * Walks up the path segment-by-segment and returns the parsed project.json
 * from the nearest ancestor directory that contains one. Returns null if none found.
 */
/** Infer platform from a file path.
 *  Prefers explicit platform directory names in the path (e.g. /Projects/Arduino/…)
 *  over file extension, since both Arduino and uPython projects have a sketches/ subdir. */
function inferPlatform(filePath: string): VfsProjectContext['platform'] | null {
  // Check for explicit platform segment in path (new directory structure: Projects/{Platform}/{name})
  const segments = filePath.split('/');
  const projectsIdx = segments.findIndex(s => s === 'Projects');
  if (projectsIdx !== -1 && projectsIdx + 1 < segments.length) {
    const platformSeg = segments[projectsIdx + 1];
    if (platformSeg === 'Arduino') return 'Arduino';
    if (platformSeg === 'uPython') return 'uPython';
    if (platformSeg === 'PicoSdk') return 'PicoSdk';
    if (platformSeg === 'pygame') return 'pygame';
  }
  // Fallback: infer from file extension
  if (filePath.endsWith('.ino')) return 'Arduino';
  if (filePath.endsWith('main.c') || filePath.endsWith('CMakeLists.txt') || filePath.endsWith('.cmake')) return 'PicoSdk';
  if (filePath.endsWith('.py')) return 'uPython';
  return null;
}

async function findProjectContext(
  path: string,
  provider: FileSystemProvider,
  cache: Map<string, VfsProjectContext | null>,
): Promise<VfsProjectContext | null> {
  // Build ancestor list starting from path itself down to root.
  const segments = path.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let i = segments.length; i >= 0; i--) {
    ancestors.push(i === 0 ? '/' : '/' + segments.slice(0, i).join('/'));
  }
  const unique = [...new Set(ancestors)];

  // Pass 1: look for project.json
  for (const dir of unique) {
    const key = dir + '/project.json';
    if (cache.has(key)) {
      const cached = cache.get(key)!;
      if (cached !== null) return cached;
      continue;
    }
    try {
      const data = await provider.readFile(normalize(dir + '/project.json'));
      const json = JSON.parse(decodeText(data)) as Partial<VfsProjectContext>;
      if (json.id && json.name && json.platform) {
        const ctx: VfsProjectContext = {
          id: json.id,
          name: json.name,
          platform: json.platform,
          language: platformToLanguage(json.platform),
          boardProfileKey: json.boardProfileKey,
          fqbn: json.fqbn,
          projectJsonPath: normalize(dir + '/project.json'),
        };
        cache.set(key, ctx);
        return ctx;
      }
      cache.set(key, null);
    } catch {
      // Do not cache — mount may not be ready yet.
      continue;
    }
  }

  // Pass 2: fallback — detect project root by finding a directory that contains a "sketches/" child.
  // This handles projects that predate project.json (old directory structure).
  const platform = inferPlatform(path);
  if (platform && provider.readDirectory) {
    for (const dir of unique.slice(1)) { // skip path itself (it's a file)
      const fbKey = '__fallback__' + dir;
      if (cache.has(fbKey)) {
        const cached = cache.get(fbKey)!;
        if (cached !== null) return cached;
        continue;
      }
      try {
        const entries = await provider.readDirectory(normalize(dir));
        const hasSketchesDir = entries.some(e => e.name === 'sketches' && e.type === FileType.Directory);
        if (hasSketchesDir) {
          const dirName = dir.split('/').filter(Boolean).pop() ?? dir;
          const ctx: VfsProjectContext = {
            id: dirName,
            name: dirName,
            platform,
            language: platformToLanguage(platform),
            projectJsonPath: normalize(dir + '/project.json'),
          };
          cache.set(fbKey, ctx);
          return ctx;
        }
        cache.set(fbKey, null);
      } catch {
        // ignore
      }
    }
  }

  // Pass 2.5: look for package.json in ancestor directories (Node.js sub-projects).
  // Runs before the generic app/node path heuristic so that e.g.
  // /home/app/node/my-lib/src/index.ts correctly resolves to my-lib, not app/node.
  for (const dir of unique.slice(1)) {
    if (dir.includes('/node_modules')) continue;
    const pkgKey = '__pkg__' + dir;
    if (cache.has(pkgKey)) {
      const c = cache.get(pkgKey);
      if (c !== null) return c!;
      continue;
    }
    try {
      const data = await provider.readFile(normalize(dir + '/package.json'));
      const json = JSON.parse(decodeText(data)) as Record<string, unknown>;
      if (json.name && json.scripts) {
        const dirName = dir.split('/').filter(Boolean).pop() ?? dir;
        const ctx: VfsProjectContext = {
          id: String(json.name),
          name: dirName,
          platform: 'NodeJs',
          language: 'TypeScript',
          projectJsonPath: normalize(dir + '/package.json'),
        };
        cache.set(pkgKey, ctx);
        return ctx;
      }
      cache.set(pkgKey, null);
    } catch {
      // Don't cache — provider may not be ready yet
    }
  }

  // Pass 3: path-based app detection for /app/node and /app/python conventions.
  // The app root is exactly /…/app/{type} — files live directly inside, no extra subdirectory layer.
  // Identified purely by path position; no config file is required.
  {
    const segs = path.split('/').filter(Boolean);
    const appIdx = segs.indexOf('app');
    if (appIdx !== -1 && appIdx + 1 < segs.length) {
      const appType = segs[appIdx + 1]; // 'node' or 'python'
      if (appType === 'node' || appType === 'python') {
        const appRoot = '/' + segs.slice(0, appIdx + 2).join('/'); // e.g. /home/app/python
        const pkgKey = '__pathapp__' + appRoot;
        if (!cache.has(pkgKey)) {
          const isNode = appType === 'node';
          const ctx: VfsProjectContext = {
            id: appType,
            name: appType,
            platform: isNode ? 'NodeJs' : 'Python',
            language: isNode ? 'TypeScript' : 'Python',
            // projectJsonPath points into the app root — execute() strips the filename to get cwd.
            projectJsonPath: normalize(appRoot + (isNode ? '/package.json' : '/pyproject.toml')),
          };
          cache.set(pkgKey, ctx);
        }
        const cached = cache.get(pkgKey);
        if (cached) return cached;
      }
    }
  }

  return null;
}

/* ── Component ── */

export function VfsExplorer({
  provider,
  rootPath = '/',
  width,
  height,
  onFileSelect,
  onFileOpen,
  onDirectoryChange,
  onProjectContext,
  projectDeps,
  onExecuteAction,
  onDialogAction,
  onOutputLine,
  onActionRunningChange,
  stopActionRef,
  hideOutput = false,
  readOnly: readOnlyProp,
  showBreadcrumbs = true,
  className,
  providerRegistry,
  defaultMountPresets,
  onMountsChanged: onMountsChangedProp,
  refreshRef,
  revealPathsRef,
  selectedPath: externalSelectedPath,
  style: styleProp,
}: VfsExplorerProps) {
  const clipboard = useVfsClipboard();
  const readOnly = readOnlyProp ?? provider.capabilities.readonly;
  const rp = normalize(rootPath);

  const tree = useVfsTree(provider, rp);

  // Expose tree.refresh to external callers via ref
  useEffect(() => {
    if (refreshRef) refreshRef.current = tree.refresh;
    return () => { if (refreshRef) refreshRef.current = null; };
  }, [refreshRef, tree.refresh]);

  // Expose a "reveal paths" function: refreshes tree and expands/loads all ancestor dirs of given paths
  useEffect(() => {
    if (!revealPathsRef) return;
    revealPathsRef.current = async (paths: string[]) => {
      await tree.refresh();
      // Collect all ancestor directories (shallowest first)
      const dirsToExpand = new Set<string>();
      for (const p of paths) {
        const parts = normalize(p).split('/').filter(Boolean);
        for (let i = 1; i < parts.length; i++) {
          dirsToExpand.add('/' + parts.slice(0, i).join('/'));
        }
      }
      const sorted = [...dirsToExpand].sort((a, b) => a.split('/').length - b.split('/').length);
      for (const dir of sorted) {
        await tree.handleItemExpansionToggle(null, dir, true);
      }
      tree.setExpandedItems(prev => {
        const set = new Set([...prev, ...sorted]);
        return [...set];
      });
    };
    return () => { if (revealPathsRef) revealPathsRef.current = null; };
  }, [revealPathsRef, tree]);

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState(rp);

  useEffect(() => {
    onDirectoryChange?.(currentPath);
  }, [currentPath, onDirectoryChange]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ── Project context cache (keyed by "dir/project.json") ── */

  const projectCacheRef = useRef<Map<string, VfsProjectContext | null>>(new Map());
  const [activeProject, setActiveProject] = useState<VfsProjectContext | null>(null);
  // Monotonic counter — only the latest findProjectContext result may update activeProject.
  const projectDetectSeqRef = useRef(0);

  // Invalidate cache when provider changes (e.g. new mount)
  useEffect(() => {
    projectCacheRef.current.clear();
    ++projectDetectSeqRef.current; // cancel any in-flight detection
    setActiveProject(null);
  }, [provider]);

  // Re-attempt project detection when tree updates (e.g. after CompositeFS.mount() fires a Created event).
  // This handles the race where externalSelectedPath fires before /home is mounted.
  const prevTreeLengthRef = useRef(0);
  useEffect(() => {
    const len = tree.items.length;
    const grew = len > prevTreeLengthRef.current;
    prevTreeLengthRef.current = len;
    if (!grew || activeProject !== null) return;
    const path = externalSelectedPath ?? (currentPath !== rp ? currentPath : null);
    if (!path) return;
    findProjectContext(path, provider, projectCacheRef.current)
      .then(ctx => { if (ctx) setActiveProject(ctx); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.items]);

  // Propagate to external consumer whenever activeProject changes
  useEffect(() => {
    onProjectContext?.(activeProject);
  }, [activeProject, onProjectContext]);

  // Auto-detect project from current folder (fires on navigation, tree expand, breadcrumb click)
  // Only activates when no project is already active — does not override explicit file selection.
  useEffect(() => {
    if (currentPath === rp || activeProject !== null) return;
    findProjectContext(currentPath, provider, projectCacheRef.current)
      .then(ctx => { if (ctx) setActiveProject(ctx); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, provider]);

  /**
   * Kontener drzewa — potrzebny, żeby przewinąć do pozycji zaznaczonej
   * z zewnątrz (aktywna zakładka edytora). Bez tego plik otwarty z innego
   * miejsca jest wprawdzie zaznaczony, ale zostaje poza widocznym obszarem
   * i wygląda, jakby eksplorator go nie zauważył.
   */
  const treeScrollRef = useRef<HTMLDivElement | null>(null);

  // Sync tree selection when externalSelectedPath changes (e.g. active editor tab)
  useEffect(() => {
    if (!externalSelectedPath) return;
    let cancelled = false;

    /**
     * Odsłonięcie pozycji: doczytanie gałęzi, zaznaczenie, przewinięcie.
     *
     * Kolejność ma znaczenie i to na niej wcześniej się potykało. Samo
     * `setExpandedItems` oznacza katalogi jako rozwinięte, ale **nie pobiera
     * ich zawartości** — drzewo ładuje dzieci na żądanie. Bez doczytania węzeł
     * pliku w ogóle nie powstaje, więc nie ma czego zaznaczyć ani przewinąć,
     * a wygląda to jak brak reakcji eksploratora.
     */
    const reveal = async (): Promise<void> => {
      const parts = normalize(externalSelectedPath).split('/').filter(Boolean);
      const dirs: string[] = [];
      for (let i = 1; i < parts.length; i++) dirs.push('/' + parts.slice(0, i).join('/'));

      // Od najpłytszego: dziecko nie istnieje, dopóki rodzic nie jest wczytany.
      for (const dir of dirs) {
        if (cancelled) return;
        await tree.handleItemExpansionToggle(null, dir, true);
      }
      if (cancelled) return;

      tree.setExpandedItems(prev => [...new Set([...prev, ...dirs])]);
      setSelectedItems([externalSelectedPath]);

      // Przewinięcie dopiero po tym, jak pozycja pojawi się w drzewie DOM.
      // `nearest` przewija tylko wtedy, gdy trzeba — pozycja już widoczna
      // zostaje na miejscu, zamiast skakać przy każdym przełączeniu zakładki.
      let attempts = 0;
      const scroll = (): void => {
        if (cancelled) return;
        const item = treeScrollRef.current?.querySelector('.MuiTreeItem-content[data-selected]');
        if (item) {
          item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          try {
            if (localStorage.getItem('HYDRA_DEBUG') === '1') {
              console.log('[hydra] eksplorator: zaznaczono i przewinięto', externalSelectedPath);
            }
          } catch { /* brak localStorage */ }
          return;
        }
        if (++attempts < 8) { requestAnimationFrame(scroll); return; }
        try {
          if (localStorage.getItem('HYDRA_DEBUG') === '1') {
            console.warn('[hydra] eksplorator: nie znalazłem pozycji dla', externalSelectedPath,
                         '— węzły w drzewie:', tree.items.length);
          }
        } catch { /* brak localStorage */ }
      };
      requestAnimationFrame(scroll);
    };

    void reveal();

    // Update breadcrumb path
    const node = findNode(tree.items, externalSelectedPath);
    const dir = node ? (node.isDirectory ? node.id : dirname(externalSelectedPath)) : dirname(externalSelectedPath);
    setCurrentPath(dir);

    // Detect project context (don't clear on errors — mount may not be ready yet)
    const seq = ++projectDetectSeqRef.current;
    findProjectContext(externalSelectedPath, provider, projectCacheRef.current)
      .then(ctx => { if (projectDetectSeqRef.current === seq) setActiveProject(ctx); })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedPath, provider]);

  /* ── Project instance (with execute() wired to deps) ── */

  const activeProjectInstance = useMemo<Project | null>(
    () => activeProject ? createProject(activeProject, projectDeps) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject, projectDeps],
  );

  /* ── Action execution state ── */

  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [actionRunning, setActionRunning] = useState(false);
  const [lastStatus, setLastStatus] = useState<'success' | 'error' | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const actionAbortRef = useRef<AbortController | null>(null);
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const projectPanelRef = useRef<ProjectPanelHandle | null>(null);

  // Overlay toolbar height (measured via ResizeObserver — avoids layout shift)
  const projectToolbarRef = useRef<HTMLDivElement | null>(null);
  const [projectToolbarHeight, setProjectToolbarHeight] = useState(0);

  // Measure project toolbar height via ResizeObserver so tree paddingTop stays in sync
  useEffect(() => {
    const el = projectToolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setProjectToolbarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll output
  useEffect(() => {
    if (outputOpen) outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputLines, outputOpen]);

  // Reset when project changes
  useEffect(() => {
    setOutputLines([]);
    setLastStatus(null);
    setOutputOpen(false);
    actionAbortRef.current?.abort();
    setActionRunning(false);
  }, [activeProject?.id]);

  const appendLine = useCallback((text: string) => {
    const line = { text, timestamp: Date.now(), type: classifyLine(text) };
    setOutputLines(prev => [...prev, line]);
    onOutputLine?.(line);
  }, [onOutputLine]);

  /** Builds a saveProjectJson callback for dialog actions: merges updates into project.json and refreshes context. */
  const buildSaveProjectJson = useCallback((ctx: VfsProjectContext) => {
    return async (updates: Record<string, unknown>) => {
      const data = await provider.readFile(ctx.projectJsonPath);
      const existing = JSON.parse(decodeText(data)) as Record<string, unknown>;
      const merged = { ...existing, ...updates };
      const encoded = new TextEncoder().encode(JSON.stringify(merged, null, 2));
      await provider.writeFile!(ctx.projectJsonPath, encoded, { create: false, overwrite: true });
      // Invalidate the project context cache so the next resolution picks up new values
      projectCacheRef.current.delete(ctx.projectJsonPath);
      // Re-evaluate context for the currently selected path
      if (selectedItems[0]) {
        const fresh = await findProjectContext(selectedItems[0], provider, projectCacheRef.current);
        setActiveProject(fresh);
        onProjectContext?.(fresh);
      }
    };
  }, [provider, selectedItems, onProjectContext]);

  const handleRunAction = useCallback(async (actionId: string, hasOutput: boolean, hasDialog?: boolean) => {
    const ctx = activeProject;
    if (!ctx) return;

    // Dialog actions are handled by the host — no async output pipeline needed
    if (hasDialog && onDialogAction) {
      onDialogAction(actionId, ctx, buildSaveProjectJson(ctx));
      return;
    }

    actionAbortRef.current?.abort();
    const ctrl = new AbortController();
    actionAbortRef.current = ctrl;

    if (hasOutput) {
      setOutputLines([]);
      setLastStatus(null);
      setOutputOpen(true);
    }
    const actionLabel = activeProjectInstance?.getActions().find(a => a.id === actionId)?.label;
    setActionRunning(true);
    onActionRunningChange?.(true, actionLabel);

    try {
      let result: { success: boolean; error?: string };

      if (onExecuteAction) {
        // External override takes priority
        result = await onExecuteAction(actionId, ctx, selectedItems[0] ?? null, appendLine, ctrl.signal);
      } else if (activeProjectInstance) {
        // Built-in execute() from Project class
        result = await activeProjectInstance.execute(actionId, selectedItems[0] ?? null, appendLine, ctrl.signal);
      } else {
        appendLine('Error: no executor configured (provide projectDeps or onExecuteAction)');
        result = { success: false };
      }

      if (!ctrl.signal.aborted) {
        setLastStatus(result.success ? 'success' : 'error');
        if (result.error) appendLine(`Error: ${result.error}`);
        if (hasOutput) appendLine(result.success ? '✓ Done' : '✗ Failed');
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setLastStatus('error');
        appendLine(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setActionRunning(false);
      onActionRunningChange?.(false);
    }
  }, [activeProject, activeProjectInstance, onExecuteAction, onDialogAction, onActionRunningChange, selectedItems, appendLine, buildSaveProjectJson]);

  const handleStopAction = useCallback(() => {
    actionAbortRef.current?.abort();
    setActionRunning(false);
    appendLine('— Aborted —');
  }, [appendLine]);

  useEffect(() => {
    if (stopActionRef) stopActionRef.current = handleStopAction;
    return () => { if (stopActionRef) stopActionRef.current = null; };
  }, [stopActionRef, handleStopAction]);

  /* ── Drag & drop (internal reorder) ── */

  const dragNodeRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  /* ── External OS file/folder drop ── */

  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const handleExternalDrop = useCallback(async (
    items: DataTransferItemList,
    targetDir: string,
  ): Promise<void> => {
    if (readOnly || !provider.writeFile) return;

    // Collect FileSystemEntry objects via the File and Directory Entries API
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    if (entries.length === 0) return;

    async function uploadEntry(entry: FileSystemEntry, dir: string): Promise<void> {
      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) =>
          (entry as FileSystemFileEntry).file(res, rej),
        );
        const content = new Uint8Array(await file.arrayBuffer());
        setUploadProgress(file.name);
        await provider.writeFile!(normalize(dir + '/' + entry.name), content, { create: true, overwrite: true });
      } else if (entry.isDirectory) {
        const subDir = normalize(dir + '/' + entry.name);
        try { await provider.mkdir?.(subDir); } catch { /* may already exist */ }
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const children = await readAllEntries(reader);
        for (const child of children) await uploadEntry(child, subDir);
      }
    }

    setUploadProgress('Uploading…');
    try {
      for (const entry of entries) await uploadEntry(entry, targetDir);
      await tree.refresh();
    } catch (err) {
      console.error('[VfsExplorer] upload error:', err);
    } finally {
      setUploadProgress(null);
    }
  }, [readOnly, provider, tree]);

  /* ── Mount manager ── */

  const showMountManager = !readOnly && !!providerRegistry && providerRegistry.length > 0 && provider.scheme === 'composite';

  /* ── Writable GitHub commit bar ── */

  const [mountVersion, setMountVersion] = useState(0);

  const writableGitHub = useMemo(() => {
    if (provider instanceof WritableGitHubFS) return provider;
    if (provider.scheme === 'composite') {
      const mounts = (provider as CompositeFS).getMounts();
      for (const m of mounts) {
        if (m.provider instanceof WritableGitHubFS) return m.provider as WritableGitHubFS;
      }
    }
    return null;
  }, [provider, mountVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pendingCount, setPendingCount] = useState(0);
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  useEffect(() => {
    if (!writableGitHub) return;
    setPendingCount(writableGitHub.pendingCount());
    const disposable = writableGitHub.onDidChangeFile(() => {
      setPendingCount(writableGitHub.pendingCount());
    });
    return () => disposable.dispose();
  }, [writableGitHub]);

  const handleCommit = useCallback(async (message: string) => {
    if (!writableGitHub) return;
    await writableGitHub.commit(message);
    setPendingCount(0);
    tree.refresh();
  }, [writableGitHub, tree]);

  const handleDiscard = useCallback(() => {
    if (!writableGitHub) return;
    writableGitHub.discardPending();
    setPendingCount(0);
    tree.refresh();
  }, [writableGitHub, tree]);

  const handleMountsChanged = useCallback(() => {
    tree.refresh();
    setMountVersion(v => v + 1);
    onMountsChangedProp?.();
  }, [tree, onMountsChangedProp]);

  /* ── Selection ── */

  const handleSelectedItemsChange = useCallback(
    (_event: SyntheticEvent | null, itemIds: string[]) => {
      setSelectedItems(itemIds);
      if (itemIds.length > 0) {
        onFileSelect?.(itemIds[0]);
        const node = findNode(tree.items, itemIds[0]);
        if (node) {
          setCurrentPath(node.isDirectory ? node.id : dirname(node.id));
          if (!node.isDirectory) {
            const selectedPath = itemIds[0];
            globalEventBus.emit('system:vfs:fileSelected', { path: selectedPath });
            provider.readFile(selectedPath)
              .then(data => globalEventBus.emit('system:vfs:fileContent', { path: selectedPath, content: decodeText(data) }))
              .catch(() => {});
          }
        }
        const seq = ++projectDetectSeqRef.current;
        findProjectContext(itemIds[0], provider, projectCacheRef.current)
          .then(ctx => { if (projectDetectSeqRef.current === seq) setActiveProject(ctx); })
          .catch(() => {});
      }
      // Empty selection (deselect / double-click toggle) — don't clear the project panel.
    },
    [onFileSelect, provider, tree.items],
  );

  const handleExpandedItemsChange = useCallback(
    (_event: SyntheticEvent | null, itemIds: string[]) => {
      tree.setExpandedItems(itemIds);
    },
    [tree],
  );

  /* ── Context menu ── */

  const openContextMenu = useCallback(
    (event: React.MouseEvent, node: VfsTreeNode | null) => {
      event.preventDefault();
      event.stopPropagation();
      if (node) setSelectedItems([node.id]);
      setContextMenu({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
        nodeId: node?.id ?? null,
        isDirectory: node?.isDirectory ?? true,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /* ── Long-press (mobile context menu) ── */

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMovedRef = useRef(false);
  // Blocks the synthetic click that browsers fire after a long-press touchend
  const longPressOccurredRef = useRef(false);
  // Detected once on first touch — disables onContextMenu (which fires on single tap on touch devices)
  const isTouchDeviceRef = useRef(false);

  const startLongPress = useCallback((e: React.TouchEvent, node: VfsTreeNode | null) => {
    isTouchDeviceRef.current = true;
    touchMovedRef.current = false;
    longPressOccurredRef.current = false;
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimerRef.current = setTimeout(() => {
      if (!touchMovedRef.current) {
        longPressOccurredRef.current = true;
        openContextMenu(
          { clientX: x, clientY: y, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
          node,
        );
      }
    }, 500);
  }, [openContextMenu]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onTouchMove = useCallback(() => {
    touchMovedRef.current = true;
    cancelLongPress();
  }, [cancelLongPress]);

  // Swallows the synthetic click generated after a long-press touchend
  const blockPostLongPressClick = useCallback((e: React.MouseEvent) => {
    if (longPressOccurredRef.current) {
      longPressOccurredRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isTouchDeviceRef.current) { e.preventDefault(); return; }
      const target = e.target as HTMLElement;
      if (target.closest('.MuiTreeItem-root')) return;
      openContextMenu(e, null);
    },
    [openContextMenu],
  );

  /* ── Context menu actions ── */

  const getParentDir = useCallback(() => {
    if (!contextMenu) return currentPath;
    if (!contextMenu.nodeId) return currentPath;
    return contextMenu.isDirectory ? contextMenu.nodeId : dirname(contextMenu.nodeId);
  }, [contextMenu, currentPath]);

  const handleNewFile = useCallback(async () => {
    closeContextMenu();
    if (!provider.writeFile) return;
    const name = prompt('File name:');
    if (!name) return;
    const path = normalize(getParentDir() + '/' + name);
    await provider.writeFile(path, encodeText(''), { overwrite: false });
    tree.refresh();
  }, [getParentDir, provider, tree, closeContextMenu]);

  const handleNewFolder = useCallback(async () => {
    closeContextMenu();
    if (!provider.mkdir) return;
    const name = prompt('Folder name:');
    if (!name) return;
    const path = normalize(getParentDir() + '/' + name);
    await provider.mkdir(path);
    tree.refresh();
  }, [getParentDir, provider, tree, closeContextMenu]);

  const handleOpen = useCallback(() => {
    if (contextMenu?.nodeId) onFileOpen?.(contextMenu.nodeId);
    closeContextMenu();
  }, [contextMenu, onFileOpen, closeContextMenu]);

  const handleRenamePrompt = useCallback(() => {
    const nodeId = contextMenu?.nodeId;
    closeContextMenu();
    if (!nodeId || !provider.rename) return;
    const oldName = nodeId.split('/').pop() ?? '';
    const newName = prompt('Rename:', oldName);
    if (newName && newName !== oldName) {
      const parentDir = dirname(nodeId);
      const newPath = normalize(parentDir + '/' + newName);
      provider.rename(nodeId, newPath, { overwrite: false }).then(() => tree.refresh());
    }
  }, [contextMenu, provider, tree, closeContextMenu]);

  const handleCopyPath = useCallback(() => {
    if (contextMenu?.nodeId) navigator.clipboard.writeText(contextMenu.nodeId).catch(() => {});
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const handleCopy = useCallback(() => {
    if (contextMenu?.nodeId) clipboard.copy([contextMenu.nodeId]);
    closeContextMenu();
  }, [contextMenu, clipboard, closeContextMenu]);

  const handleCut = useCallback(() => {
    if (contextMenu?.nodeId) clipboard.cut([contextMenu.nodeId]);
    closeContextMenu();
  }, [contextMenu, clipboard, closeContextMenu]);

  const handlePaste = useCallback(async () => {
    closeContextMenu();
    await clipboard.paste(getParentDir(), provider);
    tree.refresh();
  }, [getParentDir, clipboard, provider, tree, closeContextMenu]);

  const handleDeleteRequest = useCallback(() => {
    const nodeId = contextMenu?.nodeId;
    closeContextMenu();
    if (!nodeId) return;
    setDeleteTarget(nodeId);
  }, [contextMenu, closeContextMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    const nodeId = deleteTarget;
    setDeleteTarget(null);
    if (!provider.delete || !nodeId) return;
    try {
      await provider.delete(nodeId, { recursive: true });
      await tree.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }, [deleteTarget, provider, tree]);

  /* ── Breadcrumb navigation ── */

  const handleBreadcrumbNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path);
      const parts = path.split('/').filter(Boolean);
      const pathsToExpand: string[] = [];
      let current = '';
      for (const part of parts) {
        current = current ? current + '/' + part : '/' + part;
        pathsToExpand.push(current);
      }
      tree.setExpandedItems(prev => {
        const set = new Set([...prev, ...pathsToExpand]);
        return [...set];
      });
    },
    [tree],
  );

  /* ── Recursive tree rendering ── */

  const renderTree = useCallback(
    (nodes: VfsTreeNode[]) =>
      nodes.map(node => {
        // Directories with empty children array need a placeholder so they're expandable
        const hasLoadedChildren = node.children && node.children.length > 0;
        const isUnloadedDir = node.isDirectory && node.children && node.children.length === 0;
        const isDropTarget = dropTargetId === node.id;

        return (
          <TreeItem
            key={node.id}
            itemId={node.id}
            label={
              <span className="vfs-item-title">
                <span className="vfs-item-icon">
                  {getFileIcon(node.label, node.isDirectory, tree.expandedItems.includes(node.id))}
                </span>
                <span className="vfs-item-name">{node.label}</span>
              </span>
            }
            slotProps={{
              content: {
                draggable: !readOnly && !!provider.rename,
                onDragStart: (e: React.DragEvent) => {
                  dragNodeRef.current = node.id;
                  e.dataTransfer.effectAllowed = 'move';
                },
                onDragOver: (e: React.DragEvent) => {
                  if (readOnly) return;
                  const isInternal = !!dragNodeRef.current;
                  const isExternalFiles = !isInternal && e.dataTransfer.types.includes('Files');
                  if (!isInternal && !isExternalFiles) return;
                  if (!node.isDirectory) return;
                  if (isInternal) {
                    const dragId = dragNodeRef.current!;
                    if (isDescendantOf(node.id, dragId) || dirname(dragId) === node.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  } else {
                    e.preventDefault();
                    e.stopPropagation(); // prevent container from also reacting
                    e.dataTransfer.dropEffect = 'copy';
                    setIsExternalDragOver(false);
                  }
                  setDropTargetId(node.id);
                },
                onDragLeave: () => {
                  setDropTargetId(prev => (prev === node.id ? null : prev));
                },
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTargetId(null);
                  setIsExternalDragOver(false);
                  const isInternal = !!dragNodeRef.current;
                  if (isInternal) {
                    // Internal reorder
                    const dragId = dragNodeRef.current!;
                    dragNodeRef.current = null;
                    if (!provider.rename || readOnly) return;
                    if (!node.isDirectory || isDescendantOf(node.id, dragId)) return;
                    const name = dragId.split('/').pop() ?? '';
                    const newPath = normalize(node.id + '/' + name);
                    if (dragId !== newPath) {
                      provider.rename(dragId, newPath, { overwrite: false }).then(() => tree.refresh());
                    }
                  } else if (node.isDirectory && e.dataTransfer.items.length > 0) {
                    // External OS file/folder drop onto a specific directory
                    handleExternalDrop(e.dataTransfer.items, node.id).catch(() => {});
                  }
                },
                onDragEnd: () => {
                  dragNodeRef.current = null;
                  setDropTargetId(null);
                },
                onContextMenu: (e: React.MouseEvent) => {
                  if (isTouchDeviceRef.current) { e.preventDefault(); return; }
                  openContextMenu(e, node);
                },
                onTouchStart: (e: React.TouchEvent) => startLongPress(e, node),
                onTouchEnd: cancelLongPress,
                onTouchMove: onTouchMove,
                onClickCapture: blockPostLongPressClick,
                onDoubleClick: () => {
                  if (!node.isDirectory) onFileOpen?.(node.id);
                },
                ...(isDropTarget ? { 'data-drop-target': '' } : {}),
              } as Record<string, unknown>,
            }}
          >
            {hasLoadedChildren && renderTree(node.children!)}
            {isUnloadedDir && (
              <TreeItem
                itemId={`${node.id}/__placeholder__`}
                label=""
                disabled
                sx={{ display: 'none' }}
              />
            )}
          </TreeItem>
        );
      }),
    [tree.expandedItems, tree, openContextMenu, onFileOpen, readOnly, provider, dropTargetId, startLongPress, cancelLongPress, onTouchMove, blockPostLongPressClick, handleExternalDrop],
  );

  /* ── Render ── */

  return (
    <div
      className={`vfs-explorer${className ? ` ${className}` : ''}`}
      style={{
        width: width ?? '100%',
        height: height ?? '100%',
        ...styleProp,
      }}
    >
      {showBreadcrumbs && (
        <VfsBreadcrumbs path={currentPath} onNavigate={handleBreadcrumbNavigate} />
      )}
      {showMountManager && (
        <VfsMountManager
          compositeFs={provider as CompositeFS}
          providerRegistry={providerRegistry!}
          defaultMountPresets={defaultMountPresets}
          onMountsChanged={handleMountsChanged}
        />
      )}
      {writableGitHub && pendingCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px',
          background: '#1e3a1e', borderBottom: '1px solid #2d5a2d',
          fontSize: 12, color: '#89d185',
        }}>
          <span style={{ flex: 1 }}>{pendingCount} pending change{pendingCount !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setShowCommitDialog(true)}
            style={{
              padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              background: '#2d7a2d', color: '#fff', border: 'none', borderRadius: 3,
            }}
          >
            Commit…
          </button>
          <button
            onClick={handleDiscard}
            style={{
              padding: '2px 6px', fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: '#89d185', border: '1px solid #2d5a2d', borderRadius: 3,
            }}
          >
            Discard
          </button>
        </div>
      )}
      {showCommitDialog && writableGitHub && (
        <VfsCommitDialog
          provider={writableGitHub}
          onClose={() => setShowCommitDialog(false)}
          onCommit={handleCommit}
        />
      )}
      {/* ── Tree area: relative wrapper so toolbar can overlay without shifting layout ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* ── Project action toolbar: absolute overlay, measured by ResizeObserver ── */}
        <div
          ref={projectToolbarRef}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3,
            background: '#1e1e1e',
            borderBottom: activeProject ? '1px solid #3c3c3c' : 'none',
            display: activeProject ? 'block' : 'none',
          }}
        >
          {/* Project name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 2px' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#666' }}>
              Project
            </span>
            <span style={{ fontSize: 11, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProject?.name ?? ''}
            </span>
            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#0e639c', color: '#c5c5c5', flexShrink: 0 }}>
              {activeProject?.platform ?? ''}
            </span>
          </div>
          {/* Action buttons row */}
          {activeProjectInstance && activeProjectInstance.getActions().length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, padding: '2px 6px 4px' }}>
              {activeProjectInstance.getActions().map(action => (
                <button
                  key={action.id}
                  title={action.description ?? action.label}
                  disabled={actionRunning && !action.hasDialog}
                  onClick={() => handleRunAction(action.id, action.hasOutput, action.hasDialog)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', fontSize: 11, cursor: actionRunning ? 'not-allowed' : 'pointer',
                    background: '#2d2d2d', border: '1px solid #454545', borderRadius: 3,
                    color: actionRunning ? '#555' : '#ccc',
                    opacity: actionRunning ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!actionRunning) { (e.currentTarget as HTMLButtonElement).style.background = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#666'; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#454545'; }}
                >
                  <ActionIcon actionId={action.id} />
                  {action.label}
                </button>
              ))}
              {actionRunning && (
                <span style={{ marginLeft: 'auto', color: '#888', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <Spinner />
                  Running…
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Tree: fills wrapper, paddingTop pushes content below overlay toolbar ── */}
        <div
          ref={treeScrollRef}
          className="vfs-tree-container"
          style={{ position: 'absolute', inset: 0, paddingTop: projectToolbarHeight }}
          onContextMenu={handleContainerContextMenu}
          onTouchStart={e => startLongPress(e, null)}
          onTouchEnd={cancelLongPress}
          onTouchMove={onTouchMove}
          onClickCapture={blockPostLongPressClick}
          onDragOver={(e: React.DragEvent) => {
            if (dragNodeRef.current || readOnly || !provider.writeFile) return;
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setIsExternalDragOver(true);
          }}
          onDragLeave={(e: React.DragEvent) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
              setIsExternalDragOver(false);
            }
          }}
          onDrop={(e: React.DragEvent) => {
            setIsExternalDragOver(false);
            if (dragNodeRef.current || readOnly || !provider.writeFile) return;
            if (e.dataTransfer.items.length === 0) return;
            e.preventDefault();
            const targetDir = dropTargetId ?? currentPath;
            setDropTargetId(null);
            handleExternalDrop(e.dataTransfer.items, targetDir).catch(() => {});
          }}
        >
          {/* External drag-over overlay */}
          {isExternalDragOver && !readOnly && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
              background: 'rgba(0, 120, 212, 0.12)',
              border: '2px dashed #0078d4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 4,
            }}>
              <svg width="24" height="24" viewBox="0 0 16 16" fill="#0078d4">
                <path d="M8 1v9M4 6l4-4 4 4M2 13h12" stroke="#0078d4" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ color: '#0078d4', fontSize: 12, fontWeight: 500 }}>Drop to upload</span>
            </div>
          )}
          {/* Upload progress */}
          {uploadProgress && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 11,
              background: '#252526', borderTop: '1px solid #3c3c3c',
              padding: '4px 8px', fontSize: 11, color: '#888',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #888', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
              {uploadProgress}
            </div>
          )}
          {tree.loading && (
            <LinearProgress
              sx={{ height: 2, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'transparent' }}
            />
          )}
          <SimpleTreeView
            expandedItems={tree.expandedItems}
            onExpandedItemsChange={handleExpandedItemsChange}
            onItemExpansionToggle={tree.handleItemExpansionToggle}
            selectedItems={selectedItems}
            onSelectedItemsChange={handleSelectedItemsChange}
            multiSelect
            slots={{
              expandIcon: ChevronRightIcon,
              collapseIcon: ChevronDownIcon,
            }}
            itemChildrenIndentation={0}
            sx={treeViewSx}
          >
            {renderTree(tree.items)}
          </SimpleTreeView>
        </div>
      </div>

      {/* ── Project panel ── */}
      <ProjectPanel
        ref={projectPanelRef}
        context={activeProject}
        outputLines={outputLines}
        running={actionRunning}
        lastStatus={lastStatus}
        outputOpen={!hideOutput && outputOpen}
        onToggleOutput={() => setOutputOpen(o => !o)}
        onClearOutput={() => { setOutputLines([]); setOutputOpen(false); }}
        onStop={handleStopAction}
        outputEndRef={outputEndRef}
      />

      {/* ── Context Menu ── */}
      <Menu
        open={contextMenu !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
        slotProps={menuSlotProps}
      >
        {contextMenu?.nodeId && !contextMenu.isDirectory && (
          <MenuItem onClick={handleOpen}>
            <ListItemText>Open</ListItemText>
          </MenuItem>
        )}
        {contextMenu?.nodeId && (
          <MenuItem onClick={handleCopyPath}>
            <ListItemText>Copy Path</ListItemText>
          </MenuItem>
        )}
        {!readOnly && (
          <MenuItem onClick={handleNewFile}>
            <ListItemText>New File...</ListItemText>
          </MenuItem>
        )}
        {!readOnly && (
          <MenuItem onClick={handleNewFolder}>
            <ListItemText>New Folder...</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && <Divider />}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleRenamePrompt}>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleCopy}>
            <ListItemText>Copy</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleCut}>
            <ListItemText>Cut</ListItemText>
          </MenuItem>
        )}
        {!readOnly && clipboard.canPaste && (contextMenu?.isDirectory ?? true) && (
          <MenuItem onClick={handlePaste}>
            <ListItemText>Paste</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && <Divider />}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleDeleteRequest}>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#252526', border: '1px solid #3c3c3c', borderRadius: 4,
            padding: '20px 24px', minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ color: '#cccccc', marginBottom: 8, fontWeight: 600 }}>Delete</div>
            <div style={{ color: '#999', fontSize: 13, marginBottom: 20, wordBreak: 'break-all' }}>
              Are you sure you want to delete<br />
              <span style={{ color: '#cccccc' }}>{deleteTarget}</span>?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  background: 'transparent', border: '1px solid #555', color: '#ccc',
                  borderRadius: 3, padding: '5px 14px', cursor: 'pointer', fontSize: 13,
                }}
              >Cancel</button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  background: '#c5231c', border: 'none', color: '#fff',
                  borderRadius: 3, padding: '5px 14px', cursor: 'pointer', fontSize: 13,
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {deleteError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#c5231c', color: '#fff',
          borderRadius: 4, padding: '10px 20px', fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', maxWidth: 480,
        }}>
          Delete failed: {deleteError}
          <button
            onClick={() => setDeleteError(null)}
            style={{
              marginLeft: 12, background: 'transparent', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>
      )}
    </div>
  );
}
