/**
 * Read-only Map scene viewer — renders a saved `.map.json` scene and shows the
 * Description of each element in a panel / popup.
 * URL: /viewer/map/{vfsPath}  e.g. /viewer/map/users/default/projects/mytrip
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  Box, CircularProgress, IconButton, Tooltip, Typography,
  List, ListItemButton, ListItemText, ListItemIcon, Collapse, Divider,
  Paper, Select, MenuItem,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PlaceIcon from '@mui/icons-material/Place'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import TimelineIcon from '@mui/icons-material/Timeline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import FolderIcon from '@mui/icons-material/Folder'
import LayersIcon from '@mui/icons-material/Layers'
import RouteIcon from '@mui/icons-material/Route'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_EXT, readFileAt } from '../vfs'
import { renderMapNode } from '../map/renderMapNode'
import { InfoView } from '../map/InfoView'
import type { MapNode, MapNodeType } from '../map/types'

interface Props { vfsPath: string }

// ── basemaps (free, no API key) ─────────────────────────────────────────────────

interface Basemap {
  key: string
  label: string
  url: string
  attribution: string
  maxZoom?: number
  subdomains?: string
}

const BASEMAPS: Basemap[] = [
  { key: 'map',          label: 'Map',          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                              attribution: '© OpenStreetMap contributors',                         maxZoom: 19 },
  { key: 'satellite',    label: 'Satellite',    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
  { key: 'terrain',      label: 'Terrain',      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                                                attribution: '© OpenTopoMap (CC-BY-SA)',                              maxZoom: 17, subdomains: 'abc' },
  { key: 'topo',         label: 'Topographic',  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri',                                          maxZoom: 19 },
  { key: 'humanitarian', label: 'Humanitarian', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',                                           attribution: '© OpenStreetMap contributors, HOT',                     maxZoom: 19, subdomains: 'ab' },
  { key: 'dark',         label: 'Dark',         url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',                                      attribution: '© OpenStreetMap, © CARTO',                              maxZoom: 20, subdomains: 'abcd' },
  { key: 'light',        label: 'Light',        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',                                     attribution: '© OpenStreetMap, © CARTO',                              maxZoom: 20, subdomains: 'abcd' },
]

interface MapFile { version: number; nodes: MapNode[] }
function deserialize(text: string): MapNode[] {
  const data = JSON.parse(text) as MapFile | MapNode[]
  return Array.isArray(data) ? data : (data.nodes ?? [])
}

function findNode(nodes: MapNode[], id: string): MapNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) { const f = findNode(n.children, id); if (f) return f }
  }
  return null
}

/** Ancestor group ids leading to `id` (excludes the node itself). */
function findPath(nodes: MapNode[], id: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.id === id) return trail
    if (n.children) { const r = findPath(n.children, id, [...trail, n.id]); if (r) return r }
  }
  return null
}

function collectLatLngs(node: MapNode, acc: [number, number][]): void {
  if (node.lat != null && node.lng != null) acc.push([node.lat, node.lng])
  if (node.positions?.length) for (const p of node.positions) acc.push(p)
  if (node.children) for (const c of node.children) collectLatLngs(c, acc)
}

// Elements that carry a description, flattened for the side index.
function collectDescribed(nodes: MapNode[], acc: MapNode[] = []): MapNode[] {
  for (const n of nodes) {
    if (n.info?.trim()) acc.push(n)
    if (n.children) collectDescribed(n.children, acc)
  }
  return acc
}

// Fits the map to the bounds of all geometry once nodes are loaded.
function FitBounds({ nodes }: { nodes: MapNode[] }) {
  const map = useMap()
  useEffect(() => {
    const pts: [number, number][] = []
    nodes.forEach(n => collectLatLngs(n, pts))
    if (pts.length) {
      const b = L.latLngBounds(pts)
      if (b.isValid()) map.fitBounds(b.pad(0.15))
    }
  }, [map, nodes])
  return null
}

// Captures the Leaflet map instance so the page can fly to a selected element.
function MapCapture({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap()
  mapRef.current = map
  return null
}

function allGroupIds(nodes: MapNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'group') { acc.push(n.id); if (n.children) allGroupIds(n.children, acc) }
  }
  return acc
}

function nodeIcon(type: MapNodeType) {
  const sx = { fontSize: 14 }
  switch (type) {
    case 'tile-layer': return <LayersIcon sx={{ ...sx, color: '#ffb74d' }} />
    case 'marker':     return <PlaceIcon sx={{ ...sx, color: '#ef5350' }} />
    case 'polygon':    return <CropSquareIcon sx={{ ...sx, color: '#4fc3f7' }} />
    case 'polyline':   return <TimelineIcon sx={{ ...sx, color: '#66bb6a' }} />
    case 'circle':     return <RadioButtonUncheckedIcon sx={{ ...sx, color: '#ce93d8' }} />
    case 'group':      return <FolderIcon sx={{ ...sx, color: '#78909c' }} />
    case 'route':      return <RouteIcon sx={{ ...sx, color: '#42a5f5' }} />
  }
}

