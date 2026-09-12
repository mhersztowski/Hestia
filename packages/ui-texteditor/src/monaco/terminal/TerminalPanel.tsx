import { useEffect, useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { TerminalPanelProps, TerminalMessage } from './types';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000];

function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/terminal`;
}

function isSameOriginWs(wsUrl?: string): boolean {
  if (!wsUrl || typeof window === 'undefined') return true;
  try {
    return new URL(wsUrl).host === window.location.host;
  } catch {
    return true; // relative URL = same origin
  }
}

function resolveToken(propToken?: string, wsUrl?: string): string {
  if (propToken) return propToken;
  // Fallback to localStorage JWT only when connecting to the same origin.
  // A remote wsUrl (different host) requires an explicitly configured API key —
  // the local JWT is signed by a different secret and would be rejected (401).
  if (!isSameOriginWs(wsUrl)) return '';
  try {
    const stored = localStorage.getItem('minis_current_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.token) return parsed.token;
    }
  } catch { /* ignore */ }
  return '';
}

/** Derive the HTTP ticket endpoint from the WebSocket URL.
 *  wss://mycastle.hersztowski.org/ws/terminal → https://mycastle.hersztowski.org/api/terminal/ticket
 *  Falls back to the relative path when wsUrl is undefined or relative. */
function ticketUrl(wsUrl?: string): string {
  if (wsUrl) {
    try {
      const u = new URL(wsUrl);
      const proto = u.protocol === 'wss:' ? 'https:' : 'http:';
      return `${proto}//${u.host}/api/terminal/ticket`;
    } catch { /* relative URL or invalid — fall through */ }
  }
  return '/api/terminal/ticket';
}

async function fetchTicket(authToken: string, wsUrl?: string): Promise<string> {
  const res = await fetch(ticketUrl(wsUrl), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Ticket request failed: ${res.status}`);
  const data = await res.json();
  return data.ticket;
}

export function TerminalPanel({ wsUrl, token, onConfigRequest }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const reconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let term: import('@xterm/xterm').Terminal | null = null;
    let fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
    let ws: WebSocket | null = null;
    let observer: ResizeObserver | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const cleanup = () => {
      disposed = true;
      reconnectRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      observer?.disconnect();
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.onopen = null; ws.close(); }
      ws = null;
      term?.dispose();
      term = null;
      fitAddon = null;
    };

    const connect = async () => {
      if (disposed) return;

      const url = wsUrl || getDefaultWsUrl();
      if (!url) {
        setStatus('disconnected');
        return;
      }

      setStatus('connecting');

      // Step 1: Get one-time ticket via HTTP (uses Bearer auth which works reliably)
      let ticket: string;
      try {
        const authToken = resolveToken(token, wsUrl || getDefaultWsUrl());
        if (!authToken) throw new Error('No auth token available');
        ticket = await fetchTicket(authToken, wsUrl || getDefaultWsUrl());
      } catch (err) {
        if (disposed) return;
        const detail = err instanceof Error ? err.message : String(err);
        term?.write(`\r\n\x1b[31m--- Failed to get terminal ticket: ${detail} ---\x1b[0m\r\n`);
        setStatus('disconnected');
        return;
      }

      if (disposed) return;

      // Step 2: Open WebSocket and send ticket
      const socket = new WebSocket(url);
      ws = socket;

      socket.onopen = () => {
        if (disposed) { socket.close(); return; }
        socket.send(JSON.stringify({ type: 'auth', ticket }));
      };

      socket.onmessage = (event) => {
        try {
          const msg: TerminalMessage = JSON.parse(event.data);
          if (msg.type === 'output' && msg.data) {
            setStatus('connected');
            reconnectAttempt = 0;
            term?.write(msg.data);
          } else if (msg.type === 'error') {
            term?.write(`\r\n\x1b[31m--- ${msg.data ?? 'Error'} ---\x1b[0m\r\n`);
            socket.close();
          } else if (msg.type === 'exit') {
            term?.write(`\r\n\x1b[33m--- Process exited (code ${msg.code ?? '?'}) ---\x1b[0m\r\n`);
            setStatus('disconnected');
          }
        } catch {
          // Ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        ws = null;
        setStatus('disconnected');

        if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 4000;
          reconnectAttempt++;
          term?.write(`\r\n\x1b[33m--- Disconnected. Reconnecting in ${delay / 1000}s... ---\x1b[0m\r\n`);
          reconnectTimer = setTimeout(() => { connect(); }, delay);
        } else {
          term?.write('\r\n\x1b[31m--- Connection lost. Click to reconnect. ---\x1b[0m\r\n');
          reconnectRef.current = () => {
            reconnectAttempt = 0;
            connect();
          };
        }
      };

      socket.onerror = () => {
        // onclose will fire after onerror
      };
    };

    // Dynamic import of xterm (optional peer dependency)
    (async () => {
      try {
        const [xtermMod, fitMod] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);

        if (disposed) return;

        term = new xtermMod.Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
          },
        });

        fitAddon = new fitMod.FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);
        requestAnimationFrame(() => { if (!disposed) fitAddon?.fit(); });

        observer = new ResizeObserver(() => {
          if (disposed) return;
          fitAddon?.fit();
          if (ws?.readyState === WebSocket.OPEN && term) {
            const msg: TerminalMessage = {
              type: 'resize',
              cols: term.cols,
              rows: term.rows,
            };
            ws.send(JSON.stringify(msg));
          }
        });
        observer.observe(container);

        term.onData((data) => {
          if (ws?.readyState === WebSocket.OPEN) {
            const msg: TerminalMessage = { type: 'input', data };
            ws.send(JSON.stringify(msg));
          }
        });

        await connect();
      } catch (err) {
        console.error('[TerminalPanel] Failed to initialize xterm:', err);
        if (!disposed) {
          setStatus('disconnected');
        }
      }
    })();

    return cleanup;
  }, [wsUrl, token]);

  const handleClick = useCallback(() => {
    reconnectRef.current?.();
  }, []);

  const statusColor = status === 'connected' ? '#4ec94e' : status === 'connecting' ? '#e8ab3a' : '#888';

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      bgcolor: '#1e1e1e',
      overflow: 'hidden',
    }}>
      {/* Terminal header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1,
        py: 0.25,
        bgcolor: '#252526',
        borderBottom: '1px solid #3c3c3c',
        flexShrink: 0,
        gap: 0.75,
        minHeight: 26,
      }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb' }}>
          Terminal
        </Typography>
        <Box sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: statusColor,
          flexShrink: 0,
        }} />
        <Typography sx={{ fontSize: 10, color: '#888' }}>
          {status}
        </Typography>
        {onConfigRequest && (
          <Box
            component="button"
            onClick={onConfigRequest}
            title="Configure terminal connection"
            sx={{
              all: 'unset', ml: 'auto', cursor: 'pointer', color: '#555',
              fontSize: 13, lineHeight: 1, px: 0.5, borderRadius: 0.5,
              '&:hover': { color: '#ccc' },
            }}
          >
            ⚙
          </Box>
        )}
      </Box>

      {/* Terminal container */}
      <Box
        ref={containerRef}
        onClick={handleClick}
        sx={{ flexGrow: 1, overflow: 'hidden', px: 0.5, py: 0.25 }}
      />
    </Box>
  );
}
