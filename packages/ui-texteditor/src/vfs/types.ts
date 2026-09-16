import type React from 'react';
import type { FileSystemProvider } from '@hestia/core';
import type { VfsProviderDef } from './providerRegistry';
import type { VfsMountPreset } from './vfsMountPresets';
import type { ProjectActionExecutor } from './project/types';

export type VfsProjectLanguage = 'MicroPython' | 'Python' | 'C++' | string;

export function platformToLanguage(platform: string): VfsProjectLanguage {
  switch (platform) {
    case 'uPython':
      return 'MicroPython';
    case 'pygame':
      return 'Python';
    case 'Arduino':
    case 'PicoSdk':
      return 'C++';
    default:
      return platform;
  }
}

export interface VfsProjectContext {
  id: string;
  name: string;
  platform: string;
  /** Programming language derived from platform */
  language: VfsProjectLanguage;
  boardProfileKey?: string;
  /**
   * Custom FQBN (fully-qualified board name) for Arduino projects.
   * When set, takes precedence over the FQBN derived from boardProfileKey.
   * Example: "esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=4M,PSRAM=opi"
   */
  fqbn?: string;
  /** Absolute VFS path to the project.json file */
  projectJsonPath: string;
}

export interface VfsExplorerProps {
  provider: FileSystemProvider;
  rootPath?: string;
  width?: number | string;
  height?: number | string;
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onDirectoryChange?: (path: string) => void;
  /** Externally-controlled selected path — syncs tree selection and project context to this path. */
  selectedPath?: string;
  /** Called when the selected path's ancestor project context changes. Null when no project.json is found. */
  onProjectContext?: (context: VfsProjectContext | null) => void;
  /**
   * Dependencies for built-in Project.execute() (baseUrl, authToken, userName).
   * When provided, project actions are executed directly via the Project class — no external wiring needed.
   */
  projectDeps?: import('./project/types').ProjectDeps;
  /**
   * Override executor — takes precedence over built-in Project.execute() when provided.
   * Useful for custom handling or when projectDeps are not available.
   */
  onExecuteAction?: ProjectActionExecutor;
  /**
   * Called when a project action with `hasDialog: true` is clicked.
   * The host is responsible for showing a dialog. When the user confirms,
   * call `saveProjectJson(updates)` to persist changes and refresh the context.
   *
   * `saveProjectJson` merges `updates` into the existing project.json, writes it
   * back via VFS, invalidates the project context cache, and re-evaluates the context.
   */
  onDialogAction?: (
    actionId: string,
    context: VfsProjectContext,
    saveProjectJson: (updates: Record<string, unknown>) => Promise<void>
  ) => void;
  /**
   * Called for every output line produced by a project action.
   * When provided, the in-sidebar output panel is hidden (hideOutput=true implied).
   */
  onOutputLine?: (line: import('./project/types').OutputLine) => void;
  /** Called when a project action starts (true) or finishes (false). actionLabel provided on start. */
  onActionRunningChange?: (running: boolean, actionLabel?: string) => void;
  /** Suppress the in-sidebar output terminal (use when output is shown elsewhere). */
  hideOutput?: boolean;
  readOnly?: boolean;
  showBreadcrumbs?: boolean;
  className?: string;
  providerRegistry?: VfsProviderDef[];
  /** Built-in presets always shown in the mount manager (cannot be deleted by user). */
  defaultMountPresets?: VfsMountPreset[];
  onMountsChanged?: () => void;
  /** When provided, assigned to tree.refresh() so external callers can trigger a tree reload. */
  refreshRef?: React.MutableRefObject<(() => void) | null>;
  /** When provided, assigned to a function that aborts the currently running project action. */
  stopActionRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * When provided, assigned to a function that refreshes the tree and expands/loads the given paths.
   * Useful after agent writes — call with the list of written file paths to make them visible.
   */
  revealPathsRef?: React.MutableRefObject<((paths: string[]) => Promise<void>) | null>;
  /** Extra inline styles merged onto the root div (overrides width/height props). */
  style?: React.CSSProperties;
}

export interface VfsTreeNode {
  id: string;
  label: string;
  isDirectory: boolean;
  children?: VfsTreeNode[];
}
