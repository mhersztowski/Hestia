import { useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import type { OutputLine } from '../vfs/project/types';
import { TerminalPanel } from './terminal/TerminalPanel';

/* ── Tab types ── */

export interface TerminalTab { id: string; type: 'terminal'; label: string }
export interface OutputTab   { id: string; type: 'output';   label: string; lines: OutputLine[]; running: boolean }
export type BottomTab = TerminalTab | OutputTab;

/* ── Colors ── */

const LINE_COLOR: Record<OutputLine['type'], string> = {
  normal:  '#cccccc',
  error:   '#f48771',
  warning: '#dcdcaa',
  success: '#89d185',
  command: '#888888',
};

/* ── Icons ── */

function TermIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M2 3l5 5-5 5" /><path d="M8 13h6" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ── Props ── */

export interface BottomPanelProps {
  tabs: BottomTab[];
  activeTabId: string;
  onTabChange(id: string): void;
  onAddTerminal(): void;
  onCloseTab(id: string): void;
  wsUrl?: string;
  token?: string;
  onConfigRequest?: () => void;
  enableTerminal?: boolean;
}

/* ── Component ── */

export function BottomPanel({ tabs, activeTabId, onTabChange, onAddTerminal, onCloseTab, wsUrl, token, onConfigRequest, enableTerminal }: BottomPanelProps) {
  const outputScrollRef = useRef<HTMLDivElement | null>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Auto-scroll output to bottom when lines change
  const activeLines = activeTab?.type === 'output' ? activeTab.lines : null;
  useEffect(() => {
    const el = outputScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeLines?.length]);

  const handleClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onCloseTab(id);
  }, [onCloseTab]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>

      {/* ── Tab bar ── */}
      <Box sx={{
        display: 'flex', alignItems: 'stretch', height: 30, flexShrink: 0,
        background: '#1e1e1e', borderBottom: '1px solid #252526',
        overflowX: 'auto', overflowY: 'hidden',
        '&::-webkit-scrollbar': { height: 3 },
        '&::-webkit-scrollbar-thumb': { background: '#555' },
      }}>
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          return (
            <Box
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.5, flexShrink: 0, cursor: 'pointer',
                borderRight: '1px solid #252526',
                borderBottom: active ? '1px solid #0d1117' : '1px solid transparent',
                background: active ? '#0d1117' : 'transparent',
                color: active ? '#ccc' : '#666',
                fontSize: 12,
                '&:hover': { color: '#ccc', background: active ? '#0d1117' : '#252526' },
                position: 'relative',
              }}
            >
              {tab.type === 'output' && tab.running ? <Spinner /> : tab.type === 'terminal' ? <TermIcon /> : null}
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab.label}
              </span>
              {/* Close button */}
              <Box
                component="span"
                onClick={e => handleClose(e, tab.id)}
                sx={{
                  ml: 0.25, display: 'flex', alignItems: 'center',
                  color: '#444', cursor: 'pointer', lineHeight: 1,
                  '&:hover': { color: '#fff' },
                  fontSize: 14,
                }}
              >×</Box>
            </Box>
          );
        })}

        {/* Add terminal button — admin only */}
        {enableTerminal && (
          <Box
            onClick={onAddTerminal}
            title="New Terminal"
            sx={{
              px: 1, display: 'flex', alignItems: 'center', cursor: 'pointer',
              color: '#555', fontSize: 16, lineHeight: 1, flexShrink: 0,
              '&:hover': { color: '#ccc', background: '#252526' },
            }}
          >+</Box>
        )}
      </Box>

      {/* ── Content ── */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Terminal tabs — all mounted, only active visible so connections stay alive */}
        {tabs.filter(t => t.type === 'terminal').map(tab => (
          <Box
            key={tab.id}
            sx={{
              position: 'absolute', inset: 0,
              visibility: tab.id === activeTabId ? 'visible' : 'hidden',
              pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
            }}
          >
            <TerminalPanel wsUrl={wsUrl} token={token} onConfigRequest={onConfigRequest} />
          </Box>
        ))}

        {/* Output tab */}
        {activeTab?.type === 'output' && (
          <Box ref={outputScrollRef} sx={{ height: '100%', overflowY: 'auto', py: 0.5 }}>
            {activeTab.lines.map((line, i) => (
              <Box
                key={i}
                sx={{
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: 12, lineHeight: '18px', px: 1,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  color: LINE_COLOR[line.type],
                }}
              >
                {line.text}
              </Box>
            ))}
          </Box>
        )}

        {/* Empty state */}
        {tabs.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 12 }}>
            Click + to open a terminal
          </Box>
        )}
      </Box>
    </Box>
  );
}
