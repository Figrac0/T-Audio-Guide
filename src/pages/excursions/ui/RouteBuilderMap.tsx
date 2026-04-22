import { useEffect, useRef } from 'react'
import * as L from 'leaflet'

import type { GeoPoint, NearbyPoint } from '@/entities/excursion/model/types'
import {
  applyLeafletLocation,
  buildMarkerTitle,
  createDiscoveryRadiusCircle,
  createLeafletMap,
  createPoiIcon,
  createSegmentedRoutePolyline,
  createUserIcon,
} from '@/features/route-map/lib/leaflet-map'
import {
  getBoundsFromPoints,
  toLngLat,
  type RouteGeometry,
} from '@/features/route-map/lib/route-geometry'
import { appMapConfig } from '@/shared/config/map'
import './RouteBuilderMap.css'

interface RouteBuilderMapProps {
  draftRouteGeometry: RouteGeometry | null
  draftStopIds: Set<string>
  isLoading: boolean
  nearbyPoints: NearbyPoint[]
  onChangeRadius: (meters: number) => void
  onPointClick: (point: NearbyPoint) => void
  radiusMeters: number
  recenterTrigger: number
  selectedPointId: string
  userPosition: GeoPoint | null
}

const MAP_PADDING: [number, number, number, number] = [72, 24, 24, 24]

export function RouteBuilderMap({
  draftRouteGeometry,
  draftStopIds,
  isLoading,
  nearbyPoints,
  onChangeRadius,
  onPointClick,
  radiusMeters,
  recenterTrigger,
  selectedPointId,
  userPosition,
}: RouteBuilderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const radiusCircleRef = useRef<L.Circle | null>(null)
  const markerRefs = useRef(new Map<string, L.Marker>())
  const hasAutoFittedRef = useRef(false)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRadiusRef = useRef(onChangeRadius)
  const radiusMetersRef = useRef(radiusMeters)

  onChangeRadiusRef.current = onChangeRadius
  radiusMetersRef.current = radiusMeters

  // Map init + cleanup
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = createLeafletMap(container, appMapConfig.defaultCenter, appMapConfig.defaultZoom)
    const routeLayer = L.layerGroup().addTo(map)
    const markersLayer = L.layerGroup().addTo(map)

    mapRef.current = map
    routeLayerRef.current = routeLayer
    markersLayerRef.current = markersLayer

    // Debounced zoom → radius update (350 ms)
    map.on('zoomend', () => {
      if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
      zoomDebounceRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        const center = bounds.getCenter()
        const east = L.latLng(center.lat, bounds.getEast())
        const half = center.distanceTo(east)
        onChangeRadiusRef.current(Math.round(Math.min(5000, Math.max(1000, half))))
      }, 350)
    })

    return () => {
      if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
      routeLayerRef.current?.clearLayers()
      markersLayerRef.current?.clearLayers()
      routeLayerRef.current = null
      markersLayerRef.current = null
      markerRefs.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Route layer: radius circle + route polylines + user marker
  // Excludes radiusMeters from deps — animation effect handles smooth radius updates.
  useEffect(() => {
    const layer = routeLayerRef.current
    if (!layer) return

    layer.clearLayers()

    if (userPosition) {
      const circle = createDiscoveryRadiusCircle(userPosition, radiusMetersRef.current)
      circle.addTo(layer)
      radiusCircleRef.current = circle
    } else {
      radiusCircleRef.current = null
    }

    if (draftRouteGeometry) {
      createSegmentedRoutePolyline(draftRouteGeometry).addTo(layer)
    }

    if (userPosition) {
      L.marker([userPosition.lat, userPosition.lng], {
        icon: createUserIcon(),
        title: 'Ваше местоположение',
        zIndexOffset: 100,
      }).addTo(layer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRouteGeometry, userPosition])

  // Smooth radius circle animation
  useEffect(() => {
    const circle = radiusCircleRef.current
    if (!circle) return
    const start = circle.getRadius()
    const end = radiusMeters
    if (Math.abs(end - start) < 5) { circle.setRadius(end); return }
    const duration = 380
    const t0 = performance.now()
    let raf: number
    function step(now: number) {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      circle.setRadius(start + (end - start) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [radiusMeters])

  // Markers layer — POI markers only; clicking calls onPointClick (no Leaflet popup)
  useEffect(() => {
    const layer = markersLayerRef.current
    if (!layer) return

    layer.clearLayers()
    markerRefs.current.clear()

    nearbyPoints.forEach((point) => {
      const marker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, point.id === selectedPointId, draftStopIds.has(point.id)),
        title: buildMarkerTitle(point),
      }).on('click', () => onPointClick(point))

      marker.addTo(layer)
      markerRefs.current.set(point.id, marker)
    })
  }, [nearbyPoints, selectedPointId, draftStopIds, onPointClick])

  // Update marker icons when selection or draft changes (no full rebuild)
  useEffect(() => {
    nearbyPoints.forEach((point) => {
      const marker = markerRefs.current.get(point.id)
      if (!marker) return
      marker.setIcon(createPoiIcon(point, point.id === selectedPointId, draftStopIds.has(point.id)))
    })
  }, [nearbyPoints, selectedPointId, draftStopIds])

  // Auto-fit to show all points on first data load
  useEffect(() => {
    const map = mapRef.current
    if (!map || hasAutoFittedRef.current) return

    const allPoints = [
      ...nearbyPoints.map((p) => p.coordinates),
      ...(userPosition ? [userPosition] : []),
    ]
    if (allPoints.length === 0) return

    hasAutoFittedRef.current = true
    applyLeafletLocation(map, {
      bounds: getBoundsFromPoints(allPoints),
      padding: MAP_PADDING,
      duration: 800,
    })
  }, [nearbyPoints, userPosition])

  // Fly to user on recenter trigger
  useEffect(() => {
    if (!recenterTrigger || !userPosition || !mapRef.current) return
    applyLeafletLocation(mapRef.current, {
      center: toLngLat(userPosition),
      zoom: 15.5,
      duration: 700,
    })
  }, [recenterTrigger, userPosition])

  return (
    <div className="rb-map">
      <div className="rb-map__container" ref={containerRef} />
      {isLoading && (
        <div className="rb-map__loader" role="status">Загрузка мест…</div>
      )}
    </div>
  )
}
