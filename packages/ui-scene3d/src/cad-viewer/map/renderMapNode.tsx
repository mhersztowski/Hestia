import type { ReactNode } from 'react'
import {
  TileLayer, CircleMarker, Popup, Polygon, Polyline, Circle, LayerGroup,
} from 'react-leaflet'
import type { MapNode } from './types'

export interface RenderNodeOpts {
  /** When set, interactive shapes call this on click (used by the viewer). */
  onClick?: (node: MapNode) => void
  /** Skip tile-layer nodes (the viewer supplies its own switchable basemap). */
  skipTileLayers?: boolean
}

/** Recursive read-only renderer for a map node tree (shared by editor & viewer). */
export function renderMapNode(node: MapNode, opts: RenderNodeOpts = {}): ReactNode {
  if (!node.visible) return null
  const handlers = opts.onClick ? { click: () => opts.onClick!(node) } : undefined

  switch (node.type) {
    case 'tile-layer':
      if (opts.skipTileLayers) return null
      return (
        <TileLayer
          key={node.id}
          url={node.url ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution={node.attribution}
          opacity={node.opacity ?? 1}
        />
      )
    case 'marker':
      if (node.lat == null || node.lng == null) return null
      return (
        <CircleMarker
          key={node.id}
          center={[node.lat, node.lng]}
          radius={7}
          pathOptions={{ color: node.color ?? '#ef5350', fillColor: node.color ?? '#ef5350', fillOpacity: 0.85, weight: 1.5 }}
          eventHandlers={handlers}
        >
          {node.popup ? <Popup><pre style={{ margin: 0, fontSize: '0.72rem' }}>{node.popup}</pre></Popup> : null}
        </CircleMarker>
      )
    case 'polygon':
      if (!node.positions?.length) return null
      return (
        <Polygon
          key={node.id}
          positions={node.positions}
          pathOptions={{ color: node.color ?? '#4fc3f7', fillOpacity: node.fillOpacity ?? 0.3, weight: node.weight ?? 2 }}
          eventHandlers={handlers}
        />
      )
    case 'polyline':
      if (!node.positions?.length) return null
      return (
        <Polyline
          key={node.id}
          positions={node.positions}
          pathOptions={{ color: node.color ?? '#ff7043', weight: node.weight ?? 3 }}
          eventHandlers={handlers}
        />
      )
    case 'circle':
      if (node.lat == null || node.lng == null) return null
      return (
        <Circle
          key={node.id}
          center={[node.lat, node.lng]}
          radius={node.radius ?? 500}
          pathOptions={{ color: node.color ?? '#66bb6a', fillOpacity: node.fillOpacity ?? 0.3, weight: node.weight ?? 2 }}
          eventHandlers={handlers}
        />
      )
    case 'route': {
      if (!node.positions?.length) return null
      const routeColor = node.color ?? '#42a5f5'
      return (
        <LayerGroup key={node.id}>
          <Polyline
            positions={node.positions}
            pathOptions={{ color: routeColor, weight: node.weight ?? 4, opacity: 0.9 }}
            eventHandlers={handlers}
          >
            {node.popup ? <Popup><pre style={{ margin: 0, fontSize: '0.72rem' }}>{node.popup}</pre></Popup> : null}
          </Polyline>
          {node.from && (
            <CircleMarker
              center={[node.from.lat, node.from.lng]}
              radius={5}
              pathOptions={{ color: '#fff', fillColor: routeColor, fillOpacity: 1, weight: 2 }}
              eventHandlers={handlers}
            />
          )}
          {node.to && (
            <CircleMarker
              center={[node.to.lat, node.to.lng]}
              radius={6}
              pathOptions={{ color: '#fff', fillColor: routeColor, fillOpacity: 1, weight: 2 }}
              eventHandlers={handlers}
            />
          )}
        </LayerGroup>
      )
    }
    case 'group':
      if (!node.children?.length) return null
      return (
        <LayerGroup key={node.id}>
          {node.children.map(child => renderMapNode(child, opts))}
        </LayerGroup>
      )
    default:
      return null
  }
}
