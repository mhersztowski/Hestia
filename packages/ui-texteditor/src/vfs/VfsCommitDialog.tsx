import { useState, useEffect, useCallback } from 'react';
import { decodeText } from '@hestia/core';
import type { WritableGitHubFS } from '@hestia/core';

// ── Simple unified diff ───────────────────────────────────────────────────────

type DiffOp = '=' | '+' | '-';
interface DiffLine { op: DiffOp; line: string }

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const m = a.length;
  const n = b.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      result.push({ op: '=', line: a[i++] }); j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ op: '+', line: b[j++] });
    } else {
      result.push({ op: '-', line: a[i++] });
    }
  }
  return result;
}

// Show only changed lines with N lines of context
function withContext(lines: DiffLine[], ctx = 3): DiffLine[] {
  const changed = new Set<number>();
  lines.forEach((l, i) => { if (l.op !== '=') changed.add(i); });

  const visible = new Set<number>();
  for (const idx of changed) {
    for (let k = Math.max(0, idx - ctx); k <= Math.min(lines.length - 1, idx + ctx); k++) {
      visible.add(k);
    }
  }

  const result: DiffLine[] = [];
  let prev = -1;
  for (const idx of Array.from(visible).sort((a, b) => a - b)) {
    if (prev !== -1 && idx > prev + 1) result.push({ op: '=', line: '…' });
    result.push(lines[idx]);
    prev = idx;
  }
  return result;
}

// ── File status helper ────────────────────────────────────────────────────────

type FileStatus = 'added' | 'modified' | 'deleted';

function fileStatus(base: Uint8Array | null, pending: Uint8Array | null): FileStatus {
  if (pending === null) return 'deleted';
  if (base === null) return 'added';
  return 'modified';
}

const STATUS_LABEL: Record<FileStatus, string> = { added: 'A', modified: 'M', deleted: 'D' };
const STATUS_COLOR: Record<FileStatus, string> = { added: '#89d185', modified: '#dcdcaa', deleted: '#f14c4c' };

// ── Diff view ─────────────────────────────────────────────────────────────────

function DiffView({ base, pending }: { base: Uint8Array | null; pending: Uint8Array | null }) {
  const status = fileStatus(base, pending);

  if (status === 'deleted') {
    return (
      <div style={{ padding: 12, color: '#f14c4c', fontFamily: 'monospace', fontSize: 12 }}>
        File will be deleted.
      </div>
    );
  }

  let oldText = '';
  let newText = '';
  let isBinary = false;

  try {
    oldText = base ? decodeText(base) : '';
    newText = pending ? decodeText(pending) : '';
  } catch {
    isBinary = true;
  }

  if (isBinary) {
    return (
      <div style={{ padding: 12, color: '#9cdcfe', fontFamily: 'monospace', fontSize: 12 }}>
        Binary file {status === 'added' ? 'added' : 'modified'}.
      </div>
    );
  }

  if (status === 'added') {
    const lines = newText.split('\n');
    return (
      <div style={{ overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 12 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', background: '#1e3a1e' }}>
            <span style={{ width: 28, color: '#4d4d4d', userSelect: 'none', textAlign: 'right', paddingRight: 6, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ color: '#89d185', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>+{line}</span>
          </div>
        ))}
      </div>
    );
  }

  const diffLines = withContext(computeDiff(oldText, newText));

  return (
    <div style={{ overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 12 }}>
      {diffLines.map((dl, i) => {
        const bg = dl.op === '+' ? '#1e3a1e' : dl.op === '-' ? '#3a1e1e' : 'transparent';
        const color = dl.op === '+' ? '#89d185' : dl.op === '-' ? '#f14c4c' : '#8c8c8c';
        const prefix = dl.op === '+' ? '+' : dl.op === '-' ? '-' : ' ';
        return (
          <div key={i} style={{ display: 'flex', background: bg }}>
            <span style={{ width: 16, color: '#4d4d4d', userSelect: 'none', flexShrink: 0, paddingLeft: 4 }}>{prefix}</span>
            <span style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{dl.line}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface PendingFile {
  path: string;
  content: Uint8Array | null;
  base: Uint8Array | null;
  status: FileStatus;
}

interface VfsCommitDialogProps {
  provider: WritableGitHubFS;
  onClose: () => void;
  onCommit: (message: string) => Promise<void>;
}

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function VfsCommitDialog({ provider, onClose, onCommit }: VfsCommitDialogProps) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState(() => formatDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const entries = provider.getPendingEntries();
      const loaded: PendingFile[] = await Promise.all(
        entries.map(async ({ path, content }) => {
          const base = await provider.getBaseContent(path);
          return { path, content, base, status: fileStatus(base, content) };
        }),
      );
      if (!cancelled) {
        setFiles(loaded);
        setSelected(loaded[0]?.path ?? null);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [provider]);

  const handleCommit = useCallback(async () => {
    if (!message.trim()) return;
    setCommitting(true);
    try {
      await onCommit(message.trim());
      onClose();
    } catch (err) {
      console.error('Commit error:', err);
      setCommitting(false);
    }
  }, [message, onCommit, onClose]);

  const selectedFile = files.find((f) => f.path === selected) ?? null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 760, maxWidth: '95vw', height: 520, maxHeight: '90vh',
          background: '#252526', border: '1px solid #454545', borderRadius: 6,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#cccccc',
        }}
      >
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #3c3c3c', fontSize: 13, fontWeight: 600 }}>
          Commit changes
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c', fontSize: 13 }}>
            Loading diff…
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* File list */}
            <div style={{ width: 220, borderRight: '1px solid #3c3c3c', overflowY: 'auto', flexShrink: 0 }}>
              {files.map((f) => (
                <div
                  key={f.path}
                  onClick={() => setSelected(f.path)}
                  style={{
                    padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                    background: selected === f.path ? '#094771' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ color: STATUS_COLOR[f.status], fontWeight: 700, width: 12, flexShrink: 0 }}>
                    {STATUS_LABEL[f.status]}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#cccccc' }}
                    title={f.path}>
                    {f.path.split('/').pop()}
                  </span>
                </div>
              ))}
            </div>

            {/* Diff view */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {selectedFile && (
                <>
                  <div style={{ padding: '4px 10px', fontSize: 11, color: '#8c8c8c', borderBottom: '1px solid #3c3c3c', flexShrink: 0 }}>
                    {selectedFile.path}
                  </div>
                  <DiffView base={selectedFile.base} pending={selectedFile.content} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #3c3c3c', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
            style={{
              flex: 1, padding: '5px 8px', fontSize: 13,
              background: '#3c3c3c', border: '1px solid #555', borderRadius: 3, color: '#cccccc', outline: 'none',
            }}
          />
          <button
            onClick={handleCommit}
            disabled={committing || !message.trim() || loading}
            style={{
              padding: '5px 16px', fontSize: 13, cursor: 'pointer',
              background: '#0e639c', color: '#fff', border: 'none', borderRadius: 3,
              opacity: (committing || !message.trim() || loading) ? 0.5 : 1,
            }}
          >
            {committing ? 'Committing…' : 'Commit'}
          </button>
          <button
            onClick={onClose}
            disabled={committing}
            style={{
              padding: '5px 12px', fontSize: 13, cursor: 'pointer',
              background: 'transparent', color: '#cccccc', border: '1px solid #555', borderRadius: 3,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
