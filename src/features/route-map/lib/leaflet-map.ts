import * as L from 'leaflet'

import type { GeoPoint, NearbyPoint, RouteStop } from '@/entities/excursion/model/types'
import {
  type LngLatBounds,
  type MapLocationRequest,
  type RouteGeometry,
} from '@/features/route-map/lib/route-geometry'

export const openStreetMapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const openStreetMapAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const emptyDivIconClassName = 'leaflet-div-icon leaflet-div-icon--clean'

export function createOpenStreetMapLayer() {
  return L.tileLayer(openStreetMapTileUrl, {
    attribution: openStreetMapAttribution,
    maxZoom: 19,
    minZoom: 2,
    keepBuffer: 2,
    updateWhenZooming: false,
    updateWhenIdle: true,
    tileSize: 256,
    crossOrigin: true,
  })
}

export function createLeafletMap(container: HTMLElement, center: GeoPoint, zoom: number) {
  const map = L.map(container, {
    attributionControl: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    zoomAnimation: true,
    zoomAnimationThreshold: 4,
    preferCanvas: true,
    zoomControl: false,
    easeLinearity: 0.5,
    maxBoundsViscosity: 1.0,
    wheelPxPerZoomLevel: 60,
    wheelDebounceTime: 60,
    touchZoom: true,
  }).setView(toLeafletLatLng(center), zoom)

  createOpenStreetMapLayer().addTo(map)

  window.requestAnimationFrame(() => {
    try {
      map.invalidateSize()
    } catch {
      // Ignore errors during size invalidation if container isn't ready
    }
  })
  window.setTimeout(() => {
    try {
      map.invalidateSize()
    } catch {
      // Ignore errors during size invalidation if container isn't ready
    }
  }, 180)

  return map
}

export function applyLeafletLocation(map: L.Map, location: MapLocationRequest) {
  if ('bounds' in location) {
    map.flyToBounds(toLeafletBounds(location.bounds), {
      animate: true,
      duration: toLeafletDuration(location.duration),
      paddingTopLeft: location.padding
        ? L.point(location.padding[3], location.padding[0])
        : undefined,
      paddingBottomRight: location.padding
        ? L.point(location.padding[1], location.padding[2])
        : undefined,
    })
    return
  }

  map.flyTo(toLeafletLatLngFromLngLat(location.center), location.zoom, {
    animate: true,
    duration: toLeafletDuration(location.duration),
  })
}

export function toLeafletLatLng(point: GeoPoint): L.LatLngExpression {
  return [point.lat, point.lng]
}

export function toLeafletLatLngFromLngLat(point: [number, number]): L.LatLngExpression {
  return [point[1], point[0]]
}

export function toLeafletBounds(bounds: LngLatBounds): L.LatLngBoundsExpression {
  return [
    [bounds[0][1], bounds[0][0]],
    [bounds[1][1], bounds[1][0]],
  ]
}

export function toLeafletPolylineSegments(
  geometry: RouteGeometry,
): L.LatLngExpression[] | L.LatLngExpression[][] {
  if (geometry.type === 'LineString') {
    return geometry.coordinates.map(toLeafletLatLngFromLngLat)
  }

  return geometry.coordinates.map((segment) => segment.map(toLeafletLatLngFromLngLat))
}

