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
  Slider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VideocamIcon from '@mui/icons-material/Videocam';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import MediaPickerDialog from '../components/MediaPickerDialog';

type VideoAlign = 'left' | 'center' | 'right';

const VideoNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode, selected }) => {
  const [isEditing, setIsEditing] = useState(!node.attrs.src);
  const [isHovered, setIsHovered] = useState(false);
  const [editSrc, setEditSrc] = useState(node.attrs.src || '');
  const [editTitle, setEditTitle] = useState(node.attrs.title || '');
  const [editPoster, setEditPoster] = useState(node.attrs.poster || '');
  const [editWidth, setEditWidth] = useState(node.attrs.width || '');
  const [editAlign, setEditAlign] = useState<VideoAlign>(node.attrs.align || 'center');
  const [editControls, setEditControls] = useState(node.attrs.controls !== false);
  const [editAutoplay, setEditAutoplay] = useState(node.attrs.autoplay || false);
  const [editLoop, setEditLoop] = useState(node.attrs.loop || false);
  const [editMuted, setEditMuted] = useState(node.attrs.muted || false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [posterPickerOpen, setPosterPickerOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
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
    setEditPoster(node.attrs.poster || '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
    setEditControls(node.attrs.controls !== false);
    setEditAutoplay(node.attrs.autoplay || false);
    setEditLoop(node.attrs.loop || false);
    setEditMuted(node.attrs.muted || false);
    setVideoError(false);
  }, [node.attrs]);

  const startEditing = () => {
    setEditSrc(node.attrs.src || '');
    setEditTitle(node.attrs.title || '');
    setEditPoster(node.attrs.poster || '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
    setEditControls(node.attrs.controls !== false);
    setEditAutoplay(node.attrs.autoplay || false);
    setEditLoop(node.attrs.loop || false);
    setEditMuted(node.attrs.muted || false);
    setIsEditing(true);
  };

  const handleSave = () => {
    updateAttributes({
      src: editSrc,
      title: editTitle,
      poster: editPoster || null,
      width: editWidth || null,
      align: editAlign,
      controls: editControls,
      autoplay: editAutoplay,
      loop: editLoop,
      muted: editMuted,
    });
    setIsEditing(false);
    setVideoError(false);
  };

  const handleCancel = () => {
    if (!node.attrs.src) {
      deleteNode();
      return;
    }
    setEditSrc(node.attrs.src || '');
    setEditTitle(node.attrs.title || '');
    setEditPoster(node.attrs.poster || '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
    setEditControls(node.attrs.controls !== false);
    setEditAutoplay(node.attrs.autoplay || false);
    setEditLoop(node.attrs.loop || false);
    setEditMuted(node.attrs.muted || false);
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
    setVideoError(false);
  };

  const handlePosterPicked = (mediaUrl: string) => {
    setEditPoster(mediaUrl);
  };

  const getWidthPercent = (): number => {
    if (!editWidth) return 100;
    const match = editWidth.match(/^(\d+)%?$/);
    if (match) return Math.min(100, Math.max(10, parseInt(match[1])));
    return 100;
  };

  const handleWidthSliderChange = (_: Event, value: number | number[]) => {
    const percent = Array.isArray(value) ? value[0] : value;
    setEditWidth(percent === 100 ? '' : `${percent}%`);
  };

  const handleAlignChange = (_: React.MouseEvent<HTMLElement>, newAlign: VideoAlign | null) => {
    if (newAlign !== null) {
      setEditAlign(newAlign);
    }
  };

  if (isEditing) {
    return (
      <NodeViewWrapper className="video-node-wrapper">
        <Paper
          elevation={2}
          sx={{
            p: 2,
            my: 1,
            border: '2px solid #f44336',
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle2" color="error" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideocamIcon /> Edit video
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                inputRef={srcInputRef}
                label="URL video"
                value={editSrc}
                onChange={(e) => setEditSrc(e.target.value)}
                onKeyDown={handleKeyDown}
                size="small"
                fullWidth
                placeholder="https://example.com/video.mp4 lub wybierz z plików"
              />
              <Button
                variant="outlined"
                color="error"
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
              placeholder="Nazwa video"
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Poster (miniaturka)"
                value={editPoster}
                onChange={(e) => setEditPoster(e.target.value)}
                onKeyDown={handleKeyDown}
                size="small"
                fullWidth
                placeholder="URL obrazka jako miniaturka"
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => setPosterPickerOpen(true)}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Select
              </Button>
            </Box>

            <Divider />

            {/* Width slider */}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Szerokość: {editWidth || '100%'}
              </Typography>
              <Slider
                value={getWidthPercent()}
                onChange={handleWidthSliderChange}
                min={10}
                max={100}
                step={5}
                marks={[
                  { value: 25, label: '25%' },
                  { value: 50, label: '50%' },
                  { value: 75, label: '75%' },
                  { value: 100, label: '100%' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
                color="error"
              />
            </Box>

            {/* Alignment */}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Wyrównanie:
              </Typography>
              <ToggleButtonGroup
                value={editAlign}
                exclusive
                onChange={handleAlignChange}
                size="small"
              >
                <ToggleButton value="left">
                  <Tooltip title="Do lewej">
                    <FormatAlignLeftIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="center">
                  <Tooltip title="Wyśrodkowany">
                    <FormatAlignCenterIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="right">
                  <Tooltip title="Do prawej">
                    <FormatAlignRightIcon />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editControls}
                    onChange={(e) => setEditControls(e.target.checked)}
                    color="error"
                  />
                }
                label="Kontrolki"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editAutoplay}
                    onChange={(e) => setEditAutoplay(e.target.checked)}
                    color="error"
                  />
                }
                label="Autoodtwarzanie"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editLoop}
                    onChange={(e) => setEditLoop(e.target.checked)}
                    color="error"
                  />
                }
                label="Zapętlenie"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editMuted}
                    onChange={(e) => setEditMuted(e.target.checked)}
                    color="error"
                  />
                }
                label="Wyciszony"
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
                    p: 1,
                    bgcolor: '#1e1e1e',
                    borderRadius: 1,
                    textAlign: editAlign,
                  }}
                >
                  <video
                    src={editSrc}
                    poster={editPoster}
                    controls
                    muted
                    style={{
                      maxWidth: editWidth || '100%',
                      maxHeight: 200,
                    }}
                    onError={() => setVideoError(true)}
                    onLoadedData={() => setVideoError(false)}
                  />
                  {videoError && (
                    <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
                      Nie można załadować video
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
                  color="error"
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
          initialMediaType="video"
        />

        <MediaPickerDialog
          open={posterPickerOpen}
          onClose={() => setPosterPickerOpen(false)}
          onSelect={handlePosterPicked}
          initialMediaType="image"
        />
      </NodeViewWrapper>
    );
  }

  // Build wrapper style based on alignment
  const align = node.attrs.align || 'center';
  const wrapperStyle: React.CSSProperties = {
    margin: '1rem 0',
  };

  if (align === 'left') {
    wrapperStyle.textAlign = 'left';
  } else if (align === 'right') {
    wrapperStyle.textAlign = 'right';
  } else {
    wrapperStyle.textAlign = 'center';
  }

  return (
    <NodeViewWrapper className="video-node-wrapper" style={wrapperStyle}>
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          display: 'inline-block',
          position: 'relative',
          maxWidth: '100%',
          width: node.attrs.width || 'auto',
          borderRadius: 2,
          overflow: 'hidden',
          border: selected ? '2px solid #f44336' : '2px solid transparent',
          transition: 'border-color 0.2s ease',
          '&:hover': {
            borderColor: '#f44336',
          },
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
            <Tooltip title="Edit video" arrow>
              <IconButton
                size="small"
                onClick={startEditing}
                sx={{
                  backgroundColor: '#f44336',
                  color: 'white',
                  '&:hover': { backgroundColor: '#d32f2f' },
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete video" arrow>
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

        {node.attrs.title && (isHovered || selected) && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              bgcolor: 'rgba(0,0,0,0.7)',
              color: 'white',
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              zIndex: 10,
            }}
          >
            <VideocamIcon sx={{ fontSize: 14 }} />
            {node.attrs.title}
          </Box>
        )}

        <video
          src={node.attrs.src}
          poster={node.attrs.poster}
          controls={node.attrs.controls !== false}
          autoPlay={node.attrs.autoplay}
          loop={node.attrs.loop}
          muted={node.attrs.muted}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '100%',
          }}
          onError={() => setVideoError(true)}
        />

        {videoError && (
          <Box
            sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: '#ffebee',
            }}
          >
            <Typography color="error" variant="body2">
              Nie można załadować video
            </Typography>
            <Typography color="text.secondary" variant="caption" display="block">
              {node.attrs.src}
            </Typography>
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
};

