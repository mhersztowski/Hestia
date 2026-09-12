import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';

import { encodeText, decodeText } from '@hestia/core';
import type { FileSystemProvider } from '@hestia/core';
import type { AgentConfig, AgentMessage, AiProvider, ChatSession, ChatAttachment } from '../types';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenAiCompatibleProvider } from '../providers/OpenAiCompatibleProvider';
import { AgentEngine } from '../engine/AgentEngine';
import { ConfigPanel, loadAgentConfig } from './ConfigPanel';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

function createProvider(type: string): AiProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider();
    default:
      return new OpenAiCompatibleProvider();
  }
}

interface AgentPanelProps {
  provider: FileSystemProvider;
  defaultConfig?: Partial<AgentConfig>;
  onFileOpen?: (path: string) => void;
  providerVersion?: number;
  webFetchUrl?: string;
  authToken?: string;
  /** Extra context injected into the system prompt (e.g. workspace structure, user info). */
  injectedClaudeMd?: string;
  /** Called whenever the agent writes/deletes/renames files. Useful for syncing open tabs. */
  onFileWritten?: (paths: string[]) => void;
}

/** Imperative handle exposed via ref — lets a host drive the panel programmatically. */
export interface AgentPanelHandle {
  /** Submit `text` to the agent as if the user typed and sent it. */
  sendPrompt: (text: string) => void;
}

