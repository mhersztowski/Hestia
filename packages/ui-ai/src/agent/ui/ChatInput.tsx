import { useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Paper from '@mui/material/Paper';

interface ChatInputProps {
  onSend: (message: string, attachments: File[]) => void;
  onClear?: () => void;
  disabled?: boolean;
  skills?: Map<string, string>;
  /** True while the agent is processing a prompt — swaps Send for a Stop button. */
  processing?: boolean;
  /** Interrupt the running prompt (aborts the in-flight request). */
  onStop?: () => void;
}

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 1.5l14 6.5-14 6.5V9l10-1-10-1V1.5z" />
  </svg>
);

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" rx="1" />
  </svg>
);

const AttachIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M13.5 7.5l-6 6a4 4 0 01-5.657-5.657l6.364-6.364a2.5 2.5 0 013.536 3.535L5.379 11.38a1 1 0 01-1.415-1.414l6.364-6.364"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ChatInput({ onSend, onClear, disabled, skills, processing, onStop }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed, attachments);
    setValue('');
    setAttachments([]);
    setSkillSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value, attachments, disabled, onSend]);

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    // Show skill autocomplete when value starts with /
    if (skills && skills.size > 0 && newValue.startsWith('/')) {
      const query = newValue.slice(1).toLowerCase();
      const matches = [...skills.keys()].filter(k => k.toLowerCase().startsWith(query));
      setSkillSuggestions(matches);
    } else {
      setSkillSuggestions([]);
    }
  }, [skills]);

  const applySkill = useCallback((name: string) => {
    const content = skills?.get(name) ?? '';
    setValue(content);
    setSkillSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [skills]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const canSend = (value.trim() || attachments.length > 0) && !disabled;

  return (
    <Box sx={{ borderTop: '1px solid #3c3c3c', position: 'relative' }}>
      {/* Skill autocomplete */}
      {skillSuggestions.length > 0 && (
        <Paper sx={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 10,
          bgcolor: '#252526', border: '1px solid #3c3c3c', borderRadius: 0.5,
          maxHeight: 180, overflowY: 'auto',
        }}>
          {skillSuggestions.map(name => (
            <Box
              key={name}
              onClick={() => applySkill(name)}
              sx={{
                px: 1.5, py: 0.75, cursor: 'pointer', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 1,
                '&:hover': { bgcolor: '#094771', color: '#fff' },
                color: '#ccc',
              }}
            >
              <Box component="span" sx={{ color: '#569cd6', fontFamily: 'monospace' }}>/{name}</Box>
              <Box component="span" sx={{ fontSize: 10, color: '#666' }}>skill</Box>
            </Box>
          ))}
        </Paper>
      )}
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pt: 0.75 }}>
          {attachments.map((file, idx) => {
            const isImage = file.type.startsWith('image/');
            const objUrl = isImage ? URL.createObjectURL(file) : null;
            return (
              <Box key={idx} sx={{
                position: 'relative',
                border: '1px solid #555',
                borderRadius: 0.5,
                overflow: 'hidden',
                bgcolor: '#2d2d2d',
              }}>
                {isImage && objUrl ? (
                  <Box
                    component="img"
                    src={objUrl}
                    onLoad={() => URL.revokeObjectURL(objUrl)}
                    sx={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <Box sx={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 0.25, p: 0.5 }}>
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="#888">
                      <path d="M4 1h6l4 4v9a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="#888" strokeWidth="1" fill="none" />
                      <path d="M10 1v4h4" stroke="#888" strokeWidth="1" fill="none" />
                    </svg>
                    <Box sx={{ fontSize: 9, color: '#888', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 48 }}>
                      {file.name}
                    </Box>
                  </Box>
                )}
                <IconButton
                  size="small"
                  onClick={() => removeAttachment(idx)}
                  sx={{
                    position: 'absolute', top: 0, right: 0,
                    p: 0.25, bgcolor: 'rgba(0,0,0,0.6)',
                    color: '#ccc', borderRadius: 0,
                    '&:hover': { bgcolor: 'rgba(200,0,0,0.7)' },
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Input row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, p: 1 }}>
        {/* Clear */}
        <Tooltip title="Clear conversation">
          <span>
            <IconButton
              size="small"
              onClick={onClear}
              disabled={disabled}
              sx={{ color: '#666', mb: 0.25, '&:hover': { color: '#f48771', bgcolor: '#3c3c3c' } }}
            >
              <ClearIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Attach */}
        <Tooltip title="Attach file or image">
          <span>
            <IconButton
              size="small"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              sx={{ color: '#666', mb: 0.25, '&:hover': { color: '#ccc', bgcolor: '#3c3c3c' } }}
            >
              <AttachIcon />
            </IconButton>
          </span>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,text/*,.pdf,.json,.md,.ts,.tsx,.js,.jsx,.py,.cpp,.c,.h"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          multiline
          maxRows={5}
          placeholder={disabled ? 'Processing...' : 'Ask the agent... (Shift+Enter = newline)'}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          slotProps={{
            input: {
              sx: {
                fontSize: 12,
                bgcolor: '#3c3c3c',
                color: '#ccc',
                '& fieldset': { border: '1px solid #555' },
                '&:hover fieldset': { borderColor: '#777 !important' },
                '&.Mui-focused fieldset': { borderColor: '#007acc !important' },
                borderRadius: 0.5,
                py: 0.75,
                px: 1,
              },
            },
          }}
        />

        {/* Send / Stop — while the agent is working the button becomes Stop,
            right beside the prompt rather than up in the panel's header. */}
        {processing ? (
          <Tooltip title="Zatrzymaj (przerwij prompt)">
            <IconButton
              size="small"
              onClick={onStop}
              sx={{ color: '#f48771', mb: 0.25, '&:hover': { bgcolor: '#3c3c3c' } }}
            >
              <StopIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton
            size="small"
            onClick={handleSend}
            disabled={!canSend}
            sx={{
              color: canSend ? '#007acc' : '#555',
              mb: 0.25,
              '&:hover': { bgcolor: '#3c3c3c' },
            }}
          >
            <SendIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
