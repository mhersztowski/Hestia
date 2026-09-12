import type { VfsProjectContext } from '../types';
import type { ProjectAction, ProjectDeps } from './types';

export abstract class Project {
  constructor(
    protected readonly context: VfsProjectContext,
    protected readonly deps: ProjectDeps,
  ) {}

  /** Short label for the project type (e.g. "Arduino", "MicroPython") */
  abstract getTypeLabel(): string;

  /** All actions available for this project type */
  abstract getActions(): ProjectAction[];

  /**
   * Execute an action.
   * @param actionId - which action to run
   * @param selectedPath - currently selected VFS path (to derive sketchName etc.)
   * @param onOutput - stream output lines to the terminal panel
   * @param signal - AbortSignal from Stop button
   */
  abstract execute(
    actionId: string,
    selectedPath: string | null,
    onOutput: (line: string) => void,
    signal: AbortSignal,
  ): Promise<{ success: boolean; error?: string }>;

  get projectContext(): VfsProjectContext {
    return this.context;
  }

  // ── Shared helpers ──────────────────────────────────────────────────────

  protected async apiPost<T = Record<string, unknown>>(
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.deps.authToken) headers['Authorization'] = `Bearer ${this.deps.authToken}`;
    const res = await fetch(`${this.deps.baseUrl}/api${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Derive the sketch name from a VFS file path relative to the project root.
   * Project root is the directory containing project.json.
   * Looks for a path segment after 'sketches/'.
   */
  protected deriveSketchName(selectedPath: string | null): string | null {
    if (!selectedPath) return null;
    const projectRoot = this.context.projectJsonPath.replace(/\/project\.json$/, '');
    if (!selectedPath.startsWith(projectRoot + '/')) return null;
    const relative = selectedPath.slice(projectRoot.length + 1); // e.g. 'sketches/basic_sensor/main.py'
    const parts = relative.split('/');
    const idx = parts.indexOf('sketches');
    if (idx >= 0 && idx + 1 < parts.length) return parts[idx + 1];
    // Fallback: first directory level (for flat src/ layouts)
    return parts.length > 1 ? parts[0] : null;
  }

  protected promptPort(defaultPort = '/dev/ttyUSB0'): string | null {
    return window.prompt('Serial port:', defaultPort);
  }

  /**
   * GET endpoint with SSE streaming.
   * Events: `event: output  data: {"chunk":"..."}` → streamed to onOutput
   *         `event: done    data: {"success":bool, "exitCode":n, ...}` → returned
   */
  protected async apiGetSSE<TDone = Record<string, unknown>>(
    path: string,
    params: Record<string, string>,
    onOutput: (line: string) => void,
    signal: AbortSignal,
  ): Promise<TDone> {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.deps.authToken) headers['Authorization'] = `Bearer ${this.deps.authToken}`;

    const qs = new URLSearchParams(params).toString();
    const url = `${this.deps.baseUrl}/api${path}${qs ? '?' + qs : ''}`;

    const res = await fetch(url, { headers, signal });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buf = '';
    let eventType = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buf.split('\n');
      buf = lines.pop() ?? ''; // keep incomplete last line

      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const payload = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
          if (eventType === 'output' && typeof payload.chunk === 'string') {
            // Split multi-line chunks
            for (const l of payload.chunk.split('\n')) {
              if (l) onOutput(l);
            }
          } else if (eventType === 'done') {
            reader.cancel();
            return payload as TDone;
          }
          eventType = '';
        } else if (line === '') {
          eventType = '';
        }
      }
    }

    throw new Error('SSE stream ended without done event');
  }
}