export const AgentPanel = forwardRef<AgentPanelHandle, AgentPanelProps>(function AgentPanel(
  { provider, defaultConfig, onFileOpen, providerVersion, webFetchUrl, authToken, injectedClaudeMd, onFileWritten },
  ref,
) {
  const [config, setConfig] = useState<AgentConfig>(() => loadAgentConfig(defaultConfig));
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [skills, setSkills] = useState<Map<string, string>>(new Map());
  const engineRef = useRef<AgentEngine | null>(null);

  // Create/update engine when config changes
  useEffect(() => {
    const aiProvider = createProvider(config.providerType);
    const providerConfig = config.providers[config.providerType];

    if (engineRef.current) {
      engineRef.current.updateConfig(
        aiProvider,
        providerConfig,
        config.maxIterations,
        config.temperature,
        config.maxTokens,
        webFetchUrl,
        authToken,
        injectedClaudeMd,
      );
    } else {
      const engine = new AgentEngine(
        provider,
        {
          onMessage: (msg) => setMessages(prev => [...prev, msg]),
          onProcessingChange: setProcessing,
          onFileWritten,
        },
        aiProvider,
        providerConfig,
        config.maxIterations,
        config.temperature,
        config.maxTokens,
        webFetchUrl,
        authToken,
        injectedClaudeMd,
      );
      engineRef.current = engine;
      // Eagerly load CLAUDE.md + skills so autocomplete works immediately
      engine.initialize().then(() => {
        setSkills(new Map(engine.getSkills()));
      }).catch(() => {/* ignore */});
    }
  }, [config, provider, webFetchUrl, authToken, injectedClaudeMd, onFileWritten]);

  const handleSend = useCallback(async (text: string, files: File[]) => {
    if (!engineRef.current) return;

    const providerConfig = config.providers[config.providerType];
    if (!providerConfig.apiKey && config.providerType !== 'ollama') {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Please configure your API key in the Configuration panel above.',
        timestamp: Date.now(),
      }]);
      return;
    }

    // Convert File[] to ChatAttachment[]
    const attachments: ChatAttachment[] = await Promise.all(
      files.map(file => new Promise<ChatAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, dataUrl: reader.result as string, mimeType: file.type || 'application/octet-stream' });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })),
    );

    try {
      await engineRef.current.process(text, attachments.length ? attachments : undefined);
      // Refresh skills after first process (CLAUDE.md + skills-lock loaded)
      setSkills(new Map(engineRef.current.getSkills()));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      }]);
      setProcessing(false);
    }
  }, [config]);

  useImperativeHandle(ref, () => ({
    sendPrompt: (text: string) => { void handleSend(text, []); },
  }), [handleSend]);

  const handleStop = useCallback(() => {
    engineRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    engineRef.current?.clearHistory();
    setMessages([]);
    setSkills(new Map());
  }, []);

  // Re-scan CLAUDE.md + skills when mounts change
  const prevProviderVersionRef = useRef(providerVersion);
  useEffect(() => {
    if (prevProviderVersionRef.current === providerVersion) return;
    prevProviderVersionRef.current = providerVersion;
    if (!engineRef.current) return;
    engineRef.current.refreshSkills().then(() => {
      setSkills(new Map(engineRef.current!.getSkills()));
    }).catch(() => {});
  }, [providerVersion]);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  /* ── Load session ── */

  const [loadOpen, setLoadOpen] = useState(false);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const handleOpenLoad = useCallback(async () => {
    setLoadOpen(true);
    setLoadingList(true);
    try {
      const entries = await provider.readDirectory('/home/chats');
      const files = entries
        .filter(e => e.name.endsWith('.chat.json'))
        .map(e => e.name)
        .sort()
        .reverse(); // newest first
      setSessionFiles(files);
    } catch {
      setSessionFiles([]);
    }
    setLoadingList(false);
  }, [provider]);

  const handleLoadSession = useCallback(async (name: string) => {
    setLoadOpen(false);
    try {
      const data = await provider.readFile(`/home/chats/${name}`);
      const session = JSON.parse(decodeText(data)) as ChatSession;
      if (session.type !== 'chat_session') return;
      engineRef.current?.loadHistory(session.messages);
      setMessages(session.messages);
    } catch { /* ignore */ }
  }, [provider]);

  const handleSave = useCallback(async () => {
    if (messages.length === 0 || !provider.writeFile) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const session: ChatSession = { type: 'chat_session', savedAt: Date.now(), messages };
    const data = encodeText(JSON.stringify(session, null, 2));
    try {
      if (provider.mkdir) {
        try { await provider.mkdir('/home/chats'); } catch { /* already exists */ }
      }
      await provider.writeFile(`/home/chats/${name}.chat.json`, data, { overwrite: false });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [messages, provider]);

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column',
      height: '100%', bgcolor: '#252526', color: '#ccc',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center',
        px: 1, py: 0.5, borderBottom: '1px solid #3c3c3c',
      }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb', flexGrow: 1 }}>
          AI Agent
        </Typography>
        <Tooltip title="Load saved session">
          <span>
            <IconButton
              size="small"
              onClick={handleOpenLoad}
              sx={{ color: '#888', '&:hover': { bgcolor: '#3c3c3c' } }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 11V13a1 1 0 001 1h10a1 1 0 001-1v-2M8 2v8M5 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Save failed' : 'Save session to /home/chats/'}>
          <span>
            <IconButton
              size="small"
              onClick={handleSave}
              disabled={messages.length === 0 || saveStatus !== 'idle'}
              sx={{
                color: saveStatus === 'saved' ? '#89d185' : saveStatus === 'error' ? '#f48771' : '#888',
                '&:hover': { bgcolor: '#3c3c3c' },
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M13 11v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Config */}
      <ConfigPanel config={config} onChange={setConfig} />

      {/* Messages */}
      <ChatMessages messages={messages} processing={processing} onFileClick={onFileOpen} />

      {/* Input */}
      <ChatInput onSend={handleSend} onClear={handleClear} disabled={processing} skills={skills} processing={processing} onStop={handleStop} />

      {/* Load session dialog */}
      <Dialog
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        PaperProps={{ sx: { bgcolor: '#252526', color: '#ccc', minWidth: 320, border: '1px solid #3c3c3c' } }}
      >
        <DialogTitle sx={{ fontSize: 13, pb: 0.5, color: '#ccc' }}>Load Session</DialogTitle>
        <DialogContent sx={{ pt: 0.5, px: 0 }}>
          {loadingList ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : sessionFiles.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: '#666', px: 2, py: 1 }}>
              No saved sessions in /home/chats/
            </Typography>
          ) : (
            <List dense disablePadding>
              {sessionFiles.map(name => (
                <ListItemButton
                  key={name}
                  onClick={() => handleLoadSession(name)}
                  sx={{ px: 2, py: 0.5, '&:hover': { bgcolor: '#094771' } }}
                >
                  <ListItemText
                    primary={name.replace('.chat.json', '')}
                    primaryTypographyProps={{ fontSize: 12, fontFamily: 'monospace', color: '#ccc' }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
});
