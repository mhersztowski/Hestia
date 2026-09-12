import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  TextField,
  Button,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MediaPickerDialog from '../components/MediaPickerDialog';

const AudioNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode, selected }) => {
  const [isEditing, setIsEditing] = useState(!node.attrs.src);
  const [isHovered, setIsHovered] = useState(false);
  const [editSrc, setEditSrc] = useState(node.attrs.src || '');
  const [editTitle, setEditTitle] = useState(node.attrs.title || '');
  const [editControls, setEditControls] = useState(node.attrs.controls !== false);
  const [editAutoplay, setEditAutoplay] = useState(node.attrs.autoplay || false);
  const [editLoop, setEditLoop] = useState(node.attrs.loop || false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const srcInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (isEditing && srcInputRef.current) {
      srcInputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!initializedRef.current && !node.attrs.src) {
      setIsEditing(true);
      initializedRef.current = true;
    }
  }, [node.attrs.src]);

  useEffect(() => {
    setEditSrc(node.attrs.src || '');
    setEditTitle(node.attrs.title || '');
    setEditControls(node.attrs.controls !== false);
    setEditAutoplay(node.attrs.autoplay || false);
    setEditLoop(node.attrs.loop || false);
    setAudioError(false);
  }, [node.attrs]);

  const startEditing = () => {
    setEditSrc(node.attrs.src || '');
    setEditTitle(node.attrs.title || '');
    setEditControls(node.attrs.controls !== false);
    setEditAutoplay(node.attrs.autoplay || false);
    setEditLoop(node.attrs.loop || false);
    setIsEditing(true);
  };

  const handleSave = () => {
    updateAttributes({
      src: editSrc,
      title: editTitle,
      controls: editControls,
      autoplay: editAutoplay,
      loop: editLoop,
    });
    setIsEditing(false);
    setAudioError(false);
  };

  const handleCancel = () => {
    if (!node.attrs.src) {
      deleteNode();
      return;
    }
    setEditSrc(node.attrs.src || '');
    setEditTitle(node.attrs.title || '');
    setEditControls(node.attrs.controls !== false);
    setEditAutoplay(node.attrs.autoplay || false);
    setEditLoop(node.attrs.loop || false);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleMediaPicked = (mediaUrl: string, mediaPath: string) => {
    setEditSrc(mediaUrl);
    if (!editTitle) {
      const filename = mediaPath.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      setEditTitle(nameWithoutExt);
    }
    setAudioError(false);
  };

  if (isEditing) {
    return (
      <NodeViewWrapper className="audio-node-wrapper">
        <Paper
          elevation={2}
          sx={{
            p: 2,
            my: 1,
            border: '2px solid #9c27b0',
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle2" color="secondary" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AudiotrackIcon /> Edit audio
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                inputRef={srcInputRef}
                label="URL audio"
                value={editSrc}
                onChange={(e) => setEditSrc(e.target.value)}
                onKeyDown={handleKeyDown}
                size="small"
                fullWidth
                placeholder="https://example.com/audio.mp3 lub wybierz z plików"
              />
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => setMediaPickerOpen(true)}
                startIcon={<FolderOpenIcon />}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Przeglądaj
              </Button>
            </Box>

            <TextField
              label="Tytuł"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              fullWidth
              placeholder="Nazwa utworu"
            />

            <Divider />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editControls}
                    onChange={(e) => setEditControls(e.target.checked)}
                    color="secondary"
                  />
                }
                label="Pokaż kontrolki"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editAutoplay}
                    onChange={(e) => setEditAutoplay(e.target.checked)}
                    color="secondary"
                  />
                }
                label="Autoodtwarzanie"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editLoop}
                    onChange={(e) => setEditLoop(e.target.checked)}
                    color="secondary"
                  />
                }
                label="Zapętlenie"
              />
            </Box>

            {editSrc && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Podgląd:
                </Typography>
                <Box
                  sx={{
                    mt: 0.5,
                    p: 2,
                    bgcolor: '#f5f5f5',
                    borderRadius: 1,
                  }}
                >
                  <audio
                    src={editSrc}
                    controls
                    style={{ width: '100%' }}
                    onError={() => setAudioError(true)}
                    onLoadedData={() => setAudioError(false)}
                  />
                  {audioError && (
                    <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
                      Nie można załadować audio
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Ctrl+Enter aby zapisać, Escape aby anulować
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={handleCancel}>
                  Anuluj
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="secondary"
                  onClick={handleSave}
                  disabled={!editSrc}
                >
                  Save
                </Button>
              </Box>
            </Box>
          </Box>
        </Paper>

        <MediaPickerDialog
          open={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          onSelect={handleMediaPicked}
          initialMediaType="audio"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="audio-node-wrapper">
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          my: 2,
          p: 2,
          bgcolor: 'grey.50',
          borderRadius: 2,
          border: selected ? '2px solid #9c27b0' : '2px solid transparent',
          transition: 'border-color 0.2s ease',
          '&:hover': {
            borderColor: '#9c27b0',
          },
          position: 'relative',
        }}
      >
        {(isHovered || selected) && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              gap: 0.5,
              zIndex: 10,
            }}
          >
            <Tooltip title="Edit audio" arrow>
              <IconButton
                size="small"
                onClick={startEditing}
                sx={{
                  backgroundColor: '#9c27b0',
                  color: 'white',
                  '&:hover': { backgroundColor: '#7b1fa2' },
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete audio" arrow>
              <IconButton
                size="small"
                onClick={deleteNode}
                sx={{
                  backgroundColor: '#d32f2f',
                  color: 'white',
                  '&:hover': { backgroundColor: '#b71c1c' },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {node.attrs.title && (
          <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AudiotrackIcon color="secondary" fontSize="small" />
            {node.attrs.title}
          </Typography>
        )}

        <audio
          src={node.attrs.src}
          controls={node.attrs.controls !== false}
          autoPlay={node.attrs.autoplay}
          loop={node.attrs.loop}
          style={{ width: '100%' }}
          onError={() => setAudioError(true)}
        />

        {audioError && (
          <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
            Nie można załadować audio
          </Typography>
        )}
      </Box>
    </NodeViewWrapper>
  );
};

export const AudioEmbed = Node.create({
  name: 'audio',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
      controls: { default: true },
      autoplay: { default: false },
      loop: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'audio[src]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLAudioElement;
          return {
            src: element.getAttribute('src'),
            title: element.getAttribute('title') || element.getAttribute('data-title'),
            controls: element.hasAttribute('controls'),
            autoplay: element.hasAttribute('autoplay'),
            loop: element.hasAttribute('loop'),
          };
        },
      },
      {
        tag: 'div[data-audio-embed]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          return {
            src: element.getAttribute('data-src'),
            title: element.getAttribute('data-title'),
            controls: element.getAttribute('data-controls') !== 'false',
            autoplay: element.getAttribute('data-autoplay') === 'true',
            loop: element.getAttribute('data-loop') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, string> = {
      src: HTMLAttributes.src,
      class: 'md-editor-audio',
    };

    if (HTMLAttributes.title) attrs['data-title'] = HTMLAttributes.title;
    if (HTMLAttributes.controls !== false) attrs.controls = 'true';
    if (HTMLAttributes.autoplay) attrs.autoplay = 'true';
    if (HTMLAttributes.loop) attrs.loop = 'true';

    return ['audio', mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },

  addCommands() {
    return {
      setAudio: (options: { src: string; title?: string; controls?: boolean; autoplay?: boolean; loop?: boolean }) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audio: {
      setAudio: (options: { src: string; title?: string; controls?: boolean; autoplay?: boolean; loop?: boolean }) => ReturnType;
    };
  }
}
