import { useRef, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { AgentMessage } from '../types';

interface ChatMessagesProps {
  messages: AgentMessage[];
  processing: boolean;
  onFileClick?: (path: string) => void;
}

function ToolMessage({ message }: { message: AgentMessage }) {
  const [expanded, setExpanded] = useState(false);

  let parsedResult: Record<string, unknown> | null = null;
  try {
    parsedResult = JSON.parse(message.content);
  } catch { /* not JSON */ }

  const isError = parsedResult && 'error' in parsedResult;
  const toolLabel = message.toolName?.replace('vfs_', '') ?? 'tool';

  return (
    <Box sx={{ px: 1, py: 0.25 }}>
      <Box
        onClick={() => setExpanded(e => !e)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          cursor: 'pointer', color: isError ? '#f48771' : '#6e9e6e',
          '&:hover': { color: isError ? '#ff9d8a' : '#8ec68e' },
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.1s' }}>
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <Typography sx={{ fontSize: 11, fontFamily: 'monospace' }}>
          {isError ? 'x' : '+'} {toolLabel}
          {message.affectedFiles?.length ? ` (${message.affectedFiles.join(', ')})` : ''}
        </Typography>
      </Box>

      {expanded && (
        <Box sx={{
          ml: 2, mt: 0.5, p: 0.75,
          bgcolor: '#1e1e1e', borderRadius: 0.5,
          fontSize: 11, fontFamily: 'monospace', color: '#b5b5b5',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 200, overflow: 'auto',
        }}>
          {parsedResult
            ? JSON.stringify(parsedResult, null, 2)
            : message.content}
        </Box>
      )}
    </Box>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
          return (
            <Box key={i} component="pre" sx={{
              bgcolor: '#1e1e1e', p: 1, my: 0.5,
              borderRadius: 0.5, fontSize: 11, fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              overflow: 'auto', maxHeight: 300,
            }}>
              {code}
            </Box>
          );
        }
        // Bold: **text**
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={i}>
            {boldParts.map((bp, j) => {
              if (bp.startsWith('**') && bp.endsWith('**')) {
                return <strong key={j}>{bp.slice(2, -2)}</strong>;
              }
              // Inline code: `text`
              const codeParts = bp.split(/(`[^`]+`)/g);
              return codeParts.map((cp, k) => {
                if (cp.startsWith('`') && cp.endsWith('`')) {
                  return (
                    <Box key={k} component="code" sx={{
                      bgcolor: '#1e1e1e', px: 0.5, py: 0.125,
                      borderRadius: 0.25, fontSize: '0.9em', fontFamily: 'monospace',
                    }}>
                      {cp.slice(1, -1)}
                    </Box>
                  );
                }
                return cp;
              });
            })}
          </span>
        );
      })}
    </>
  );
}

function AffectedFilesList({ files, onFileClick }: { files: string[]; onFileClick?: (path: string) => void }) {
  if (!files.length) return null;
  return (
    <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px solid #3c3c3c' }}>
      <Typography sx={{ fontSize: 10, color: '#888', mb: 0.25 }}>Files touched:</Typography>
      {files.map(f => (
        <Typography
          key={f}
          onClick={() => onFileClick?.(f)}
          sx={{
            fontSize: 11, fontFamily: 'monospace', color: '#4fc1ff',
            cursor: onFileClick ? 'pointer' : 'default',
            '&:hover': onFileClick ? { textDecoration: 'underline' } : {},
            pl: 0.5,
          }}
        >
          {f}
        </Typography>
      ))}
    </Box>
  );
}

function ProcessingIndicator() {
  return (
    <Box sx={{ px: 1.5, py: 0.5 }}>
      <Box sx={{
        display: 'inline-flex', gap: 0.5, px: 1.5, py: 0.75,
        bgcolor: '#2d2d2d', borderRadius: 1.5,
      }}>
        {[0, 1, 2].map(i => (
          <Box key={i} sx={{
            width: 6, height: 6, borderRadius: '50%', bgcolor: '#888',
            animation: 'agentDotPulse 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
            '@keyframes agentDotPulse': {
              '0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
              '40%': { opacity: 1, transform: 'scale(1)' },
            },
          }} />
        ))}
      </Box>
    </Box>
  );
}

export function ChatMessages({ messages, processing, onFileClick }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length, processing]);

  return (
    <Box ref={containerRef} sx={{
      flexGrow: 1, overflow: 'auto', py: 0.5,
      display: 'flex', flexDirection: 'column', gap: 0.5,
    }}>
      {messages.length === 0 && !processing && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, p: 2 }}>
          <Typography sx={{ color: '#6e6e6e', fontSize: 12, textAlign: 'center' }}>
            Ask the AI agent to explore, read, or edit files in your workspace.
          </Typography>
        </Box>
      )}

      {messages.map(msg => {
        if (msg.role === 'tool') {
          return <ToolMessage key={msg.id} message={msg} />;
        }

        if (msg.role === 'user') {
          return (
            <Box key={msg.id} sx={{ display: 'flex', justifyContent: 'flex-end', px: 1 }}>
              <Box sx={{
                bgcolor: '#264f78', px: 1.5, py: 0.75,
                borderRadius: '12px 12px 2px 12px',
                maxWidth: '85%',
              }}>
                {msg.attachments?.map((att, i) =>
                  att.mimeType.startsWith('image/') ? (
                    <Box key={i} component="img" src={att.dataUrl}
                      sx={{ maxWidth: 200, maxHeight: 150, borderRadius: 0.5, display: 'block', mb: 0.5 }} />
                  ) : (
                    <Box key={i} sx={{ fontSize: 11, color: '#a0c4f8', fontFamily: 'monospace', mb: 0.25 }}>
                      📎 {att.name}
                    </Box>
                  )
                )}
                {msg.content && (
                  <Typography sx={{ fontSize: 12.5, color: '#e0e0e0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }

        // assistant
        if (msg.toolCalls?.length && !msg.content) {
          return null; // tool-calling assistant messages without text are hidden
        }

        return (
          <Box key={msg.id} sx={{ px: 1 }}>
            <Box sx={{
              bgcolor: '#2d2d2d', px: 1.5, py: 0.75,
              borderRadius: '12px 12px 12px 2px',
              maxWidth: '95%',
            }}>
              <Typography component="div" sx={{
                fontSize: 12.5, color: '#d4d4d4',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                lineHeight: 1.5,
              }}>
                <SimpleMarkdown text={msg.content} />
              </Typography>
              {msg.affectedFiles && msg.affectedFiles.length > 0 && (
                <AffectedFilesList files={msg.affectedFiles} onFileClick={onFileClick} />
              )}
            </Box>
          </Box>
        );
      })}

      {processing && <ProcessingIndicator />}
    </Box>
  );
}
