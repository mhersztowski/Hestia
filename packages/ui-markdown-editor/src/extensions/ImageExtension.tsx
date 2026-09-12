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
  Slider,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MediaPickerDialog from '../components/MediaPickerDialog';
import { ImageResizeHandle } from './ImageResizeHandle';

type ImageAlign = 'left' | 'center' | 'right' | 'inline';

const ImageNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode, selected }) => {
  // Start in edit mode if src is empty
  const [isEditing, setIsEditing] = useState(!node.attrs.src);
  const [isHovered, setIsHovered] = useState(false);
  const [editSrc, setEditSrc] = useState(node.attrs.src || '');
  const [editAlt, setEditAlt] = useState(node.attrs.alt || '');
  const [editTitle, setEditTitle] = useState(node.attrs.title || '');
  const [editWidth, setEditWidth] = useState(node.attrs.width || '');
  const [editAlign, setEditAlign] = useState<ImageAlign>(node.attrs.align || 'center');
  const [imageError, setImageError] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const srcInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  /** Element, którego szerokość mierzy uchwyt w chwili chwycenia. */
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isEditing && srcInputRef.current) {
      srcInputRef.current.focus();
    }
  }, [isEditing]);

  // Auto-open edit mode when src is empty (for new images)
  useEffect(() => {
    if (!initializedRef.current && !node.attrs.src) {
      setIsEditing(true);
      initializedRef.current = true;
    }
  }, [node.attrs.src]);

  useEffect(() => {
    setEditSrc(node.attrs.src || '');
    setEditAlt(node.attrs.alt || '');
    setEditTitle(node.attrs.title || '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
    setImageError(false);
  }, [node.attrs.src, node.attrs.alt, node.attrs.title, node.attrs.width, node.attrs.align]);

  const startEditing = () => {
    setEditSrc(node.attrs.src || '');
    setEditAlt(node.attrs.alt || '');
    setEditTitle(node.attrs.title || '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
    setIsEditing(true);
  };

  const handleSave = () => {
    updateAttributes({
      src: editSrc,
      alt: editAlt,
      title: editTitle,
      width: editWidth || null,
      align: editAlign,
    });
    setIsEditing(false);
    setImageError(false);
  };

  const handleCancel = () => {
    // If original src was empty, delete the node on cancel
    if (!node.attrs.src) {
      deleteNode();
      return;
    }
    setEditSrc(node.attrs.src || '');
    setEditAlt(node.attrs.alt || '');
    setEditTitle(node.attrs.title || '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
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

  const openInNewTab = () => {
    if (node.attrs.src) {
      window.open(node.attrs.src, '_blank');
    }
  };

  const handleImagePicked = (imageUrl: string, imagePath: string) => {
    setEditSrc(imageUrl);
    // Auto-set alt text from filename if empty
    if (!editAlt) {
      const filename = imagePath.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      setEditAlt(nameWithoutExt);
    }
    setImageError(false);
  };

  // Parse width value for slider
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

  const handleAlignChange = (_: React.MouseEvent<HTMLElement>, newAlign: ImageAlign | null) => {
    if (newAlign !== null) {
      setEditAlign(newAlign);
    }
  };

  if (isEditing) {
    return (
      <NodeViewWrapper className="image-node-wrapper">
        <Paper
          elevation={2}
          sx={{
            p: 2,
            my: 1,
            border: '2px solid #1976d2',
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle2" color="primary" sx={{ mb: 2 }}>
            Edycja obrazka
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* URL input with browse button */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                inputRef={srcInputRef}
                label="URL obrazka"
                value={editSrc}
                onChange={(e) => setEditSrc(e.target.value)}
                onKeyDown={handleKeyDown}
                size="small"
                fullWidth
                placeholder="https://example.com/image.jpg lub wybierz z plików"
              />
              <Button
                variant="outlined"
                onClick={() => setImagePickerOpen(true)}
                startIcon={<FolderOpenIcon />}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Przeglądaj
              </Button>
            </Box>

            <Divider>
              <Typography variant="caption" color="text.secondary">
                lub
              </Typography>
            </Divider>

            <TextField
              label="Tekst alternatywny (alt)"
              value={editAlt}
              onChange={(e) => setEditAlt(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              fullWidth
              placeholder="Opis obrazka dla czytników ekranu"
            />

            <TextField
              label="Tytuł (tooltip)"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              fullWidth
              placeholder="Tekst wyświetlany po najechaniu"
            />

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
                  <Tooltip title="Do lewej (float)">
                    <FormatAlignLeftIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="center">
                  <Tooltip title="Wyśrodkowany">
                    <FormatAlignCenterIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="right">
                  <Tooltip title="Do prawej (float)">
                    <FormatAlignRightIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="inline">
                  <Tooltip title="Inline (next to others)">
                    <ViewStreamIcon />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {editAlign === 'left' && 'Obrazek po lewej, tekst opływa z prawej'}
                {editAlign === 'center' && 'Obrazek wyśrodkowany (domyślnie)'}
                {editAlign === 'right' && 'Obrazek po prawej, tekst opływa z lewej'}
                {editAlign === 'inline' && 'Inline image - another can be placed next to it'}
              </Typography>
            </Box>

            {/* Preview */}
            {editSrc && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Podgląd:
                </Typography>
                <Box
                  sx={{
                    mt: 0.5,
                    p: 1,
                    bgcolor: '#f5f5f5',
                    borderRadius: 1,
                    textAlign: editAlign === 'center' ? 'center' : editAlign === 'right' ? 'right' : 'left',
                  }}
                >
                  <img
                    src={editSrc}
                    alt={editAlt || 'Preview'}
                    style={{
                      maxWidth: editWidth || '100%',
                      maxHeight: '200px',
                      objectFit: 'contain',
                    }}
                    onError={() => setImageError(true)}
                    onLoad={() => setImageError(false)}
                  />
                  {imageError && (
                    <Typography color="error" variant="caption" display="block">
                      Nie można załadować obrazka
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
                  onClick={handleSave}
                  disabled={!editSrc}
                >
                  Save
                </Button>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Image Picker Dialog */}
        <MediaPickerDialog
          open={imagePickerOpen}
          onClose={() => setImagePickerOpen(false)}
          onSelect={handleImagePicked}
          initialMediaType="image"
        />
      </NodeViewWrapper>
    );
  }

  // SVG-y często mają tylko `viewBox` bez width/height — w <img> renderują się
  // wtedy malutko (domyślne 300×150) i wyglądają jak „nieosadzone". Wykryj SVG,
  // by dać mu sensowną domyślną szerokość, gdy autor nie podał własnej.
  const isSvg = /\.svg(?:[?#].*)?$/i.test(node.attrs.src || '');

  // Build image style
  const imageStyle: React.CSSProperties = {
    display: 'block',
    maxWidth: '100%',
    cursor: 'pointer',
    opacity: isHovered || selected ? 0.9 : 1,
    transition: 'opacity 0.2s ease',
  };

  // If wrapper has explicit width, image should fill it. SVG bez wymiarów też
  // powinien wypełnić dostępny obszar (inaczej zapadłby się do ~300 px).
  if (node.attrs.width || isSvg) {
    imageStyle.width = '100%';
  }

  // Build NodeViewWrapper style based on alignment
  const align = node.attrs.align || 'center';
  const nodeWrapperStyle: React.CSSProperties = {};

  if (align === 'left') {
    nodeWrapperStyle.display = 'block';
    nodeWrapperStyle.float = 'left';
    nodeWrapperStyle.marginRight = 16;
    nodeWrapperStyle.marginBottom = 8;
    // Set width for float to work
    if (!node.attrs.width) {
      nodeWrapperStyle.width = 'max-content';
      nodeWrapperStyle.maxWidth = '50%';
    }
  } else if (align === 'right') {
    nodeWrapperStyle.display = 'block';
    nodeWrapperStyle.float = 'right';
    nodeWrapperStyle.marginLeft = 16;
    nodeWrapperStyle.marginBottom = 8;
    // Set width for float to work
    if (!node.attrs.width) {
      nodeWrapperStyle.width = 'max-content';
      nodeWrapperStyle.maxWidth = '50%';
    }
  } else if (align === 'inline') {
    nodeWrapperStyle.display = 'inline-block';
    nodeWrapperStyle.verticalAlign = 'top';
    nodeWrapperStyle.marginRight = 8;
    nodeWrapperStyle.marginBottom = 8;
  } else {
    // center
    nodeWrapperStyle.display = 'block';
    nodeWrapperStyle.clear = 'both';
    nodeWrapperStyle.marginLeft = 'auto';
    nodeWrapperStyle.marginRight = 'auto';
    // Without explicit width, use max-content to shrink to image size.
    // SVG (wektor) — daj ograniczoną szerokość zamiast max-content, żeby
    // dimensionless SVG nie zapadł się do ~300 px; upscaling SVG jest ostry.
    if (!node.attrs.width) {
      if (isSvg) {
        nodeWrapperStyle.width = '100%';
        nodeWrapperStyle.maxWidth = 520;
      } else {
        nodeWrapperStyle.width = 'max-content';
        nodeWrapperStyle.maxWidth = '100%';
      }
    }
  }

  // Set width on wrapper if specified (overrides defaults)
  if (node.attrs.width) {
    nodeWrapperStyle.width = node.attrs.width;
  }

  return (
    <NodeViewWrapper
      className="image-node-wrapper"
      style={nodeWrapperStyle}
    >
      <Box
        ref={boxRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          border: selected ? '2px solid #1976d2' : '2px solid transparent',
          transition: 'border-color 0.2s ease',
          '&:hover': {
            borderColor: '#1976d2',
          },
        }}
      >
        {/* Action buttons overlay */}
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
            <Tooltip title="Edit image" arrow>
              <IconButton
                size="small"
                onClick={startEditing}
                sx={{
                  backgroundColor: '#1976d2',
                  color: 'white',
                  '&:hover': { backgroundColor: '#1565c0' },
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Otwórz w nowej karcie" arrow>
              <IconButton
                size="small"
                onClick={openInNewTab}
                sx={{
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' },
                }}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete image" arrow>
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

        {/* Click hint */}
        {(isHovered || selected) && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              fontSize: '12px',
              zIndex: 10,
            }}
          >
            Kliknij aby edytować
          </Box>
        )}

        {/* Image */}
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          title={node.attrs.title || ''}
          onClick={startEditing}
          style={imageStyle}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            setImageError(true);
          }}
        />

        {/* Error state */}
        {imageError && (
          <Box
            onClick={startEditing}
            sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: '#ffebee',
              cursor: 'pointer',
              minWidth: 200,
            }}
          >
            <Typography color="error" variant="body2">
              Nie można załadować obrazka
            </Typography>
            <Typography color="text.secondary" variant="caption" display="block">
              {node.attrs.src}
            </Typography>
            <Typography color="primary" variant="caption" sx={{ mt: 1 }} display="block">
              Kliknij aby edytować
            </Typography>
          </Box>
        )}

        {/* Size/align indicator */}
        {(isHovered || selected) && !imageError && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              display: 'flex',
              gap: 0.5,
            }}
          >
            {node.attrs.width && (
              <Box
                sx={{
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontSize: '11px',
                }}
              >
                {node.attrs.width}
              </Box>
            )}
            {align !== 'center' && (
              <Box
                sx={{
                  backgroundColor: 'rgba(25, 118, 210, 0.9)',
                  color: 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontSize: '11px',
                }}
              >
                {align === 'left' ? '← left' : align === 'right' ? 'right →' : 'inline'}
              </Box>
            )}
          </Box>
        )}

        {/*
          Uchwyt zmiany rozmiaru — w narożniku, widoczny razem z resztą
          nakładki. Zapisuje do tego samego atrybutu `width`, co suwak w oknie
          edycji, więc konwersja do markdownu pozostaje jedna.
        */}
        {(isHovered || selected) && !imageError && (
          <ImageResizeHandle
            width={node.attrs.width}
            updateAttributes={updateAttributes}
            elementRef={boxRef}
          />
        )}

        {/* Alt text indicator */}
        {node.attrs.alt && (isHovered || selected) && !imageError && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 40,
              left: 8,
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              fontSize: '11px',
              maxWidth: '80%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            alt: {node.attrs.alt}
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
};

export const EditableImage = Node.create({
  name: 'image',

  // Use 'inline' group to allow side-by-side placement
  // CSS handles block-level display for non-inline alignments
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
      },
      align: {
        default: 'center',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLImageElement;
          const style = element.style;
          let align: ImageAlign = 'center';

          if (style.float === 'left') align = 'left';
          else if (style.float === 'right') align = 'right';
          else if (style.display === 'inline-block' || style.display === 'inline') align = 'inline';

          return {
            src: element.getAttribute('src'),
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
            width: style.width || element.getAttribute('width') || null,
            align,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, string> = {
      src: HTMLAttributes.src,
      class: 'md-editor-image',
    };

    if (HTMLAttributes.alt) attrs.alt = HTMLAttributes.alt;
    if (HTMLAttributes.title) attrs.title = HTMLAttributes.title;

    const styles: string[] = [];
    if (HTMLAttributes.width) {
      styles.push(`width: ${HTMLAttributes.width}`);
    }

    const align = HTMLAttributes.align || 'center';
    if (align === 'left') {
      styles.push('float: left', 'margin-right: 16px');
    } else if (align === 'right') {
      styles.push('float: right', 'margin-left: 16px');
    } else if (align === 'inline') {
      styles.push('display: inline-block', 'vertical-align: top', 'margin-right: 8px');
    } else {
      styles.push('display: block', 'margin-left: auto', 'margin-right: auto');
    }

    if (styles.length > 0) {
      attrs.style = styles.join('; ');
    }

    return ['img', mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  addCommands() {
    return {
      setImage: (options: { src: string; alt?: string; title?: string; width?: string; align?: ImageAlign }) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },
});

// Type declaration
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: { src: string; alt?: string; title?: string; width?: string; align?: 'left' | 'center' | 'right' | 'inline' }) => ReturnType;
    };
  }
}
