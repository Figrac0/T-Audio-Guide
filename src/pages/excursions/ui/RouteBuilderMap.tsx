import { useEffect, useRef } from 'react'
import * as L from 'leaflet'

import type { GeoPoint, NearbyPoint } from '@/entities/excursion/model/types'
import type { PlannerRouteState } from '@/pages/excursions/model/useExcursionsPageState'
import {
  applyLeafletLocation,
  buildMarkerTitle,
  createDiscoveryRadiusCircle,
  createGuidePolyline,
  createLeafletMap,
  createPoiIcon,
  createSegmentedRoutePolyline,
  createUserIcon,
} from '@/features/route-map/lib/leaflet-map'
import {
  getBoundsFromPoints,
  toLngLat,
} from '@/features/route-map/lib/route-geometry'
import { formatPointCategory } from '@/shared/lib/format'
import { appMapConfig } from '@/shared/config/map'
import './RouteBuilderMap.css'

interface RouteBuilderMapProps {
  draftPointIds: Set<string>
  isDraftFull: boolean
  isLoading: boolean
  isPointInDraft: (id: string) => boolean
  nearbyPoints: NearbyPoint[]
  onAddPoint: (point: NearbyPoint) => void
  onChangeRadius: (meters: number) => void
  onSelectPoint: (id: string) => void
  radiusMeters: number
  recenterKey: number
  routeState: PlannerRouteState
  selectedPointId: string
  userPosition: GeoPoint | null
}

const MAP_PADDING: [number, number, number, number] = [72, 24, 24, 24]

export function RouteBuilderMap({
  draftPointIds,
  isDraftFull,
  isLoading,
  isPointInDraft,
  nearbyPoints,
  onAddPoint,
  onChangeRadius,
  onSelectPoint,
  radiusMeters,
  recenterKey,
  routeState,
  selectedPointId,
  userPosition,
}: RouteBuilderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const radiusCircleRef = useRef<L.Circle | null>(null)
  const markerRefsMap = useRef(new Map<string, L.Marker>())
  const hasAutoFittedRef = useRef(false)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable refs so event-handler closures always call current callbacks
  const onAddPointRef = useRef(onAddPoint)
  const onSelectPointRef = useRef(onSelectPoint)
  const isPointInDraftRef = useRef(isPointInDraft)
  const isDraftFullRef = useRef(isDraftFull)
  const onChangeRadiusRef = useRef(onChangeRadius)
  const radiusMetersRef = useRef(radiusMeters)

  onAddPointRef.current = onAddPoint
  onSelectPointRef.current = onSelectPoint
  isPointInDraftRef.current = isPointInDraft
  isDraftFullRef.current = isDraftFull
  onChangeRadiusRef.current = onChangeRadius
  radiusMetersRef.current = radiusMeters

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = createLeafletMap(container, appMapConfig.defaultCenter, appMapConfig.defaultZoom)
    const routeLayer = L.layerGroup().addTo(map)
    const markersLayer = L.layerGroup().addTo(map)

    mapRef.current = map
    routeLayerRef.current = routeLayer
    markersLayerRef.current = markersLayer

    map.on('zoomend', () => {
      if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
      zoomDebounceRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        const center = bounds.getCenter()
        const half = center.distanceTo(L.latLng(center.lat, bounds.getEast()))
        onChangeRadiusRef.current(Math.round(Math.min(5000, Math.max(1000, half))))
      }, 350)
    })

    return () => {
      if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
      routeLayerRef.current?.clearLayers()
      markersLayerRef.current?.clearLayers()
      routeLayerRef.current = null
      markersLayerRef.current = null
      markerRefsMap.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // ── Route layer: radius circle + dashed guide + solid segments + user marker ──
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

    // segments[0] when hasLeadSegment = user → first stop, rendered as dashed guide
    if (routeState.hasLeadSegment && routeState.segments.length > 0) {
      createGuidePolyline({
        type: 'LineString',
        coordinates: routeState.segments[0],
      }).addTo(layer)
    }

    // Remaining segments are stop-to-stop legs, solid and colored per segment
    const stopSegments = routeState.hasLeadSegment
      ? routeState.segments.slice(1)
      : routeState.segments

    if (stopSegments.length > 0) {
      createSegmentedRoutePolyline({
        type: 'MultiLineString',
        coordinates: stopSegments,
      }).addTo(layer)
    }

    if (userPosition) {
      L.marker([userPosition.lat, userPosition.lng], {
        icon: createUserIcon(),
        title: 'Ваше местоположение',
        zIndexOffset: 100,
      }).addTo(layer)
    }
  }, [routeState, userPosition])

  // ── Smooth radius animation ─────────────────────────────────────────────────
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
      circle.setRadius(start + (end - start) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [radiusMeters])

  // ── Markers: full rebuild only when point data changes ─────────────────────
  useEffect(() => {
    const layer = markersLayerRef.current
    if (!layer) return
    layer.clearLayers()
    markerRefsMap.current.clear()

    nearbyPoints.forEach((point) => {
      const marker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, point.id === selectedPointId, draftPointIds.has(point.id)),
        title: buildMarkerTitle(point),
      })

      marker.on('click', () => {
        onSelectPointRef.current(point.id)
        mapRef.current?.closePopup()

        const popupEl = buildPopupEl(
          point,
          isPointInDraftRef.current(point.id),
          isDraftFullRef.current,
          () => {
            onAddPointRef.current(point)
            mapRef.current?.closePopup()
          },
        )

        L.popup({
          className: 'rbm-leaflet-popup',
          closeButton: true,
          maxWidth: 280,
          minWidth: 240,
          offset: [0, -28],
        })
          .setContent(popupEl)
          .setLatLng([point.coordinates.lat, point.coordinates.lng])
          .openOn(mapRef.current!)
      })

      marker.addTo(layer)
      markerRefsMap.current.set(point.id, marker)
    })
    // selectedPointId and draftPointIds excluded: icon updates happen in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyPoints])

  // ── Icon update on selection/draft change (no full rebuild) ─────────────────
  useEffect(() => {
    nearbyPoints.forEach((point) => {
      const marker = markerRefsMap.current.get(point.id)
      if (!marker) return
      marker.setIcon(createPoiIcon(point, point.id === selectedPointId, draftPointIds.has(point.id)))
    })
  }, [nearbyPoints, selectedPointId, draftPointIds])

  // ── Auto-fit bounds on first data load ──────────────────────────────────────
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

  // ── Fly to user on recenter trigger ────────────────────────────────────────
  useEffect(() => {
    if (!recenterKey || !userPosition || !mapRef.current) return
    applyLeafletLocation(mapRef.current, {
      center: toLngLat(userPosition),
      zoom: 15.5,
      duration: 700,
    })
  }, [recenterKey, userPosition])

  return (
    <div className="rbm">
      <div className="rbm__container" ref={containerRef} />
      {isLoading && <div className="rbm__loader" role="status">Загрузка мест…</div>}
    </div>
  )
}

