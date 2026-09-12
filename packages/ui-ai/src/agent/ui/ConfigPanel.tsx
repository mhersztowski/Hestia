import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';

import type { AgentConfig, AiProviderType } from '../types';
import { DEFAULT_AGENT_CONFIG } from '../types';

const STORAGE_KEY = 'monaco-ai-agent-config';

export function loadAgentConfig(defaults?: Partial<AgentConfig>): AgentConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AgentConfig;
      const merged: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...defaults, ...parsed };
      // Auto-heal stale low maxTokens (old default was 4096, which truncated
      // write_file tool calls mid-content). There is no UI field to raise it.
      if (!merged.maxTokens || merged.maxTokens < DEFAULT_AGENT_CONFIG.maxTokens) {
        merged.maxTokens = DEFAULT_AGENT_CONFIG.maxTokens;
      }
      // defaults.providers[type].apiKey always wins — lets caller inject key from backend env
      if (defaults?.providers) {
        for (const type of Object.keys(defaults.providers) as AiProviderType[]) {
          const defaultKey = defaults.providers[type]?.apiKey;
          if (defaultKey) {
            merged.providers[type] = { ...merged.providers[type], apiKey: defaultKey };
          }
        }
      }
      return merged;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_AGENT_CONFIG, ...defaults };
}

export function saveAgentConfig(config: AgentConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

interface ConfigPanelProps {
  config: AgentConfig;
  onChange: (config: AgentConfig) => void;
}

const ExpandIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const inputSx = {
  fontSize: 12,
  bgcolor: '#3c3c3c',
  color: '#ccc',
  '& fieldset': { border: '1px solid #555' },
  '&:hover fieldset': { borderColor: '#777 !important' },
  '&.Mui-focused fieldset': { borderColor: '#007acc !important' },
  borderRadius: 0.5,
};

export function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const activeProvider = config.providers[config.providerType];

  const update = useCallback((patch: Partial<AgentConfig>) => {
    const next = { ...config, ...patch };
    onChange(next);
    saveAgentConfig(next);
  }, [config, onChange]);

  const updateProvider = useCallback((field: string, value: string) => {
    const next = {
      ...config,
      providers: {
        ...config.providers,
        [config.providerType]: {
          ...config.providers[config.providerType],
          [field]: value,
        },
      },
    };
    onChange(next);
    saveAgentConfig(next);
  }, [config, onChange]);

  return (
    <Box sx={{ borderBottom: '1px solid #3c3c3c' }}>
      <Box
        onClick={() => setExpanded(e => !e)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          px: 1, py: 0.5, cursor: 'pointer',
          '&:hover': { bgcolor: '#2a2d2e' },
        }}
      >
        <ExpandIcon expanded={expanded} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb', flexGrow: 1 }}>
          Configuration
        </Typography>
        <Typography sx={{ fontSize: 10, color: '#888' }}>
          {config.providerType} / {activeProvider.defaultModel || '—'}
        </Typography>
      </Box>

      {expanded && (
        <Box sx={{ px: 1, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Provider type */}
          <Box>
            <Typography sx={{ fontSize: 11, color: '#888', mb: 0.25 }}>Provider</Typography>
            <Select
              size="small"
              fullWidth
              value={config.providerType}
              onChange={(e) => update({ providerType: e.target.value as AiProviderType })}
              sx={{ ...inputSx, '& .MuiSelect-select': { py: 0.5, fontSize: 12 } }}
            >
              <MenuItem value="anthropic">Anthropic</MenuItem>
              <MenuItem value="openai">OpenAI</MenuItem>
              <MenuItem value="ollama">Ollama</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </Box>

          {/* API Key */}
          <Box>
            <Typography sx={{ fontSize: 11, color: '#888', mb: 0.25 }}>API Key</Typography>
            <TextField
              size="small"
              fullWidth
              type="password"
              value={activeProvider.apiKey}
              onChange={(e) => updateProvider('apiKey', e.target.value)}
              placeholder="sk-..."
              slotProps={{ input: { sx: { ...inputSx, py: 0 } } }}
            />
          </Box>

          {/* Base URL */}
          <Box>
            <Typography sx={{ fontSize: 11, color: '#888', mb: 0.25 }}>Base URL</Typography>
            <TextField
              size="small"
              fullWidth
              value={activeProvider.baseUrl}
              onChange={(e) => updateProvider('baseUrl', e.target.value)}
              slotProps={{ input: { sx: { ...inputSx, py: 0 } } }}
            />
          </Box>

          {/* Model */}
          <Box>
            <Typography sx={{ fontSize: 11, color: '#888', mb: 0.25 }}>Model</Typography>
            <TextField
              size="small"
              fullWidth
              value={activeProvider.defaultModel}
              onChange={(e) => updateProvider('defaultModel', e.target.value)}
              slotProps={{ input: { sx: { ...inputSx, py: 0 } } }}
            />
          </Box>

          {/* Clear history */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
            <IconButton
              size="small"
              title="Reset to defaults"
              onClick={() => {
                const next = { ...DEFAULT_AGENT_CONFIG };
                onChange(next);
                saveAgentConfig(next);
              }}
              sx={{ color: '#888', fontSize: 11, borderRadius: 0.5, px: 1, '&:hover': { bgcolor: '#3c3c3c' } }}
            >
              <Typography sx={{ fontSize: 11 }}>Reset</Typography>
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