// ── read-only hierarchy tree ────────────────────────────────────────────────────

interface ViewerTreeNodeProps {
  node: MapNode
  depth: number
  selectedId: string | null
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (node: MapNode) => void
}

function ViewerTreeNode({ node, depth, selectedId, expandedIds, onToggleExpand, onSelect }: ViewerTreeNodeProps) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedId === node.id

  return (
    <>
      <ListItemButton
        selected={isSelected}
        data-node-id={node.id}
        onClick={() => onSelect(node)}
        sx={{
          minHeight: 26, py: 0, pl: depth * 1.6 + 0.5, pr: 0.5,
          opacity: node.visible === false ? 0.4 : 1,
          '&.Mui-selected': { bgcolor: 'rgba(79,195,247,0.14)' },
        }}
      >
        {hasChildren ? (
          <ListItemIcon
            sx={{ minWidth: 18, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onToggleExpand(node.id) }}
          >
            {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 15 }} /> : <ChevronRightIcon sx={{ fontSize: 15 }} />}
          </ListItemIcon>
        ) : (
          <Box sx={{ width: 18, flexShrink: 0 }} />
        )}
        <ListItemIcon sx={{ minWidth: 22 }}>{nodeIcon(node.type)}</ListItemIcon>
        <ListItemText
          primary={node.name}
          primaryTypographyProps={{ sx: { fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
        />
        {node.info?.trim() && <InfoOutlinedIcon sx={{ fontSize: 12, color: '#4fc3f7', flexShrink: 0 }} />}
      </ListItemButton>
      {hasChildren && (
        <Collapse in={isExpanded} unmountOnExit>
          <List disablePadding>
            {(node.children ?? []).map(child => (
              <ViewerTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  )
}

export function MapViewerPage({ vfsPath }: Props) {
  const [nodes, setNodes] = useState<MapNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [showDescriptions, setShowDescriptions] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [basemapKey, setBasemapKey] = useState('map')
  const mapRef = useRef<L.Map | null>(null)
  const hierRef = useRef<HTMLUListElement | null>(null)
  const basemap = BASEMAPS.find(b => b.key === basemapKey) ?? BASEMAPS[0]

  // Expand all groups by default once a scene is loaded.
  useEffect(() => { if (nodes) setExpandedIds(new Set(allGroupIds(nodes))) }, [nodes])

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const flyTo = (node: MapNode) => {
    const map = mapRef.current
    if (!map) return
    if (node.type === 'circle' && node.lat != null && node.lng != null && node.radius) {
      map.flyToBounds(L.latLng(node.lat, node.lng).toBounds(node.radius * 2.4), { duration: 0.5 })
      return
    }
    const pts: [number, number][] = []
    collectLatLngs(node, pts)
    if (!pts.length) return
    if (pts.length === 1) { map.flyTo(pts[0], Math.max(map.getZoom(), 15), { duration: 0.5 }); return }
    const b = L.latLngBounds(pts)
    if (b.isValid()) map.flyToBounds(b.pad(0.2), { duration: 0.5 })
  }

  // Expand ancestor groups so a node becomes visible in the hierarchy tree.
  const revealInHierarchy = (id: string) => {
    const path = nodes ? findPath(nodes, id) : null
    if (path?.length) setExpandedIds(prev => { const n = new Set(prev); path.forEach(p => n.add(p)); return n })
  }

  // Hierarchy click → select + zoom on the map (description stays closed).
  const handleHierarchyClick = (node: MapNode) => { setSelectedId(node.id); setInfoId(null); flyTo(node) }

  // Map element click → select + reveal in hierarchy + show description.
  const handleMapClick = (node: MapNode) => { setSelectedId(node.id); setInfoId(node.id); revealInHierarchy(node.id) }

  // Description-index click → show description, zoom, and reveal in hierarchy.
  const handleDescriptionClick = (node: MapNode) => {
    setSelectedId(node.id); setInfoId(node.id); revealInHierarchy(node.id); flyTo(node)
  }

  // Keep the selected hierarchy row scrolled into view.
  useEffect(() => {
    if (!selectedId) return
    hierRef.current?.querySelector(`[data-node-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, expandedIds])

  useEffect(() => {
    const parts = vfsPath.split('/')
    const name = parts.pop()!
    const dir = '/' + parts.join('/')
    let cancelled = false
    ;(async () => {
      try {
        const json = await readFileAt(dir, name, MAP_EXT)
        if (!cancelled) setNodes(deserialize(json))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [vfsPath])

  const described = useMemo(() => (nodes ? collectDescribed(nodes) : []), [nodes])
  const infoNode = nodes && infoId ? findNode(nodes, infoId) : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#1a1a1a', color: '#fff' }}>
      {/* control bar (title removed — the markdown embed shows mode + name) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, height: 36, bgcolor: '#252526', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={showHierarchy ? 'Hide hierarchy' : 'Show hierarchy'}>
          <IconButton
            size="small"
            onClick={() => setShowHierarchy(v => !v)}
            sx={{ color: showHierarchy ? '#4fc3f7' : 'text.secondary' }}
          >
            <AccountTreeIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={showDescriptions ? 'Hide descriptions' : 'Show descriptions'}>
          <IconButton
            size="small"
            onClick={() => setShowDescriptions(v => !v)}
            sx={{ color: showDescriptions ? '#4fc3f7' : 'text.secondary' }}
          >
            <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {error ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
        </Box>
      ) : !nodes ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* hierarchy tree (toggleable) */}
          {showHierarchy && (
            <Box sx={{ width: 240, flexShrink: 0, bgcolor: '#252526', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ px: 1.5, height: 30, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
                  Hierarchy
                </Typography>
              </Box>
              <List dense disablePadding ref={hierRef} sx={{ flex: 1, overflow: 'auto' }}>
                {nodes.map(n => (
                  <ViewerTreeNode
                    key={n.id}
                    node={n}
                    depth={0}
                    selectedId={selectedId}
                    expandedIds={expandedIds}
                    onToggleExpand={toggleExpand}
                    onSelect={handleHierarchyClick}
                  />
                ))}
              </List>
            </Box>
          )}

          {/* map */}
          <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <MapContainer center={[52.2297, 21.0122]} zoom={6} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
              <MapCapture mapRef={mapRef} />
              <TileLayer
                key={basemap.key}
                url={basemap.url}
                attribution={basemap.attribution}
                maxZoom={basemap.maxZoom}
                {...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})}
              />
              {nodes.map(n => renderMapNode(n, { onClick: handleMapClick, skipTileLayers: true }))}
              <FitBounds nodes={nodes} />
            </MapContainer>

            {/* basemap switcher */}
            <Paper
              elevation={4}
              sx={{
                position: 'absolute', top: 8, right: 8, zIndex: 1000,
                px: 0.5, py: 0.25, display: 'flex', alignItems: 'center', gap: 0.5,
                bgcolor: 'rgba(37,37,38,0.95)', border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <LayersIcon sx={{ fontSize: 16, color: 'text.secondary', ml: 0.5 }} />
              <Select
                size="small"
                variant="standard"
                disableUnderline
                value={basemapKey}
                onChange={e => setBasemapKey(e.target.value)}
                sx={{ fontSize: '0.74rem', minWidth: 110, '& .MuiSelect-select': { py: 0.25, pr: '20px !important' } }}
              >
                {BASEMAPS.map(b => (
                  <MenuItem key={b.key} value={b.key} sx={{ fontSize: '0.75rem' }}>{b.label}</MenuItem>
                ))}
              </Select>
            </Paper>
          </Box>

          {/* described-elements index */}
          {showDescriptions && (
          <Box sx={{ width: 240, flexShrink: 0, bgcolor: '#252526', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, height: 30, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
                Descriptions ({described.length})
              </Typography>
            </Box>
            {described.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
                  No element in this scene has a description.
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
                {described.map(n => (
                  <ListItemButton
                    key={n.id}
                    selected={selectedId === n.id}
                    onClick={() => handleDescriptionClick(n)}
                    sx={{ minHeight: 32, '&.Mui-selected': { bgcolor: 'rgba(79,195,247,0.14)' } }}
                  >
                    <InfoOutlinedIcon sx={{ fontSize: 14, color: '#4fc3f7', mr: 1, flexShrink: 0 }} />
                    <ListItemText
                      primary={n.name}
                      secondary={n.infoType === 'url' ? 'web page' : 'markdown'}
                      primaryTypographyProps={{ sx: { fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                      secondaryTypographyProps={{ sx: { fontSize: '0.6rem' } }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            <Divider sx={{ opacity: 0.3 }} />
            <Box sx={{ px: 1.5, py: 0.75 }}>
              <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                Click a map element or a list item to read its description.
              </Typography>
            </Box>
          </Box>
          )}
        </Box>
      )}

      {/* Description window (compact card or fullscreen, per element's ShowInfo) */}
      <InfoView node={infoNode} onClose={() => setInfoId(null)} />
    </Box>
  )
}
