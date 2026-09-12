export type MapNodeType = 'tile-layer' | 'marker' | 'polygon' | 'polyline' | 'circle' | 'group' | 'route'

/** Mode of travel for a route between two points. */
export type TravelMode = 'foot' | 'bike' | 'car' | 'train' | 'bus' | 'plane'

/** A geographic endpoint of a route. */
export interface RoutePoint {
  lat: number
  lng: number
  label?: string
}

export interface MapNode {
  id: string
  name: string
  type: MapNodeType
  visible: boolean
  children?: MapNode[]
  // tile-layer
  url?: string
  attribution?: string
  opacity?: number
  // spatial (marker / circle)
  lat?: number
  lng?: number
  // polygon / polyline / route geometry
  positions?: [number, number][]
  // circle
  radius?: number
  // route
  travelMode?: TravelMode
  from?: RoutePoint
  to?: RoutePoint
  distanceM?: number
  durationS?: number
  // info / description
  infoType?: 'markdown' | 'url'
  info?: string
  showInfo?: 'compact' | 'fullscreen'
  // popup
  popup?: string
  // style
  color?: string
  fillOpacity?: number
  weight?: number
}
