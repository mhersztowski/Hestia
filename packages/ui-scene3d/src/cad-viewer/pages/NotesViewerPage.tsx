/**
 * Read-only Notes viewer — renders a saved .notes.json scene page by page.
 * URL: /viewer/notes/{vfsPath}
 */
import { useEffect, useRef, useState } from 'react'
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { NOTES_EXT, readFileAt } from '../vfs'
import { drawPage, CANVAS_W, CANVAS_H, type NotePage } from '../notes/renderNotes'
import { PanZoom } from '../components/PanZoom'

interface Props { vfsPath: string }

export function NotesViewerPage({ vfsPath }: Props) {
  const [pages, setPages] = useState<NotePage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    const parts = vfsPath.split('/')
    const name = parts.pop()!
    const dir = '/' + parts.join('/')
    let cancelled = false
    ;(async () => {
      try {
        const text = await readFileAt(dir, name, NOTES_EXT)
        const data = JSON.parse(text) as { pages?: NotePage[] }
        if (!cancelled) setPages(Array.isArray(data.pages) && data.pages.length ? data.pages : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [vfsPath])

  useEffect(() => {
    const canvas = canvasRef.current
    const page = pages?.[index]
    if (!canvas || !page) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const render = () => drawPage(ctx, page, imgCacheRef.current, () => { raf = requestAnimationFrame(render) })
    render()
    return () => cancelAnimationFrame(raf)
  }, [pages, index])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#1a1a1a', color: '#fff' }}>
      {/* page nav only (title removed — the markdown embed shows mode + name) */}
      {pages && pages.length > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, height: 36, bgcolor: '#252526', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Previous page">
            <span>
              <IconButton size="small" disabled={index === 0} onClick={() => setIndex(i => Math.max(0, i - 1))}>
                <ChevronLeftIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary', minWidth: 54, textAlign: 'center' }}>
            {index + 1} / {pages.length}
          </Typography>
          <Tooltip title="Next page">
            <span>
              <IconButton size="small" disabled={index === pages.length - 1} onClick={() => setIndex(i => Math.min(pages.length - 1, i + 1))}>
                <ChevronRightIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}

      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {error ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        ) : !pages ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={32} /></Box>
        ) : pages.length === 0 ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'text.disabled', fontSize: 14 }}>This notebook has no pages.</Typography>
          </Box>
        ) : (
          <PanZoom contentWidth={CANVAS_W} contentHeight={CANVAS_H}>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ display: 'block', width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, borderRadius: 6, boxShadow: '0 2px 20px rgba(0,0,0,0.6)' }}
            />
          </PanZoom>
        )}
      </Box>
    </Box>
  )
}