export const VideoEmbed = Node.create({
  name: 'video',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
      poster: { default: null },
      width: { default: null },
      align: { default: 'center' },
      controls: { default: true },
      autoplay: { default: false },
      loop: { default: false },
      muted: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'video[src]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLVideoElement;
          const style = element.style;
          let align: VideoAlign = 'center';

          if (style.marginLeft === '0px' && style.marginRight === 'auto') align = 'left';
          else if (style.marginLeft === 'auto' && style.marginRight === '0px') align = 'right';

          return {
            src: element.getAttribute('src'),
            title: element.getAttribute('title') || element.getAttribute('data-title'),
            poster: element.getAttribute('poster'),
            width: style.width || element.getAttribute('width') || null,
            align,
            controls: element.hasAttribute('controls'),
            autoplay: element.hasAttribute('autoplay'),
            loop: element.hasAttribute('loop'),
            muted: element.hasAttribute('muted'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, string> = {
      src: HTMLAttributes.src,
      class: 'md-editor-video',
    };

    if (HTMLAttributes.title) attrs['data-title'] = HTMLAttributes.title;
    if (HTMLAttributes.poster) attrs.poster = HTMLAttributes.poster;
    if (HTMLAttributes.controls !== false) attrs.controls = 'true';
    if (HTMLAttributes.autoplay) attrs.autoplay = 'true';
    if (HTMLAttributes.loop) attrs.loop = 'true';
    if (HTMLAttributes.muted) attrs.muted = 'true';

    const styles: string[] = [];
    if (HTMLAttributes.width) {
      styles.push(`width: ${HTMLAttributes.width}`);
    }

    const align = HTMLAttributes.align || 'center';
    if (align === 'left') {
      styles.push('margin-left: 0', 'margin-right: auto');
    } else if (align === 'right') {
      styles.push('margin-left: auto', 'margin-right: 0');
    } else {
      styles.push('margin-left: auto', 'margin-right: auto');
    }
    styles.push('display: block');

    if (styles.length > 0) {
      attrs.style = styles.join('; ');
    }

    return ['video', mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },

  addCommands() {
    return {
      setVideo: (options: {
        src: string;
        title?: string;
        poster?: string;
        width?: string;
        align?: VideoAlign;
        controls?: boolean;
        autoplay?: boolean;
        loop?: boolean;
        muted?: boolean;
      }) => ({ commands }) => {
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
    video: {
      setVideo: (options: {
        src: string;
        title?: string;
        poster?: string;
        width?: string;
        align?: 'left' | 'center' | 'right';
        controls?: boolean;
        autoplay?: boolean;
        loop?: boolean;
        muted?: boolean;
      }) => ReturnType;
    };
  }
}
