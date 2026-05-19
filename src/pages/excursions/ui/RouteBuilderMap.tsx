import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as L from 'leaflet'

import type { GeoPoint, NearbyPoint } from '@/entities/excursion/model/types'
import { fetchPointDetailData } from '@/entities/excursion/model/usePointDetailsMap'
import type { PlannerRouteState } from '@/pages/excursions/model/useExcursionsPageState'
import {
  applyLeafletLocation,
  buildMarkerTitle,
  createClusterIcon,
  createDiscoveryRadiusCircle,
  createGuidePolyline,
  createLeafletMap,
  createPoiIcon,
  createSegmentedRoutePolyline,
  createUserIcon,
  getPointCategoryIcon,
} from '@/features/route-map/lib/leaflet-map'
import { routeMapPopupClassName } from '@/features/route-map/lib/popup-skin'
import {
  formatMeters,
  toLngLat,
} from '@/features/route-map/lib/route-geometry'
import { appMapConfig } from '@/shared/config/map'
import { getDiscoveryRadiusForZoom } from '@/shared/lib/discovery-radius'
import { formatDuration, getPointCategoryLabel } from '@/shared/lib/format'
import { buildPlacePlaceholderImage } from '@/shared/lib/placeholder-images'
import '@/features/route-map/ui/map-marker-skin.css'
import '@/features/route-map/ui/leaflet-popup-close.css'
import './RouteBuilderMap.css'

let activePopupAudio: HTMLAudioElement | null = null
let activePopupAudioButton: HTMLButtonElement | null = null
let activePopupAudioUrl: string | null = null

const popupAudioLabels = {
  pause: '⏸ Поставить на паузу',
  play: '🎧 Прослушать аудиогид',
  resume: '▶ Продолжить',
}

function setPopupAudioButtonState(
  button: HTMLButtonElement | null,
  state: keyof typeof popupAudioLabels,
) {
  if (!button) return
  button.textContent = popupAudioLabels[state]
  button.dataset.audioState = state
}

function resetPopupAudio(): void {
  activePopupAudio?.pause()
  setPopupAudioButtonState(activePopupAudioButton, 'play')
  activePopupAudio = null
  activePopupAudioButton = null
  activePopupAudioUrl = null
}

function finishPopupAudio(audio: HTMLAudioElement, button: HTMLButtonElement): void {
  if (activePopupAudio !== audio) return
  setPopupAudioButtonState(button, 'play')
  activePopupAudio = null
  activePopupAudioButton = null
  activePopupAudioUrl = null
}

function togglePopupAudio(audioUrl: string, button: HTMLButtonElement): void {
  if (
    activePopupAudio &&
    activePopupAudioUrl === audioUrl &&
    activePopupAudioButton === button
  ) {
    if (activePopupAudio.paused) {
      const audio = activePopupAudio
      void audio.play()
        .then(() => setPopupAudioButtonState(button, 'pause'))
        .catch(() => finishPopupAudio(audio, button))
      return
    }

    activePopupAudio.pause()
    setPopupAudioButtonState(button, 'resume')
    return
  }

  resetPopupAudio()

  const audio = new Audio(audioUrl)
  activePopupAudio = audio
  activePopupAudioButton = button
  activePopupAudioUrl = audioUrl
  setPopupAudioButtonState(button, 'pause')

  audio.addEventListener('ended', () => {
    finishPopupAudio(audio, button)
  }, { once: true })
  audio.addEventListener('error', () => {
    finishPopupAudio(audio, button)
  }, { once: true })
  void audio.play().catch(() => {
    finishPopupAudio(audio, button)
  })
}

export interface RouteBuilderMapHandle {
  closePopup: () => void
}

