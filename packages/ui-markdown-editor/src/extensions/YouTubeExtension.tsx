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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import YouTubeIcon from '@mui/icons-material/YouTube';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';

type YtAlign = 'left' | 'center' | 'right';

/** Wyciąga 11-znakowe ID filmu YouTube z URL (watch/youtu.be/embed/shorts) lub surowego ID. */
export function extractYouTubeId(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s; // już samo ID
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return '';
}

/** Wyciąga czas startu (sekundy) z URL (?t=90 / ?start=90 / #t=1m30s). */
function extractStart(input: string): number {
  const s = input || '';
  const t = s.match(/[?&#](?:t|start)=([0-9hms]+)/);
  if (!t) return 0;
  const v = t[1];
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  let secs = 0;
  const h = v.match(/(\d+)h/); const m = v.match(/(\d+)m/); const sec = v.match(/(\d+)s/);
  if (h) secs += parseInt(h[1], 10) * 3600;
  if (m) secs += parseInt(m[1], 10) * 60;
  if (sec) secs += parseInt(sec[1], 10);
  return secs;
}

function embedUrl(videoId: string, start: number): string {
  const params = start > 0 ? `?start=${start}` : '';
  return `https://www.youtube.com/embed/${videoId}${params}`;
}

const YouTubeNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode, selected }) => {
  const [isEditing, setIsEditing] = useState(!node.attrs.videoId);
  const [isHovered, setIsHovered] = useState(false);
  const [editUrl, setEditUrl] = useState('');
  const [editWidth, setEditWidth] = useState<string>(node.attrs.width || '');
  const [editAlign, setEditAlign] = useState<YtAlign>(node.attrs.align || 'center');
  const urlInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (isEditing && urlInputRef.current) urlInputRef.current.focus();
  }, [isEditing]);

  useEffect(() => {
    if (!initializedRef.current && !node.attrs.videoId) {
      setIsEditing(true);
      initializedRef.current = true;
    }
  }, [node.attrs.videoId]);

  const parsedId = extractYouTubeId(editUrl);

  const startEditing = () => {
    setEditUrl(node.attrs.videoId ? `https://youtu.be/${node.attrs.videoId}` : '');
    setEditWidth(node.attrs.width || '');
    setEditAlign(node.attrs.align || 'center');
    setIsEditing(true);
  };

  const handleSave = () => {
    const id = extractYouTubeId(editUrl);
    if (!id) return;
    updateAttributes({
      videoId: id,
      start: extractStart(editUrl) || null,
      width: editWidth || null,
      align: editAlign,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (!node.attrs.videoId) { deleteNode(); return; }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleCancel();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
  };

  const getWidthPercent = (): number => {
    if (!editWidth) return 100;
    const m = editWidth.match(/^(\d+)%?$/);
    return m ? Math.min(100, Math.max(20, parseInt(m[1], 10))) : 100;
  };

  const openOnYouTube = () => {
    if (node.attrs.videoId) window.open(`https://youtu.be/${node.attrs.videoId}`, '_blank');
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const goFullscreen = () => {
    const iframe = wrapRef.current?.querySelector('iframe');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = iframe as any;
    (el?.requestFullscreen || el?.webkitRequestFullscreen || el?.webkitEnterFullscreen)?.call(el);
  };

  // ── Responsywny wrapper 16:9 z iframe ──────────────────────────────────────
  const Player: React.FC<{ videoId: string; start: number; width?: string }> = ({ videoId, start, width }) => (
    <Box sx={{ width: width || '100%', maxWidth: '100%', mx: 'auto' }}>
      <Box sx={{ position: 'relative', paddingTop: '56.25%', borderRadius: 1, overflow: 'hidden', bgcolor: '#000' }}>
        <iframe
          src={embedUrl(videoId, start)}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
        />
      </Box>
    </Box>
  );

  if (isEditing) {
    return (
      <NodeViewWrapper className="youtube-node-wrapper">
        <Paper elevation={2} sx={{ p: 2, my: 1, border: '2px solid #ff0000', borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, color: '#c4302b' }}>
            <YouTubeIcon /> Osadź film YouTube
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              inputRef={urlInputRef}
              label="URL lub ID filmu YouTube"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              fullWidth
              placeholder="https://www.youtube.com/watch?v=… , https://youtu.be/… lub samo ID"
              helperText={editUrl && !parsedId ? 'Nie rozpoznano ID filmu YouTube' : ' '}
              error={!!editUrl && !parsedId}
            />

            {/* Szerokość */}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Szerokość: {editWidth || '100%'}
              </Typography>
              <Slider
                value={getWidthPercent()}
                onChange={(_, v) => { const p = Array.isArray(v) ? v[0] : v; setEditWidth(p === 100 ? '' : `${p}%`); }}
                min={20}
                max={100}
                step={5}
                marks={[{ value: 25, label: '25%' }, { value: 50, label: '50%' }, { value: 75, label: '75%' }, { value: 100, label: '100%' }]}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
                sx={{ color: '#c4302b' }}
              />
            </Box>

            {/* Wyrównanie */}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>Wyrównanie:</Typography>
              <ToggleButtonGroup value={editAlign} exclusive size="small" onChange={(_, v) => v && setEditAlign(v)}>
                <ToggleButton value="left"><Tooltip title="Do lewej"><FormatAlignLeftIcon /></Tooltip></ToggleButton>
                <ToggleButton value="center"><Tooltip title="Wyśrodkowany"><FormatAlignCenterIcon /></Tooltip></ToggleButton>
                <ToggleButton value="right"><Tooltip title="Do prawej"><FormatAlignRightIcon /></Tooltip></ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {parsedId && (
              <Box>
                <Typography variant="caption" color="text.secondary">Podgląd:</Typography>
                <Box sx={{ mt: 0.5 }}><Player videoId={parsedId} start={extractStart(editUrl)} width={editWidth} /></Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">Enter aby zapisać, Escape aby anulować</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={handleCancel}>Anuluj</Button>
                <Button size="small" variant="contained" onClick={handleSave} disabled={!parsedId} sx={{ bgcolor: '#c4302b', '&:hover': { bgcolor: '#a5241f' } }}>
                  Osadź
                </Button>
              </Box>
            </Box>
          </Box>
        </Paper>
      </NodeViewWrapper>
    );
  }

  const align = node.attrs.align || 'center';
  const wrapperStyle: React.CSSProperties = { margin: '1rem 0', textAlign: align };

  return (
    <NodeViewWrapper className="youtube-node-wrapper" style={wrapperStyle}>
      <Box
        ref={wrapRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          display: 'inline-block', position: 'relative', width: node.attrs.width || '100%', maxWidth: '100%',
          textAlign: 'left', borderRadius: 2,
          outline: selected ? '2px solid #ff0000' : '2px solid transparent', transition: 'outline-color 0.2s ease',
        }}
      >
        {(isHovered || selected) && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5, zIndex: 10 }}>
            <Tooltip title="Pełny ekran" arrow>
              <IconButton size="small" onClick={goFullscreen} sx={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' } }}>
                <FullscreenIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edytuj" arrow>
              <IconButton size="small" onClick={startEditing} sx={{ backgroundColor: '#c4302b', color: 'white', '&:hover': { backgroundColor: '#a5241f' } }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Otwórz na YouTube" arrow>
              <IconButton size="small" onClick={openOnYouTube} sx={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' } }}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Usuń" arrow>
              <IconButton size="small" onClick={deleteNode} sx={{ backgroundColor: '#d32f2f', color: 'white', '&:hover': { backgroundColor: '#b71c1c' } }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        <Player videoId={node.attrs.videoId} start={node.attrs.start || 0} width={node.attrs.width} />
      </Box>
    </NodeViewWrapper>
  );
};

export const YouTubeEmbed = Node.create({
  name: 'youtube',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      videoId: { default: null },
      start: { default: null },
      width: { default: null },
      align: { default: 'center' },
    };
  },

  parseHTML() {
    return [
      {
        // iframe osadzenia YouTube (round-trip przez HTML w markdownie)
        tag: 'iframe[data-youtube-id]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const el = node as HTMLElement;
          return {
            videoId: el.getAttribute('data-youtube-id'),
            start: Number(el.getAttribute('data-start')) || null,
            width: el.style.width || null,
            align: (el.getAttribute('data-align') as YtAlign) || 'center',
          };
        },
      },
      {
        tag: 'iframe[src*="youtube.com/embed/"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const el = node as HTMLIFrameElement;
          const id = extractYouTubeId(el.getAttribute('src') || '');
          if (!id) return false;
          return { videoId: id, align: 'center' };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { videoId, start, width, align } = HTMLAttributes as { videoId: string; start?: number; width?: string; align?: YtAlign };
    const attrs: Record<string, string> = {
      src: embedUrl(videoId, Number(start) || 0),
      class: 'md-editor-youtube',
      frameborder: '0',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: 'true',
      'data-youtube-id': videoId,
    };
    if (start) attrs['data-start'] = String(start);
    if (align) attrs['data-align'] = align;
    const styles = ['aspect-ratio: 16 / 9', `width: ${width || '100%'}`, 'max-width: 100%'];
    if (align === 'left') styles.push('margin-left: 0', 'margin-right: auto');
    else if (align === 'right') styles.push('margin-left: auto', 'margin-right: 0');
    else styles.push('margin-left: auto', 'margin-right: auto');
    styles.push('display: block');
    attrs.style = styles.join('; ');
    return ['iframe', mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YouTubeNodeView);
  },

  addCommands() {
    return {
      setYouTube: (options: { videoId: string; start?: number; width?: string; align?: YtAlign }) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs: options });
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    youtube: {
      setYouTube: (options: { videoId: string; start?: number; width?: string; align?: 'left' | 'center' | 'right' }) => ReturnType;
    };
  }
}
