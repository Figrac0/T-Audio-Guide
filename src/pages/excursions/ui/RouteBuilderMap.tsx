import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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
  formatMeters,
  getBoundsFromPoints,
  toLngLat,
} from '@/features/route-map/lib/route-geometry'
import { appMapConfig } from '@/shared/config/map'
import { formatDuration, formatPointCategory } from '@/shared/lib/format'
import { buildPlacePlaceholderImage } from '@/shared/lib/placeholder-images'
import './RouteBuilderMap.css'

export interface RouteBuilderMapHandle {
  closePopup: () => void
}

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

export const RouteBuilderMap = forwardRef<RouteBuilderMapHandle, RouteBuilderMapProps>(function RouteBuilderMap({
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
}: RouteBuilderMapProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)
  const radiusCircleRef = useRef<L.Circle | null>(null)
  const markerRefsMap = useRef(new Map<string, L.Marker>())
  const hasAutoFittedRef = useRef(false)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useImperativeHandle(ref, () => ({
    closePopup: () => { mapRef.current?.closePopup() },
  }), [])

  const onAddPointRef = useRef(onAddPoint)
  const onSelectPointRef = useRef(onSelectPoint)
  const isPointInDraftRef = useRef(isPointInDraft)
  const isDraftFullRef = useRef(isDraftFull)
  const onChangeRadiusRef = useRef(onChangeRadius)
  const radiusMetersRef = useRef(radiusMeters)
  const selectedPointIdRef = useRef(selectedPointId)

  useEffect(() => {
    onAddPointRef.current = onAddPoint
    onSelectPointRef.current = onSelectPoint
    isPointInDraftRef.current = isPointInDraft
    isDraftFullRef.current = isDraftFull
    onChangeRadiusRef.current = onChangeRadius
    radiusMetersRef.current = radiusMeters
  }, [isDraftFull, isPointInDraft, onAddPoint, onChangeRadius, onSelectPoint, radiusMeters])

  useEffect(() => {
    selectedPointIdRef.current = selectedPointId
  }, [selectedPointId])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = createLeafletMap(container, appMapConfig.defaultCenter, appMapConfig.defaultZoom)
    const routeLayer = L.layerGroup().addTo(map)
    const markersLayer = L.layerGroup().addTo(map)
    const userLayer = L.layerGroup().addTo(map)
    const markerMap = markerRefsMap.current

    mapRef.current = map
    routeLayerRef.current = routeLayer
    markersLayerRef.current = markersLayer
    userLayerRef.current = userLayer

    map.on('zoomend', () => {
      if (zoomDebounceRef.current !== null) {
        clearTimeout(zoomDebounceRef.current)
      }

      zoomDebounceRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        const center = bounds.getCenter()
        const half = center.distanceTo(L.latLng(center.lat, bounds.getEast()))
        onChangeRadiusRef.current(Math.round(Math.min(5000, Math.max(1000, half))))
      }, 350)
    })

    return () => {
      if (zoomDebounceRef.current !== null) {
        clearTimeout(zoomDebounceRef.current)
      }

      routeLayerRef.current?.clearLayers()
      markersLayerRef.current?.clearLayers()
      userLayerRef.current?.clearLayers()
      routeLayerRef.current = null
      markersLayerRef.current = null
      userLayerRef.current = null
      markerMap.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

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

    if (routeState.hasLeadSegment && routeState.segments.length > 0) {
      createGuidePolyline({
        type: 'LineString',
        coordinates: routeState.segments[0],
      }).addTo(layer)
    }

    const stopSegments = routeState.hasLeadSegment
      ? routeState.segments.slice(1)
      : routeState.segments

    if (stopSegments.length > 0) {
      createSegmentedRoutePolyline({
        type: 'MultiLineString',
        coordinates: stopSegments,
      }).addTo(layer)
    }
  }, [routeState, userPosition])

  useEffect(() => {
    const layer = userLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (userPosition) {
      L.marker([userPosition.lat, userPosition.lng], {
        icon: createUserIcon(),
        title: 'Ваше местоположение',
        zIndexOffset: 1000,
      }).addTo(layer)
    }
  }, [userPosition])

  useEffect(() => {
    const circle = radiusCircleRef.current
    if (!circle) return

    const start = circle.getRadius()
    const end = radiusMeters
    if (Math.abs(end - start) < 5) {
      circle.setRadius(end)
      return
    }

    const duration = 380
    const startedAt = performance.now()
    let frameId = 0

    function step(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration)
      circle.setRadius(start + (end - start) * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) frameId = requestAnimationFrame(step)
    }

    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [radiusMeters])

  useEffect(() => {
    const layer = markersLayerRef.current
    if (!layer) return

    layer.clearLayers()
    markerRefsMap.current.clear()

    nearbyPoints.forEach((point) => {
      const marker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, point.id === selectedPointIdRef.current, draftPointIds.has(point.id)),
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
          maxWidth: 320,
          minWidth: 252,
          offset: [0, -38],
        })
          .setContent(popupEl)
          .setLatLng([point.coordinates.lat, point.coordinates.lng])
          .openOn(mapRef.current!)
      })

      marker.addTo(layer)
      markerRefsMap.current.set(point.id, marker)
    })
  }, [draftPointIds, nearbyPoints])

  useEffect(() => {
    nearbyPoints.forEach((point) => {
      const marker = markerRefsMap.current.get(point.id)
      if (!marker) return

      marker.setIcon(createPoiIcon(point, point.id === selectedPointId, draftPointIds.has(point.id)))
    })
  }, [nearbyPoints, selectedPointId, draftPointIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || hasAutoFittedRef.current) return

    const allPoints = [
      ...nearbyPoints.map((point) => point.coordinates),
      ...(userPosition ? [userPosition] : []),
    ]

    if (allPoints.length === 0) return

    hasAutoFittedRef.current = true
    applyLeafletLocation(map, {
      bounds: getBoundsFromPoints(allPoints),
      duration: 800,
      padding: MAP_PADDING,
    })
  }, [nearbyPoints, userPosition])

  useEffect(() => {
    if (!recenterKey || !userPosition || !mapRef.current) return

    applyLeafletLocation(mapRef.current, {
      center: toLngLat(userPosition),
      duration: 700,
      zoom: 15.5,
    })
  }, [recenterKey, userPosition])

  return (
    <div className="rbm">
      <div className="rbm__container" ref={containerRef} />
      {isLoading ? <div className="rbm__loader" role="status">Загрузка мест…</div> : null}
    </div>
  )
})