// ── Popup DOM builder ──────────────────────────────────────────────────────────

function buildPopupEl(
  point: NearbyPoint,
  isInDraft: boolean,
  isDraftFull: boolean,
  onAdd: () => void,
): HTMLElement {
  const root = document.createElement('div')
  root.className = 'rbm-popup'

  if (point.imageUrl) {
    const cover = document.createElement('div')
    cover.className = 'rbm-popup__cover'
    const img = document.createElement('img')
    img.src = point.imageUrl
    img.alt = point.title
    img.loading = 'lazy'
    img.onerror = () => { cover.style.display = 'none' }
    cover.appendChild(img)
    root.appendChild(cover)
  }

  const body = document.createElement('div')
  body.className = 'rbm-popup__body'

  const cat = document.createElement('span')
  cat.className = 'rbm-popup__cat'
  cat.textContent = formatPointCategory(point.category)
  body.appendChild(cat)

  const titleEl = document.createElement('h3')
  titleEl.className = 'rbm-popup__title'
  titleEl.textContent = point.title
  body.appendChild(titleEl)

  if (point.shortDescription) {
    const desc = document.createElement('p')
    desc.className = 'rbm-popup__desc'
    desc.textContent = point.shortDescription
    body.appendChild(desc)
  }

  const btn = document.createElement('button')
  btn.type = 'button'

  if (isInDraft) {
    btn.className = 'rbm-popup__btn'
    btn.textContent = 'Уже в маршруте ✓'
    btn.disabled = true
  } else if (isDraftFull) {
    btn.className = 'rbm-popup__btn'
    btn.textContent = 'Маршрут заполнен'
    btn.disabled = true
  } else {
    btn.className = 'rbm-popup__btn rbm-popup__btn--primary'
    btn.textContent = 'Добавить в маршрут'
    btn.addEventListener('click', onAdd)
  }

  body.appendChild(btn)
  root.appendChild(body)

  return root
}
