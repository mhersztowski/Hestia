import Dialog from '@mui/material/Dialog'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { MapNode } from './types'
import { renderMarkdown } from './markdown'

// Styling for rendered markdown content.
const MD_SX = {
  fontSize: '0.82rem',
  lineHeight: 1.55,
  color: 'text.primary',
  wordBreak: 'break-word',
  '& h1, & h2, & h3, & h4': { fontWeight: 700, mt: 1.2, mb: 0.6, lineHeight: 1.25 },
  '& h1': { fontSize: '1.15rem' },
  '& h2': { fontSize: '1.02rem' },
  '& h3': { fontSize: '0.92rem' },
  '& p': { my: 0.6 },
  '& ul, & ol': { pl: 2.4, my: 0.6 },
  '& li': { mb: 0.2 },
  '& a': { color: '#4fc3f7' },
  '& code': { bgcolor: 'rgba(255,255,255,0.08)', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace', fontSize: '0.78em' },
  '& pre': { bgcolor: 'rgba(0,0,0,0.35)', p: 1, borderRadius: 1, overflow: 'auto' },
  '& pre code': { bgcolor: 'transparent', p: 0 },
  '& blockquote': { borderLeft: '3px solid rgba(79,195,247,0.5)', pl: 1.2, ml: 0, my: 0.6, color: 'text.secondary' },
  '& img': { maxWidth: '100%', borderRadius: 1 },
  '& hr': { border: 0, borderTop: '1px solid rgba(255,255,255,0.12)', my: 1 },
} as const

interface Props {
  node: MapNode | null
  onClose: () => void
}

export function InfoView({ node, onClose }: Props) {
  if (!node || !node.info) return null

  const mode = node.showInfo ?? 'compact'
  const isUrl = node.infoType === 'url'

  const body = isUrl ? (
    <iframe
      src={node.info}
      title={node.name}
      style={{ border: 0, width: '100%', height: '100%', background: '#fff' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  ) : (
    <Box sx={MD_SX} dangerouslySetInnerHTML={{ __html: renderMarkdown(node.info) }} />
  )

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  if (mode === 'fullscreen') {
    return (
      <Dialog open fullScreen onClose={onClose}>
        <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Toolbar variant="dense" sx={{ gap: 1, minHeight: 44 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, flex: 1, color: 'text.primary' }}>
              {node.name}
            </Typography>
            {isUrl && (
              <Tooltip title="Open in new tab">
                <IconButton size="small" onClick={() => window.open(node.info, '_blank', 'noopener')}>
                  <OpenInNewIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Close">
              <IconButton edge="end" size="small" onClick={onClose}>
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, overflow: 'auto', p: isUrl ? 0 : 2.5, bgcolor: 'background.default' }}>
          {body}
        </Box>
      </Dialog>
    )
  }

  // ── Compact (floating card, non-modal) ──────────────────────────────────────
  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 1300,
        width: 380, maxWidth: 'calc(100vw - 32px)',
        height: isUrl ? 440 : 'auto', maxHeight: '62vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.5,
        borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </Typography>
        {isUrl && (
          <Tooltip title="Open in new tab">
            <IconButton size="small" onClick={() => window.open(node.info, '_blank', 'noopener')} sx={{ p: 0.25 }}>
              <OpenInNewIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
        <IconButton size="small" onClick={onClose} sx={{ p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: isUrl ? 0 : 1.5 }}>
        {body}
      </Box>
    </Paper>
  )
}
