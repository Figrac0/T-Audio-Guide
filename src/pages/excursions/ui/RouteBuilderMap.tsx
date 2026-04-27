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
import '@/features/route-map/ui/map-marker-skin.css'
import './RouteBuilderMap.css'

export interface RouteBuilderMapHandle {
  closePopup: () => void
}

interface RouteBuilderMapProps {
  draftPointOrders: ReadonlyMap<string, number>
  isDraftFull: boolean
  isLoading: boolean
  nearbyPoints: NearbyPoint[]
  onAddPoint: (point: NearbyPoint) => void
  onChangeRadius: (meters: number) => void
  onRemovePoint: (pointId: string) => void
  onSelectPoint: (id: string) => void
  radiusMeters: number
  recenterKey: number
  routeState: PlannerRouteState
  selectedPointId: string
  userPosition: GeoPoint | null
}

const MAP_PADDING: [number, number, number, number] = [72, 24, 24, 24]

export const RouteBuilderMap = forwardRef<RouteBuilderMapHandle, RouteBuilderMapProps>(function RouteBuilderMap({
  draftPointOrders,
  isDraftFull,
  isLoading,
  nearbyPoints,
  onAddPoint,
  onChangeRadius,
  onRemovePoint,
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
  const onRemovePointRef = useRef(onRemovePoint)
  const onSelectPointRef = useRef(onSelectPoint)
  const isDraftFullRef = useRef(isDraftFull)
  const onChangeRadiusRef = useRef(onChangeRadius)
  const radiusMetersRef = useRef(radiusMeters)
  const selectedPointIdRef = useRef(selectedPointId)

  useEffect(() => {
    onAddPointRef.current = onAddPoint
    onRemovePointRef.current = onRemovePoint
    onSelectPointRef.current = onSelectPoint
    isDraftFullRef.current = isDraftFull
    onChangeRadiusRef.current = onChangeRadius
    radiusMetersRef.current = radiusMeters
  }, [isDraftFull, onAddPoint, onChangeRadius, onRemovePoint, onSelectPoint, radiusMeters])

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
    const circleLayer = circle

    function step(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration)
      circleLayer.setRadius(start + (end - start) * (1 - Math.pow(1 - progress, 3)))
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
      const draftOrder = draftPointOrders.get(point.id) ?? null
      const marker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, point.id === selectedPointIdRef.current, draftOrder),
        title: buildMarkerTitle(point),
      })

      marker.on('click', () => {
        onSelectPointRef.current(point.id)
        mapRef.current?.closePopup()

        const isInDraft = draftOrder !== null
        const closePopup = () => mapRef.current?.closePopup()

        const popupEl = buildPopupEl(
          point,
          isInDraft,
          isDraftFullRef.current,
          () => { onAddPointRef.current(point); closePopup() },
          () => { onRemovePointRef.current(point.id); closePopup() },
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
  }, [draftPointOrders, nearbyPoints])

  useEffect(() => {
    nearbyPoints.forEach((point) => {
      const marker = markerRefsMap.current.get(point.id)
      if (!marker) return

      marker.setIcon(
        createPoiIcon(
          point,
          point.id === selectedPointId,
          draftPointOrders.get(point.id) ?? null,
        ),
      )
    })
  }, [draftPointOrders, nearbyPoints, selectedPointId])

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
  onRemove: () => void,
): HTMLElement {
  const placeholder = buildPlacePlaceholderImage(point.category)

  const root = document.createElement('div')
  root.className = 'rbm-popup'

  // Cover image
  const cover = document.createElement('div')
  cover.className = 'rbm-popup__cover'
  const image = document.createElement('img')
  image.src = point.imageUrl || placeholder
  image.alt = point.title
  image.loading = 'lazy'
  image.onerror = () => { image.src = placeholder }
  cover.appendChild(image)
  root.appendChild(cover)

  // Body
  const body = document.createElement('div')
  body.className = 'rbm-popup__body'

  // Top row: category badge + meta chips on the same line
  const topRow = document.createElement('div')
  topRow.className = 'rbm-popup__toprow'

  const category = document.createElement('span')
  category.className = 'rbm-popup__cat'
  category.textContent = formatPointCategory(point.category)
  topRow.appendChild(category)

  const chips = document.createElement('div')
  chips.className = 'rbm-popup__chips'

  const distance = document.createElement('span')
  distance.className = 'rbm-popup__meta-chip'
  distance.textContent = formatMeters(point.distanceMeters)
  chips.appendChild(distance)

  if (point.expectedVisitMinutes > 0) {
    const duration = document.createElement('span')
    duration.className = 'rbm-popup__meta-chip'
    duration.textContent = formatDuration(point.expectedVisitMinutes)
    chips.appendChild(duration)
  }

  if (point.rating > 0) {
    const rating = document.createElement('span')
    rating.className = 'rbm-popup__meta-chip rbm-popup__meta-chip--accent'
    rating.textContent = `★ ${point.rating.toFixed(1)}`
    chips.appendChild(rating)
  }

  topRow.appendChild(chips)
  body.appendChild(topRow)

  // Title
  const title = document.createElement('h3')
  title.className = 'rbm-popup__title'
  title.textContent = point.title
  body.appendChild(title)

  // Description
  if (point.shortDescription) {
    const description = document.createElement('p')
    description.className = 'rbm-popup__desc'
    description.textContent = point.shortDescription
    body.appendChild(description)
  }

  // Schedule / address
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

  // Buttons
  const btnGroup = document.createElement('div')
  btnGroup.className = 'rbm-popup__btn-group'

  const button = document.createElement('button')
  button.type = 'button'

  if (isInDraft) {
    button.className = 'rbm-popup__btn rbm-popup__btn--danger'
    button.textContent = 'Удалить из маршрута'
    button.addEventListener('click', onRemove)
  } else if (isDraftFull) {
    button.className = 'rbm-popup__btn'
    button.textContent = 'Маршрут заполнен'
    button.disabled = true
  } else {
    button.className = 'rbm-popup__btn rbm-popup__btn--primary'
    button.textContent = 'Добавить в свой маршрут'
    button.addEventListener('click', onAdd)
  }
  btnGroup.appendChild(button)

  const audioBtn = document.createElement('button')
  audioBtn.type = 'button'
  audioBtn.className = `rbm-popup__btn rbm-popup__btn--audio${point.audioGuideUrl ? '' : ' rbm-popup__btn--audio-disabled'}`
  audioBtn.disabled = !point.audioGuideUrl
  audioBtn.textContent = '🎧 Прослушать аудиогид'
  if (point.audioGuideUrl) {
    audioBtn.addEventListener('click', () => {
      // TODO: open audio player when backend provides audioGuideUrl
    })
  }
  btnGroup.appendChild(audioBtn)

  body.appendChild(btnGroup)
  root.appendChild(body)

  return root
}
