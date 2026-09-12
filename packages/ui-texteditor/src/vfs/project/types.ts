import type { VfsProjectContext } from '../types';

export interface ProjectAction {
  id: string;
  label: string;
  description?: string;
  /** If true, clicking opens the output panel in VfsExplorer */
  hasOutput: boolean;
  /**
   * If true, clicking calls onDialogAction instead of execute().
   * The action does not produce output — it opens a dialog managed by the host.
   */
  hasDialog?: boolean;
  /** Optional shortcut hint shown in tooltip */
  shortcut?: string;
}

/** Runtime dependencies injected into Project instances by VfsExplorer. */
export interface ProjectDeps {
  /** API base URL (e.g. '' for same-origin or 'http://host:1894') */
  baseUrl: string;
  /** Bearer token for Authorization header */
  authToken?: string;
  /** Currently authenticated user name */
  userName: string;
}

/**
 * Executor callback — used when consuming app wants to override execution.
 * If projectDeps are provided, Project.execute() is used instead.
 */
export type ProjectActionExecutor = (
  actionId: string,
  context: VfsProjectContext,
  /** Path of the file currently selected in VfsExplorer (helps derive sketchName) */
  selectedPath: string | null,
  onOutput: (line: string) => void,
  signal: AbortSignal,
) => Promise<{ success: boolean; error?: string }>;

export interface OutputLine {
  text: string;
  timestamp: number;
  type: 'normal' | 'error' | 'warning' | 'success' | 'command';
}

export function classifyLine(text: string): OutputLine['type'] {
  const lower = text.toLowerCase();
  if (/\berror\b/.test(lower) || lower.startsWith('err:') || lower.startsWith('[error]')) return 'error';
  if (/\bwarning\b/.test(lower) || lower.startsWith('warn:') || lower.startsWith('[warn]')) return 'warning';
  if (/\bsuccess\b|\bdone\b|\bfinished\b|\bcomplete/.test(lower)) return 'success';
  if (text.startsWith('>') || text.startsWith('$') || text.startsWith('#')) return 'command';
  return 'normal';
}