function buildPopupEl(
  point: NearbyPoint,
  isInDraft: boolean,
  isDraftFull: boolean,
  onAdd: () => void,
): HTMLElement {
  const root = document.createElement('div')
  root.className = 'rbm-popup'

  const cover = document.createElement('div')
  cover.className = 'rbm-popup__cover'

  const image = document.createElement('img')
  const placeholder = buildPlacePlaceholderImage(point.category)
  image.src = point.imageUrl || placeholder
  image.alt = point.title
  image.loading = 'lazy'
  image.onerror = () => {
    image.src = placeholder
  }
  cover.appendChild(image)
  root.appendChild(cover)

  const body = document.createElement('div')
  body.className = 'rbm-popup__body'

  const category = document.createElement('span')
  category.className = 'rbm-popup__cat'
  category.textContent = formatPointCategory(point.category)
  body.appendChild(category)

  const title = document.createElement('h3')
  title.className = 'rbm-popup__title'
  title.textContent = point.title
  body.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'rbm-popup__meta'

  const distance = document.createElement('span')
  distance.className = 'rbm-popup__meta-chip'
  distance.textContent = formatMeters(point.distanceMeters)
  meta.appendChild(distance)

  if (point.expectedVisitMinutes > 0) {
    const duration = document.createElement('span')
    duration.className = 'rbm-popup__meta-chip'
    duration.textContent = formatDuration(point.expectedVisitMinutes)
    meta.appendChild(duration)
  }

  if (point.rating > 0) {
    const rating = document.createElement('span')
    rating.className = 'rbm-popup__meta-chip rbm-popup__meta-chip--accent'
    rating.textContent = `★ ${point.rating.toFixed(1)}`
    meta.appendChild(rating)
  }

  body.appendChild(meta)

  if (point.shortDescription) {
    const description = document.createElement('p')
    description.className = 'rbm-popup__desc'
    description.textContent = point.shortDescription
    body.appendChild(description)
  }

  if (point.addressLabel || point.scheduleLabel) {
    const info = document.createElement('div')
    info.className = 'rbm-popup__info'

    if (point.addressLabel) {
      const address = document.createElement('p')
      address.className = 'rbm-popup__info-line'
      address.textContent = point.addressLabel
      info.appendChild(address)
    }

    if (point.scheduleLabel) {
      const schedule = document.createElement('p')
      schedule.className = 'rbm-popup__info-line'
      schedule.textContent = point.scheduleLabel
      info.appendChild(schedule)
    }

    body.appendChild(info)
  }

  const button = document.createElement('button')
  button.type = 'button'

  if (isInDraft) {
    button.className = 'rbm-popup__btn'
    button.textContent = 'Уже в маршруте'
    button.disabled = true
  } else if (isDraftFull) {
    button.className = 'rbm-popup__btn'
    button.textContent = 'Маршрут заполнен'
    button.disabled = true
  } else {
    button.className = 'rbm-popup__btn rbm-popup__btn--primary'
    button.textContent = 'Добавить в свой маршрут'
    button.addEventListener('click', onAdd)
  }

  body.appendChild(button)
  root.appendChild(body)

  return root
}