interface RouteBuilderMapProps {
  draftPointOrders: ReadonlyMap<string, number>
  initialCenter?: GeoPoint
  isDraftFull: boolean
  isLoading: boolean
  isMapLocked?: boolean
  nearbyPoints: NearbyPoint[]
  onAddPoint: (point: NearbyPoint) => void
  onChangeRadius: (meters: number) => void
  onMapClick?: (coords: GeoPoint) => void
  onPopupClose: () => void
  onRemovePoint: (pointId: string) => void
  onSelectPoint: (id: string) => void
  onShowDetail: (pointId: string) => void
  radiusMeters: number
  recenterKey: number
  routeState: PlannerRouteState
  selectedPointId: string
  userPosition: GeoPoint | null
}

export const RouteBuilderMap = forwardRef<RouteBuilderMapHandle, RouteBuilderMapProps>(function RouteBuilderMap({
  draftPointOrders,
  initialCenter,
  isDraftFull,
  isLoading,
  isMapLocked = false,
  nearbyPoints,
  onAddPoint,
  onChangeRadius,
  onMapClick,
  onPopupClose,
  onRemovePoint,
  onSelectPoint,
  onShowDetail,
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
  // Per-marker icon state cache so we only call setIcon when visible state
  // actually changed (selection or draft order) — avoids needless DOM swaps.
  const markerIconStateRef = useRef(
    new Map<string, { selected: boolean; draftOrder: number | null }>(),
  )
  const clusterLayerRef = useRef<L.LayerGroup | null>(null)
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const clustersRef = useRef<Array<{ ids: string[]; key: string; lat: number; lng: number }>>([])
  const prevSelectedClusterKeyRef = useRef<string | null>(null)
  const prevUserPositionRef = useRef<GeoPoint | null>(null)
  const setClusterVersionRef = useRef<((fn: (n: number) => number) => void) | null>(null)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialCenterRef = useRef(initialCenter ?? userPosition ?? appMapConfig.defaultCenter)
  const [clusterVersion, setClusterVersion] = useState(0)
  setClusterVersionRef.current = setClusterVersion

  useImperativeHandle(ref, () => ({
    closePopup: () => { mapRef.current?.closePopup() },
  }), [])

  useEffect(() => {
    return () => {
      resetPopupAudio()
    }
  }, [])

  const onAddPointRef = useRef(onAddPoint)
  const onRemovePointRef = useRef(onRemovePoint)
  const onSelectPointRef = useRef(onSelectPoint)
  const onPopupCloseRef = useRef(onPopupClose)
  const onShowDetailRef = useRef(onShowDetail)
  const onMapClickRef = useRef(onMapClick)
  const isDraftFullRef = useRef(isDraftFull)
  const onChangeRadiusRef = useRef(onChangeRadius)
  const radiusMetersRef = useRef(radiusMeters)
  const selectedPointIdRef = useRef(selectedPointId)

  useEffect(() => {
    onAddPointRef.current = onAddPoint
    onRemovePointRef.current = onRemovePoint
    onSelectPointRef.current = onSelectPoint
    onPopupCloseRef.current = onPopupClose
    onShowDetailRef.current = onShowDetail
    onMapClickRef.current = onMapClick
    isDraftFullRef.current = isDraftFull
    onChangeRadiusRef.current = onChangeRadius
    radiusMetersRef.current = radiusMeters
  }, [isDraftFull, onAddPoint, onChangeRadius, onMapClick, onPopupClose, onRemovePoint, onSelectPoint, onShowDetail, radiusMeters])

  useEffect(() => {
    selectedPointIdRef.current = selectedPointId
  }, [selectedPointId])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = createLeafletMap(container, initialCenterRef.current, appMapConfig.defaultZoom)
    const routeLayer = L.layerGroup().addTo(map)
    const markersLayer = L.layerGroup().addTo(map)
    const clusterLayer = L.layerGroup().addTo(map)
    const userLayer = L.layerGroup().addTo(map)
    const markerMap = markerRefsMap.current

    mapRef.current = map
    routeLayerRef.current = routeLayer
    markersLayerRef.current = markersLayer
    clusterLayerRef.current = clusterLayer
    userLayerRef.current = userLayer

      map.on('zoomend', () => {
        if (zoomDebounceRef.current !== null) {
          clearTimeout(zoomDebounceRef.current)
        }

        zoomDebounceRef.current = setTimeout(() => {
          onChangeRadiusRef.current(getDiscoveryRadiusForZoom(map.getZoom()))
        }, 200)
        setClusterVersionRef.current?.((v) => v + 1)
      })

      map.on('popupclose', () => {
        resetPopupAudio()
        onPopupCloseRef.current()
      })

      map.on('click', (event: L.LeafletMouseEvent) => {
        onMapClickRef.current?.({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        })
      })

    // When returning to the tab the map container may have an invalid size.
    // invalidateSize() recalculates and stops the map from "trembling".
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        map.invalidateSize({ animate: false, pan: false })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (zoomDebounceRef.current !== null) {
        clearTimeout(zoomDebounceRef.current)
      }

      routeLayerRef.current?.clearLayers()
      markersLayerRef.current?.clearLayers()
      clusterLayerRef.current?.clearLayers()
      userLayerRef.current?.clearLayers()
      routeLayerRef.current = null
      markersLayerRef.current = null
      clusterLayerRef.current = null
      userLayerRef.current = null
      markerMap.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (isMapLocked) {
      map.dragging.disable()
      map.scrollWheelZoom.disable()
      map.doubleClickZoom.disable()
      map.touchZoom.disable()
    } else {
      map.dragging.enable()
      map.scrollWheelZoom.enable()
      map.doubleClickZoom.enable()
      map.touchZoom.enable()
    }
  }, [isMapLocked])

  useEffect(() => {
    if (!userPosition) {
      prevUserPositionRef.current = null
      return
    }
    const map = mapRef.current
    if (!map) return

    const prev = prevUserPositionRef.current
    prevUserPositionRef.current = userPosition

    if (!prev) {
      applyLeafletLocation(map, { center: toLngLat(userPosition), zoom: 15.5, duration: 600 })
      return
    }

    // Only re-center if position jumped more than 50m — manual set vs GPS micro-drift.
    const dlat = (userPosition.lat - prev.lat) * 111320
    const dlng = (userPosition.lng - prev.lng) * 111320 * Math.cos(userPosition.lat * (Math.PI / 180))
    if (dlat * dlat + dlng * dlng > 50 * 50) {
      applyLeafletLocation(map, { center: toLngLat(userPosition), zoom: 15.5, duration: 600 })
    }
  }, [userPosition])

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

    const duration = 600
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

  // Markers layer — DIFFED instead of clear+rebuild. With 100-200 points the
  // old clearLayers + recreate flow was the worst perf hot-spot on mobile:
  // every nearbyPoints update (radius/zoom refetch) destroyed all 100+ DOM
  // nodes and rebuilt them, causing visible jank. Now we only add new ids,
  // remove gone ids, and move existing markers' lat/lng + icon if changed.
  useEffect(() => {
    const layer = markersLayerRef.current
    if (!layer) return

    const newIds = new Set(nearbyPoints.map((p) => p.id))

    // Remove markers no longer present
    markerRefsMap.current.forEach((marker, id) => {
      if (!newIds.has(id)) {
        layer.removeLayer(marker)
        markerRefsMap.current.delete(id)
        markerIconStateRef.current.delete(id)
      }
    })

    nearbyPoints.forEach((point) => {
      const draftOrder = draftPointOrders.get(point.id) ?? null
      const isSelected = point.id === selectedPointIdRef.current

      const existing = markerRefsMap.current.get(point.id)
      if (existing) {
        // Sync position when point coords shifted (mock backend recomputes
        // coords relative to the user's center on each fetch).
        const currentLatLng = existing.getLatLng()
        if (
          currentLatLng.lat !== point.coordinates.lat ||
          currentLatLng.lng !== point.coordinates.lng
        ) {
          existing.setLatLng([point.coordinates.lat, point.coordinates.lng])
        }
        // Only re-set the icon when its visible state changed.
        const prev = markerIconStateRef.current.get(point.id)
        if (!prev || prev.selected !== isSelected || prev.draftOrder !== draftOrder) {
          existing.setIcon(createPoiIcon(point, isSelected, draftOrder))
          markerIconStateRef.current.set(point.id, { selected: isSelected, draftOrder })
          if (containerRef.current?.classList.contains('dm--clustering')) {
            const isInMultiCluster = clustersRef.current.some(
              (c) => c.ids.length > 1 && c.ids.includes(point.id),
            )
            if (!isInMultiCluster) {
              const el = existing.getElement()
              if (el) el.classList.add('dm--visible-in-cluster')
            }
          }
        }
        return
      }

      const marker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, isSelected, draftOrder),
        title: buildMarkerTitle(point),
      })

      marker.on('click', () => {
        onSelectPointRef.current(point.id)
        mapRef.current?.closePopup()

        const isInDraft = (draftPointOrders.get(point.id) ?? null) !== null
        const closePopup = () => mapRef.current?.closePopup()

        const popupEl = buildPopupEl(
          point,
          isInDraft,
          isDraftFullRef.current,
          () => { onAddPointRef.current(point); closePopup() },
          () => { onRemovePointRef.current(point.id); closePopup() },
          () => { closePopup(); onShowDetailRef.current(point.id) },
        )

        L.popup({
          className: `${routeMapPopupClassName} rbm-leaflet-popup`,
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
      markerIconStateRef.current.set(point.id, { selected: isSelected, draftOrder })
    })
  }, [draftPointOrders, nearbyPoints])

  // Marker clustering — diff-based: reuse existing L.Marker instances for
  // unchanged clusters so the cluster-pop animation only fires when clusters
  // genuinely form/merge, not on every selection change or points refresh.
  // selectedPointId is intentionally NOT a dep — handled by the separate
  // selection-in-cluster effect below.
  useEffect(() => {
    const map = mapRef.current
    const clusterLayer = clusterLayerRef.current
    const container = containerRef.current
    if (!map || !clusterLayer) return

    const CLUSTER_RADIUS_PX = 40
    const visited = new Set<string>()
    const rawClusters: Array<{ ids: string[]; lat: number; lng: number }> = []

    for (const point of nearbyPoints) {
      if (visited.has(point.id)) continue
      visited.add(point.id)

      const centerPx = map.latLngToContainerPoint([point.coordinates.lat, point.coordinates.lng])
      const ids = [point.id]
      let sumLat = point.coordinates.lat
      let sumLng = point.coordinates.lng

      for (const other of nearbyPoints) {
        if (visited.has(other.id)) continue
        const otherPx = map.latLngToContainerPoint([other.coordinates.lat, other.coordinates.lng])
        const dx = centerPx.x - otherPx.x
        const dy = centerPx.y - otherPx.y
        if (dx * dx + dy * dy <= CLUSTER_RADIUS_PX * CLUSTER_RADIUS_PX) {
          visited.add(other.id)
          ids.push(other.id)
          sumLat += other.coordinates.lat
          sumLng += other.coordinates.lng
        }
      }

      rawClusters.push({ ids, lat: sumLat / ids.length, lng: sumLng / ids.length })
    }

    const hasClusters = rawClusters.some((c) => c.ids.length > 1)

    if (!hasClusters) {
      container.classList.remove('dm--clustering')
      markerRefsMap.current.forEach((marker) => {
        const el = marker.getElement()
        if (el) el.classList.remove('dm--visible-in-cluster')
      })
      for (const marker of clusterMarkersRef.current.values()) {
        clusterLayer.removeLayer(marker)
      }
      clusterMarkersRef.current.clear()
      clustersRef.current = []
      prevSelectedClusterKeyRef.current = null
      return
    }

    container.classList.add('dm--clustering')

    markerRefsMap.current.forEach((marker) => {
      const el = marker.getElement()
      if (el) el.classList.remove('dm--visible-in-cluster')
    })

    const nextClusterMap = new Map<string, L.Marker>()
    const nextClusters: Array<{ ids: string[]; key: string; lat: number; lng: number }> = []

    for (const cluster of rawClusters) {
      const key = [...cluster.ids].sort().join(':')
      nextClusters.push({ ...cluster, key })

      if (cluster.ids.length === 1) {
        const marker = markerRefsMap.current.get(cluster.ids[0])
        if (marker) {
          const el = marker.getElement()
          if (el) el.classList.add('dm--visible-in-cluster')
        }
      } else {
        const existing = clusterMarkersRef.current.get(key)
        if (existing) {
          nextClusterMap.set(key, existing)
        } else {
          const newMarker = L.marker([cluster.lat, cluster.lng], {
            icon: createClusterIcon(cluster.ids.length),
            zIndexOffset: 500,
          })
            .on('click', () => {
              const bounds = L.latLngBounds(
                cluster.ids.map((id) => {
                  const p = nearbyPoints.find((pt) => pt.id === id)!
                  return [p.coordinates.lat, p.coordinates.lng] as [number, number]
                }),
              )
              map.flyToBounds(bounds, { padding: [60, 60], animate: true })
            })
            .addTo(clusterLayer)
          nextClusterMap.set(key, newMarker)
        }
      }
    }

    for (const [key, marker] of clusterMarkersRef.current) {
      if (!nextClusterMap.has(key)) {
        clusterLayer.removeLayer(marker)
        if (prevSelectedClusterKeyRef.current === key) {
          prevSelectedClusterKeyRef.current = null
        }
      }
    }

    clusterMarkersRef.current = nextClusterMap
    clustersRef.current = nextClusters
  }, [clusterVersion, nearbyPoints])

  // Selection-in-cluster: when the selected point is inside a multi-point cluster,
  // replace the cluster count with its category icon via direct DOM update.
  // No setIcon() call → no cluster-pop animation retrigger.
  useEffect(() => {
    const clusters = clustersRef.current
    const clusterMarkers = clusterMarkersRef.current

    const prevKey = prevSelectedClusterKeyRef.current
    if (prevKey) {
      const prevMarker = clusterMarkers.get(prevKey)
      if (prevMarker) {
        const prevCluster = clusters.find((c) => c.key === prevKey)
        if (prevCluster) {
          const el = prevMarker.getElement()
          const inner = el?.querySelector('.cluster-marker')
          if (inner) inner.textContent = String(prevCluster.ids.length)
        }
      }
      prevSelectedClusterKeyRef.current = null
    }

    if (!selectedPointId) return

    const selectedCluster = clusters.find(
      (c) => c.ids.length > 1 && c.ids.includes(selectedPointId),
    )
    if (!selectedCluster) return

    const marker = clusterMarkers.get(selectedCluster.key)
    if (!marker) return

    const selectedPoint = nearbyPoints.find((p) => p.id === selectedPointId)
    if (!selectedPoint) return

    const el = marker.getElement()
    const inner = el?.querySelector('.cluster-marker')
    if (inner) {
      inner.innerHTML = getPointCategoryIcon(selectedPoint.category)
      prevSelectedClusterKeyRef.current = selectedCluster.key
    }
  }, [selectedPointId, clusterVersion, nearbyPoints])

  // Update marker icons when selection changes (without touching nearbyPoints).
  useEffect(() => {
    nearbyPoints.forEach((point) => {
      const marker = markerRefsMap.current.get(point.id)
      if (!marker) return
      const draftOrder = draftPointOrders.get(point.id) ?? null
      const isSelected = point.id === selectedPointId
      const prev = markerIconStateRef.current.get(point.id)
      if (prev && prev.selected === isSelected && prev.draftOrder === draftOrder) return
      marker.setIcon(createPoiIcon(point, isSelected, draftOrder))
      markerIconStateRef.current.set(point.id, { selected: isSelected, draftOrder })
      if (containerRef.current?.classList.contains('dm--clustering')) {
        const isInMultiCluster = clustersRef.current.some(
          (c) => c.ids.length > 1 && c.ids.includes(point.id),
        )
        if (!isInMultiCluster) {
          const el = marker.getElement()
          if (el) el.classList.add('dm--visible-in-cluster')
        }
      }
    })
  }, [draftPointOrders, nearbyPoints, selectedPointId])

  useEffect(() => {
    if (!recenterKey || !userPosition || !mapRef.current) return

    const container = containerRef.current
    if (container) container.style.pointerEvents = 'none'

    applyLeafletLocation(mapRef.current, {
      center: toLngLat(userPosition),
      duration: 700,
      zoom: 15.5,
    })

    const timeoutId = setTimeout(() => {
      if (container) container.style.pointerEvents = ''
    }, 750)

    return () => clearTimeout(timeoutId)
  }, [recenterKey, userPosition])

  return (
    <div className={`rbm${isMapLocked ? ' rbm--locked' : ''}`}>
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
  onShowDetail: () => void,
): HTMLElement {
  const placeholder = buildPlacePlaceholderImage(point.category)
  const detailDataPromise = !point.imageUrl || !point.audioGuideUrl
    ? fetchPointDetailData(point.id)
    : null

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

  // Search results carry no photo — backfill the real uploaded image from
  // /points/{id} (cached) once the popup is shown.
  if (!point.imageUrl) {
    void detailDataPromise?.then((data) => {
      if (data?.imageUrl) image.src = data.imageUrl
    })
  }
  root.appendChild(cover)

  // Body
  const body = document.createElement('div')
  body.className = 'rbm-popup__body'

  // Top row: category badge + meta chips on the same line
  const topRow = document.createElement('div')
  topRow.className = 'rbm-popup__toprow'

  const category = document.createElement('span')
  category.className = 'rbm-popup__cat'
  category.textContent = getPointCategoryLabel(point)
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

  const detailBtn = document.createElement('button')
  detailBtn.type = 'button'
  detailBtn.className = 'rbm-popup__btn rbm-popup__btn--detail'
  detailBtn.textContent = 'Подробнее'
  detailBtn.addEventListener('click', onShowDetail)
  btnGroup.appendChild(detailBtn)

  const audioBtn = document.createElement('button')
  audioBtn.type = 'button'
  audioBtn.className = `rbm-popup__btn rbm-popup__btn--audio${point.audioGuideUrl ? '' : ' rbm-popup__btn--audio-disabled'}`
  audioBtn.disabled = !point.audioGuideUrl
  const attachAudioGuide = (audioUrl: string) => {
    if (audioBtn.dataset.audioUrl === audioUrl) return
    audioBtn.dataset.audioUrl = audioUrl
    audioBtn.className = 'rbm-popup__btn rbm-popup__btn--audio'
    audioBtn.disabled = false
    setPopupAudioButtonState(audioBtn, 'play')
    audioBtn.onclick = () => togglePopupAudio(audioUrl, audioBtn)
  }
  setPopupAudioButtonState(audioBtn, 'play')
  if (point.audioGuideUrl) {
    attachAudioGuide(point.audioGuideUrl)
  } else {
    void detailDataPromise?.then((data) => {
      if (data?.audioUrl) attachAudioGuide(data.audioUrl)
    })
  }
  btnGroup.appendChild(audioBtn)

  body.appendChild(btnGroup)
  root.appendChild(body)

  return root
}