export function createPoiIcon(
  point: NearbyPoint,
  isActive: boolean,
  draftOrder: number | null = null,
  shouldPulse = false,
) {
  const isInDraft = draftOrder !== null
  const markerClasses = [
    'poi-marker',
    isActive ? 'poi-marker--active' : '',
    isActive && shouldPulse ? 'poi-marker--pulse' : '',
    isInDraft ? 'poi-marker--draft' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return L.divIcon({
    className: emptyDivIconClassName,
    html: `<div class="${markerClasses}"><span class="poi-marker__glyph poi-marker__glyph--${point.category}" aria-hidden="true">${getCategoryIcon(point.category)}</span>${draftOrder !== null ? `<span class="poi-marker__order" aria-hidden="true">${draftOrder}</span>` : ''}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  })
}

export function createRouteStopIcon(
  stop: RouteStop,
  isActive: boolean,
  isStart: boolean,
  isFinish: boolean,
) {
  // Show only the stop number — no "Старт"/"Финиш" labels above it.
  // The number alone is sufficient (1 = start, N = finish).
  return L.divIcon({
    className: emptyDivIconClassName,
    html: `<div class="map-marker${isActive ? ' map-marker--active' : ''}${isStart ? ' map-marker--start' : ''}${isFinish ? ' map-marker--finish' : ''}"><span class="map-marker__core">${stop.order}</span></div>`,
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  })
}

export function createUserIcon() {
  return L.divIcon({
    // Intentionally NOT emptyDivIconClassName — the clustering CSS hides
    // .leaflet-div-icon--clean, but the user position marker must always show.
    className: 'leaflet-div-icon leaflet-div-icon--user',
    html: '<div class="user-marker"><span class="user-marker__pulse" aria-hidden="true"></span><span class="user-marker__dot"></span></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

export function createDiscoveryRadiusCircle(center: GeoPoint, radiusMeters: number) {
  return L.circle(toLeafletLatLng(center), {
    color: 'rgba(14, 116, 144, 0.5)',
    fillColor: 'rgba(14, 116, 144, 0.14)',
    fillOpacity: 0.36,
    radius: radiusMeters,
    renderer: L.canvas(),
    weight: 2,
  })
}

export function createRoutePolyline(geometry: RouteGeometry, routeColor: string) {
  const segments = toLeafletPolylineSegments(geometry)
  const renderer = L.canvas({ padding: 0.5 })

  const shadow = L.polyline(segments, {
    color: 'rgba(15, 118, 110, 0.18)',
    lineCap: 'round',
    lineJoin: 'round',
    opacity: 1,
    renderer,
    weight: 12,
  })

  const line = L.polyline(segments, {
    color: routeColor,
    lineCap: 'round',
    lineJoin: 'round',
    opacity: 0.9,
    renderer,
    weight: 6,
  })

  const highlight = L.polyline(segments, {
    color: 'rgba(255,255,255,0.5)',
    lineCap: 'round',
    lineJoin: 'round',
    opacity: 0.8,
    renderer,
    weight: 2,
  })

  return L.layerGroup([shadow, line, highlight])
}

export function createSegmentedRoutePolyline(geometry: RouteGeometry) {
  const segmentPalette = ['#1f8a70', '#0f4c81', '#7c3aed', '#d97706', '#4f772d', '#c2514b']
  const segments =
    geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
  const renderer = L.canvas({ padding: 0.5 })

  const layers = segments.flatMap((segment, index) => {
    const path = segment.map(toLeafletLatLngFromLngLat)
    const routeColor = segmentPalette[index % segmentPalette.length]

    return [
      L.polyline(path, {
        color: 'rgba(15, 118, 110, 0.16)',
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 1,
        renderer,
        weight: 12,
      }),
      L.polyline(path, {
        color: routeColor,
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.92,
        renderer,
        weight: 6,
      }),
      L.polyline(path, {
        color: 'rgba(255,255,255,0.46)',
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.78,
        renderer,
        weight: 2,
      }),
    ]
  })

  return L.layerGroup(layers)
}

export function createPlannerRoutePolyline(
  segments: [number, number][][],
  options?: { hasLeadSegment?: boolean },
) {
  const segmentPalette = ['#0f4c81', '#1f8a70', '#7c3aed', '#d97706', '#4f772d', '#c2514b']
  const hasLeadSegment = Boolean(options?.hasLeadSegment)

  const renderer = L.canvas({ padding: 0.5 })

  const layers = segments.flatMap((segment, index) => {
    const path = segment.map(toLeafletLatLngFromLngLat)
    const isLeadSegment = hasLeadSegment && index === 0
    const routeColor = segmentPalette[index % segmentPalette.length]

    const shadow = L.polyline(path, {
      color: 'rgba(15, 23, 42, 0.12)',
      lineCap: 'round',
      lineJoin: 'round',
      opacity: 1,
      renderer,
      weight: isLeadSegment ? 10 : 12,
    })

    const line = L.polyline(path, {
      color: routeColor,
      dashArray: isLeadSegment ? '12 10' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
      opacity: isLeadSegment ? 0.88 : 0.94,
      renderer,
      weight: isLeadSegment ? 5 : 6,
    })

    const highlight = L.polyline(path, {
      color: 'rgba(255,255,255,0.46)',
      dashArray: isLeadSegment ? '12 10' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
      opacity: 0.76,
      renderer,
      weight: 2,
    })

    return [shadow, line, highlight]
  })

  return L.layerGroup(layers)
}

export function createGuidePolyline(geometry: RouteGeometry) {
  const segments = toLeafletPolylineSegments(geometry)
  const renderer = L.canvas({ padding: 0.5 })

  const shadow = L.polyline(segments, {
    color: 'rgba(23, 48, 66, 0.16)',
    lineCap: 'round',
    lineJoin: 'round',
    opacity: 1,
    renderer,
    weight: 14,
  })

  const line = L.polyline(segments, {
    color: '#0f4c81',
    dashArray: '12 10',
    lineCap: 'round',
    lineJoin: 'round',
    opacity: 0.92,
    renderer,
    weight: 5,
  })

  const highlight = L.polyline(segments, {
    color: 'rgba(255,255,255,0.64)',
    dashArray: '12 10',
    lineCap: 'round',
    lineJoin: 'round',
    opacity: 0.72,
    renderer,
    weight: 2,
  })

  return L.layerGroup([shadow, line, highlight])
}

export function buildMarkerTitle(point: { title: string; shortDescription?: string }) {
  return point.shortDescription ? `${point.title}\n${point.shortDescription}` : point.title
}

export function getPointCategoryIcon(category: NearbyPoint['category'] | 'all' | number) {
  // Backend category id — generic landmark pin; HomePage handles its own
  // dynamic icon mapping for backend categories via pickCategoryIcon().
  if (typeof category === 'number') return '📍'
  switch (category) {
    case 'museum':
      return '🏛'
    case 'food':
      return '🍽'
    case 'park':
      return '🌿'
    case 'entertainment':
      return '✨'
    case 'landmark':
      return '📍'
    case 'all':
    default:
      return '◎'
  }
}

function toLeafletDuration(duration?: number) {
  if (!duration) {
    return undefined
  }

  return duration / 1000
}

function getCategoryIcon(category: NearbyPoint['category']) {
  return getPointCategoryIcon(category)
}

export function createClusterIcon(count: number) {
  // Grow 2px per extra point above 2, cap at 58px.
  // count=2→44px, count=5→50px, count=9+→58px
  const size = Math.min(58, 44 + (count - 2) * 2)
  const half = Math.floor(size / 2)
  const fontSize = Math.round(size * 0.32)
  return L.divIcon({
    className: 'leaflet-div-icon leaflet-div-icon--cluster',
    html: `<div class="cluster-marker" style="width:${size}px;height:${size}px;font-size:${fontSize}px">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  })
}
