import { useEffect, useMemo, useRef, useState } from 'react'
import * as L from 'leaflet'
import { Link } from 'react-router-dom'

import type {
  GeoPoint,
  NearbyPoint,
  PointCategory,
  RouteStop,
} from '@/entities/excursion/model/types'
import {
  buildOsmWalkingRouteGeometryFromPoints,
  getCachedWalkingRouteBuildResult,
  getBoundsFromGeometry,
  getBoundsFromPoints,
  toLngLat,
  type LngLatBounds,
  type RouteGeometry,
} from '@/features/route-map/lib/route-geometry'
import {
  applyLeafletLocation,
  buildMarkerTitle,
  createDiscoveryRadiusCircle,
  createGuidePolyline,
  createLeafletMap,
  createPoiIcon,
  createSegmentedRoutePolyline,
  createUserIcon,
  getPointCategoryIcon,
} from '@/features/route-map/lib/leaflet-map'
import { appMapConfig } from '@/shared/config/map'
import { appRoutes } from '@/shared/config/routes'
import { buildGoogleMapsUrl } from '@/shared/lib/maps'
import './DiscoveryMap.css'
import '@/features/route-map/ui/map-marker-skin.css'

export interface DiscoveryCategoryOption {
  id: PointCategory | 'all'
  label: string
}

export interface DiscoveryRadiusOption {
  label: string
  value: number
}

interface DiscoveryMapProps {
  activeCategory: PointCategory | 'all'
  canSaveDraftRoute?: boolean
  categoryOptions: DiscoveryCategoryOption[]
  draftStops?: RouteStop[]
  draftRouteNoticeKey?: number
  draftRouteNotice?: string | null
  draftRouteNoticeTone?: 'success' | 'warning'
  embedded?: boolean
  fullscreen?: boolean
  emptyMessage: string
  fixedRouteStops?: RouteStop[]
  geolocationError: string | null
  isLoading: boolean
  loadError: string | null
  nearbyPoints: NearbyPoint[]
  onAddPointToDraft?: (point: NearbyPoint) => void
  onBuildRoute: (pointId: string) => void
  onChangeRadius: (radiusMeters: number) => void
  onClearDraftRoute?: () => void
  onLocateUser: () => void
  onSaveDraftRoute?: () => void
  onSearchQueryChange?: (value: string) => void
  onSelectCategory: (category: PointCategory | 'all') => void
  onSelectNextPoint: () => void
  onSelectPoint: (pointId: string) => void
  onSelectPreviousPoint: () => void
  radiusMeters: number
  radiusOptions?: DiscoveryRadiusOption[]
  recenterTrigger?: number
  routeTargetId: string | null
  searchQuery?: string
  selectedPointId: string
  showDirectRouteInPopup?: boolean
  showPopupRouteActions?: boolean
  userPosition: GeoPoint | null
}

const mapPadding: [number, number, number, number] = [56, 48, 48, 48]
const selectedPointZoom = 16
const locateZoom = 15.5

type SelectionSource = 'marker' | 'navigation' | 'route'

function preservePageScroll() {
  const currentScrollY = window.scrollY

  window.requestAnimationFrame(() => {
    if (window.scrollY !== currentScrollY) {
      window.scrollTo({
        top: currentScrollY,
        behavior: 'auto',
      })
    }
  })
}

export function DiscoveryMap({
  activeCategory,
  canSaveDraftRoute = true,
  categoryOptions,
  draftStops = [],
  draftRouteNoticeKey = 0,
  draftRouteNotice = null,
  draftRouteNoticeTone = 'success',
  embedded = false,
  fullscreen = false,
  emptyMessage,
  fixedRouteStops = [],
  geolocationError,
  isLoading,
  loadError,
  nearbyPoints,
  onAddPointToDraft,
  onBuildRoute,
  onChangeRadius,
  onClearDraftRoute,
  onLocateUser,
  onSaveDraftRoute,
  onSearchQueryChange,
  onSelectCategory,
  onSelectNextPoint,
  onSelectPoint,
  onSelectPreviousPoint,
  radiusMeters,
  radiusOptions = [],
  recenterTrigger = 0,
  routeTargetId,
  searchQuery = '',
  selectedPointId,
  showDirectRouteInPopup = false,
  showPopupRouteActions = true,
  userPosition,
}: DiscoveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const radiusCircleRef = useRef<L.Circle | null>(null)
  const markerRefs = useRef(new Map<string, L.Marker>())
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const initialCenterRef = useRef(userPosition ?? appMapConfig.defaultCenter)
  const skipSelectedFocusRef = useRef(true)
  const hasAutoFittedRef = useRef(false)
  const selectionSourceRef = useRef<SelectionSource | null>(null)
  const lastNonEmptySelectedIdRef = useRef<string>('')
  // Tracks the route signature last fitted to — prevents re-fitting on every
  // nearbyPoints refresh while the same route is active.
  const lastFittedRouteRef = useRef<string>('')
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRadiusRef = useRef(onChangeRadius)
  const selectedPointIdRef = useRef(selectedPointId)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<'category' | 'radius' | null>(null)
  const [guideRoute, setGuideRoute] = useState<{
    geometry: RouteGeometry | null
    signature: string
  }>({
    geometry: null,
    signature: '',
  })
  const [draftRoute, setDraftRoute] = useState<{
    geometry: RouteGeometry | null
    signature: string
  }>({
    geometry: null,
    signature: '',
  })

  const guidedPoint =
    nearbyPoints.find((point) => point.id === routeTargetId) ?? null
  const pointsBounds = useMemo(() => {
    const points = [
      ...nearbyPoints.map((point) => point.coordinates),
      ...(userPosition ? [userPosition] : []),
    ]

    return getBoundsFromPoints(points)
  }, [nearbyPoints, userPosition])
  const activeCategoryOption =
    categoryOptions.find((option) => option.id === activeCategory) ?? categoryOptions[0]
  const activeRadiusLabel =
    radiusOptions.find((option) => option.value === radiusMeters)?.label ?? `${radiusMeters / 1000} км`
  const canNavigatePoints = nearbyPoints.length > 1
  const visibleDraftStops = draftStops.length > 0 ? draftStops : fixedRouteStops
  const visibleDraftPointIds = useMemo(
    () => new Set(visibleDraftStops.map(getSourcePointId)),
    [visibleDraftStops],
  )
  const visibleDraftOrderMap = useMemo(
    () =>
      new Map(
        visibleDraftStops.map((stop, index) => [getSourcePointId(stop), index + 1]),
      ),
    [visibleDraftStops],
  )
  const visibleDraftStopsSignature = useMemo(
    () => visibleDraftStops.map((stop) => stop.id).join(','),
    [visibleDraftStops],
  )
  const draftSignature = useMemo(() => {
    const points = [
      ...(userPosition ? [userPosition] : []),
      ...visibleDraftStops.map((stop) => stop.coordinates),
    ]

    return points
      .map((point) => `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`)
      .join('|')
  }, [userPosition, visibleDraftStops])
  const guideSignature =
    userPosition && guidedPoint
      ? `${guidedPoint.id}:${userPosition.lat.toFixed(5)}:${userPosition.lng.toFixed(5)}`
      : ''

  // Keep radius callback ref current so zoomend listener always calls latest version
  onChangeRadiusRef.current = onChangeRadius
  selectedPointIdRef.current = selectedPointId
  const guideGeometry =
    guideRoute.signature === guideSignature && guideRoute.geometry
      ? guideRoute.geometry
      : null
  const draftGeometry =
    draftRoute.signature === draftSignature && draftRoute.geometry
      ? draftRoute.geometry
      : null
  const guideBounds = useMemo(
    () => (guideGeometry ? getBoundsFromGeometry(guideGeometry) : null),
    [guideGeometry],
  )
  const draftBounds = useMemo(
    () => (draftGeometry ? getBoundsFromGeometry(draftGeometry) : null),
    [draftGeometry],
  )

  useEffect(() => {
    const container = mapContainerRef.current
    const markers = markerRefs.current

    if (!container || mapRef.current) {
      return
    }

    try {
      const map = createLeafletMap(
        container,
        initialCenterRef.current,
        appMapConfig.defaultZoom,
      )
      // routeLayer (circle + polylines) rendered below markers layer
      const routeLayer = L.layerGroup().addTo(map)
      const overlay = L.layerGroup().addTo(map)

      mapRef.current = map
      routeLayerRef.current = routeLayer
      overlayRef.current = overlay

      // Dynamic radius: debounced to prevent rapid-fire API calls on every scroll tick
      map.on('zoomend', () => {
        if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
        zoomDebounceRef.current = setTimeout(() => {
          const bounds = map.getBounds()
          const center = bounds.getCenter()
          const east = L.latLng(center.lat, bounds.getEast())
          const halfWidthMeters = center.distanceTo(east)
          const clamped = Math.round(Math.min(5000, Math.max(1000, halfWidthMeters)))
          onChangeRadiusRef.current(clamped)
        }, 350)
      })

      queueMicrotask(() => setMapLoadError(null))
    } catch (error) {
      console.error(error)
      queueMicrotask(() => setMapLoadError('Не удалось открыть карту.'))
    }

    return () => {
      if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
      routeLayerRef.current?.clearLayers()
      routeLayerRef.current = null
      overlayRef.current?.clearLayers()
      overlayRef.current = null
      markers.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadGuideRoute() {
      if (!userPosition || !guidedPoint) {
        queueMicrotask(() => {
          setGuideRoute({ geometry: null, signature: '' })
        })
        return
      }

      const cachedResult = getCachedWalkingRouteBuildResult([
        userPosition,
        guidedPoint.coordinates,
      ])

      if (cachedResult?.geometry) {
        setGuideRoute({
          geometry: cachedResult.geometry,
          signature: guideSignature,
        })
      }

      try {
        const result = await buildOsmWalkingRouteGeometryFromPoints(
          [userPosition, guidedPoint.coordinates],
          controller.signal,
        )

        if (controller.signal.aborted) {
          return
        }

        setGuideRoute({
          geometry: result.status === 'fallback' ? null : result.geometry,
          signature: guideSignature,
        })
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error)
        }
      }
    }

    void loadGuideRoute()

    return () => {
      controller.abort()
    }
  }, [guideSignature, guidedPoint, userPosition])

  useEffect(() => {
    const controller = new AbortController()

    async function loadDraftRoute() {
      const points = [
        ...(userPosition ? [userPosition] : []),
        ...visibleDraftStops.map((stop) => stop.coordinates),
      ]

      if (points.length < 2) {
        queueMicrotask(() => {
          setDraftRoute({ geometry: null, signature: '' })
        })
        return
      }

      const cachedResult = getCachedWalkingRouteBuildResult(points)

      if (cachedResult?.geometry) {
        setDraftRoute({
          geometry: cachedResult.geometry,
          signature: draftSignature,
        })
      }

      try {
        const result = await buildOsmWalkingRouteGeometryFromPoints(
          points,
          controller.signal,
        )

        if (controller.signal.aborted) {
          return
        }

        setDraftRoute({
          geometry: result.status === 'fallback' ? null : result.geometry,
          signature: draftSignature,
        })
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error)
        }
      }
    }

    void loadDraftRoute()

    return () => {
      controller.abort()
    }
  }, [draftSignature, userPosition, visibleDraftStops])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    // Only fly to route bounds when the route itself changes — not on every
    // nearbyPoints refresh (which happens on zoom/radius changes).
    const routeSignature = `${routeTargetId ?? ''}:${visibleDraftStopsSignature}`

    if (draftBounds && visibleDraftStops.length) {
      if (routeSignature !== lastFittedRouteRef.current) {
        lastFittedRouteRef.current = routeSignature
        applyLeafletLocation(map, {
          bounds: draftBounds,
          padding: mapPadding,
          duration: 700,
          easing: 'ease-in-out',
        })
      }
      return
    }

    if (guideBounds && routeTargetId) {
      if (routeSignature !== lastFittedRouteRef.current) {
        lastFittedRouteRef.current = routeSignature
        applyLeafletLocation(map, {
          bounds: guideBounds,
          padding: mapPadding,
          duration: 700,
          easing: 'ease-in-out',
        })
      }
      return
    }

    // Route was cleared — reset so next route activation flies correctly
    if (lastFittedRouteRef.current) lastFittedRouteRef.current = ''

    // Only auto-fit once on initial load — never re-center when user is freely panning/zooming
    if (hasAutoFittedRef.current) return

    if (!nearbyPoints.length && userPosition) {
      hasAutoFittedRef.current = true
      applyLeafletLocation(map, {
        center: toLngLat(userPosition),
        zoom: locateZoom,
        duration: 600,
        easing: 'ease-in-out',
      })
      return
    }

    if (!nearbyPoints.length) return

    hasAutoFittedRef.current = true
    skipSelectedFocusRef.current = true
    applyLeafletLocation(map, {
      bounds: pointsBounds,
      padding: mapPadding,
      duration: 850,
      easing: 'ease-in-out',
    })
  }, [draftBounds, guideBounds, nearbyPoints.length, pointsBounds, routeTargetId, userPosition, visibleDraftStops.length, visibleDraftStopsSignature])

  // Route layer: circle + polylines + user marker — rebuilt only when geometry/position changes.
  // Intentionally excludes radiusMeters: the animation effect handles smooth radius updates.
  useEffect(() => {
    const routeLayer = routeLayerRef.current
    if (!routeLayer) return

    routeLayer.clearLayers()

    if (userPosition) {
      const circle = createDiscoveryRadiusCircle(userPosition, radiusMeters)
      circle.addTo(routeLayer)
      radiusCircleRef.current = circle
    } else {
      radiusCircleRef.current = null
    }

    if (guideGeometry && !draftGeometry) {
      createGuidePolyline(guideGeometry).addTo(routeLayer)
    }

    if (draftGeometry) {
      createSegmentedRoutePolyline(draftGeometry).addTo(routeLayer)
    }

    if (userPosition) {
      L.marker([userPosition.lat, userPosition.lng], {
        icon: createUserIcon(),
        title: 'Ваше местоположение',
      }).addTo(routeLayer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftGeometry, guideGeometry, userPosition])

  // Markers layer: POI markers only — rebuilt when the point set or selection changes.
  // Kept separate from the route layer so zoom/radius changes don't thrash polylines.
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    overlay.clearLayers()
    markerRefs.current.clear()

    nearbyPoints.forEach((point) => {
      const googleMapsUrl = buildGoogleMapsUrl(point.coordinates, userPosition)
      const isInDraft = visibleDraftPointIds.has(point.id)
      const draftOrder = visibleDraftOrderMap.get(point.id) ?? null
      const marker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, point.id === selectedPointIdRef.current, draftOrder),
        title: buildMarkerTitle(point),
      })
        .bindPopup(
          buildPopupContent({
            googleMapsUrl,
            showDirectRoute: showDirectRouteInPopup || showPopupRouteActions,
            showRouteActions: showPopupRouteActions,
            isRouteTarget: point.id === routeTargetId,
            onBuildRoute: () => {
              preservePageScroll()
              selectionSourceRef.current = 'route'
              onSelectPoint(point.id)
              onBuildRoute(point.id)
            },
            onCancelRoute: onClearDraftRoute
              ? () => {
                  preservePageScroll()
                  onClearDraftRoute()
                }
              : undefined,
            onAddPointToDraft: onAddPointToDraft
              ? () => {
                  preservePageScroll()
                  selectionSourceRef.current = 'route'
                  onSelectPoint(point.id)
                  onBuildRoute(point.id)
                  onAddPointToDraft(point)
                }
              : undefined,
            canAddToDraft: Boolean(onAddPointToDraft && !isInDraft && draftStops.length < 6),
            isInDraft,
            point,
          }),
          {
            autoPan: true,
            keepInView: true,
          },
        )
        .on('click', () => {
          preservePageScroll()
          selectionSourceRef.current = 'marker'
          onSelectPoint(point.id)
          marker.openPopup()
        })

      marker.addTo(overlay)
      markerRefs.current.set(point.id, marker)
    })
  }, [draftStops.length, nearbyPoints, onAddPointToDraft, onBuildRoute, onClearDraftRoute, onSelectPoint, routeTargetId, showDirectRouteInPopup, showPopupRouteActions, userPosition, visibleDraftOrderMap, visibleDraftPointIds])

  // Animate radius circle smoothly when radiusMeters changes (no full redraw)
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
    const t0 = performance.now()
    let raf: number
    const circleLayer = circle
    function step(now: number) {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      circleLayer.setRadius(start + (end - start) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [radiusMeters])

  useEffect(() => {
    nearbyPoints.forEach((point) => {
      const marker = markerRefs.current.get(point.id)

      if (!marker) {
        return
      }

      marker.setIcon(
        createPoiIcon(
          point,
          point.id === selectedPointId,
          visibleDraftOrderMap.get(point.id) ?? null,
        ),
      )
    })
  }, [nearbyPoints, selectedPointId, visibleDraftOrderMap])

  useEffect(() => {
    if (!selectedPointId) return

    // If the same point is re-emerging after temporarily leaving nearbyPoints
    // (radius shrunk then grew), don't snap the camera back
    const comingBack = selectedPointId === lastNonEmptySelectedIdRef.current
    lastNonEmptySelectedIdRef.current = selectedPointId
    if (comingBack) return

    const map = mapRef.current
    const marker = markerRefs.current.get(selectedPointId)
    // Look up point coordinates from the live nearbyPoints array via the ref
    const point = nearbyPoints.find((p) => p.id === selectedPointId)

    if (!map || !marker || !point) return

    if (skipSelectedFocusRef.current) {
      skipSelectedFocusRef.current = false
      return
    }

    const source = selectionSourceRef.current
    selectionSourceRef.current = null

    if (source === 'marker') {
      marker.openPopup()
      return
    }

    applyLeafletLocation(map, {
      center: toLngLat(point.coordinates),
      zoom: selectedPointZoom,
      duration: 600,
      easing: 'ease-in-out',
    })

    const popupTimeout = window.setTimeout(() => marker.openPopup(), 240)
    return () => window.clearTimeout(popupTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPointId])

  useEffect(() => {
    if (!recenterTrigger) return
    const map = mapRef.current
    if (!userPosition || !map) return
    const { lat, lng } = userPosition
    // Fixed 1 km view regardless of selected radius
    const viewKm = 1.0
    const latDelta = (viewKm * 1000) / 111320
    const lngDelta = (viewKm * 1000) / (111320 * Math.cos((lat * Math.PI) / 180))
    const bounds: LngLatBounds = [
      [lng - lngDelta, lat - latDelta],
      [lng + lngDelta, lat + latDelta],
    ]
    applyLeafletLocation(map, {
      bounds,
      padding: [56, 20, 64, 20],
      duration: 700,
      easing: 'ease-in-out',
    })
  }, [recenterTrigger, userPosition])

  function focusOnUser() {
    const map = mapRef.current

    if (!userPosition || !map) {
      onLocateUser()
      return
    }

    applyLeafletLocation(map, {
      center: toLngLat(userPosition),
      zoom: locateZoom,
      duration: 700,
      easing: 'ease-in-out',
    })
  }

  function toggleMenu(menu: 'category' | 'radius') {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function handleCategorySelect(category: PointCategory | 'all') {
    onSelectCategory(category)
    setOpenMenu(null)
  }

  function handleRadiusSelect(nextRadius: number) {
    onChangeRadius(nextRadius)
    setOpenMenu(null)
  }

  function handleSelectPreviousPoint() {
    selectionSourceRef.current = 'navigation'
    onSelectPreviousPoint()
  }

  function handleSelectNextPoint() {
    selectionSourceRef.current = 'navigation'
    onSelectNextPoint()
  }

  return (
    <section className={`discovery-map discovery-map--wide${embedded ? ' discovery-map--embedded' : ''}${fullscreen ? ' discovery-map--fullscreen' : ''}`}>
      <div className="discovery-map__toolbar" ref={controlsRef} style={fullscreen ? { display: 'none' } : undefined}>
        <div className="discovery-map__toolbar-side discovery-map__toolbar-side--start">
          <div className={`discovery-map__dropdown${openMenu === 'category' ? ' discovery-map__dropdown--open' : ''}`}>
            <button
              aria-expanded={openMenu === 'category'}
              className="discovery-map__dropdown-trigger"
              onClick={() => toggleMenu('category')}
              type="button"
            >
              <span aria-hidden="true" className="discovery-map__dropdown-icon">{getPointCategoryIcon(activeCategoryOption.id)}</span>
              <span className="discovery-map__dropdown-value">{activeCategoryOption.label}</span>
              <span aria-hidden="true" className="discovery-map__dropdown-chevron">▾</span>
            </button>

            <div
              aria-hidden={openMenu !== 'category'}
              className={`discovery-map__dropdown-menu${openMenu === 'category' ? ' discovery-map__dropdown-menu--open' : ''}`}
              role="menu"
            >
              {categoryOptions.map((category) => (
                <button
                  className={`discovery-map__dropdown-option${activeCategory === category.id ? ' discovery-map__dropdown-option--active' : ''}`}
                  key={category.id}
                  onClick={() => handleCategorySelect(category.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="discovery-map__dropdown-option-icon">{getPointCategoryIcon(category.id)}</span>
                  <span>{category.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="discovery-map__toolbar-title-wrap">
          <label className="discovery-map__search" htmlFor="nearby-search">
            <span aria-hidden="true" className="discovery-map__search-icon">⌕</span>
            <input
              autoComplete="off"
              className="discovery-map__search-input"
              id="nearby-search"
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              placeholder="Поиск мест в радиусе"
              type="search"
              value={searchQuery}
            />
          </label>
        </div>

        <div className="discovery-map__toolbar-side discovery-map__toolbar-side--end">
          <div className={`discovery-map__dropdown${openMenu === 'radius' ? ' discovery-map__dropdown--open' : ''}`}>
            <button
              aria-expanded={openMenu === 'radius'}
              className="discovery-map__dropdown-trigger"
              onClick={() => toggleMenu('radius')}
              type="button"
            >
              <span className="discovery-map__dropdown-value">{activeRadiusLabel}</span>
              <span aria-hidden="true" className="discovery-map__dropdown-chevron">▾</span>
            </button>

            <div
              aria-hidden={openMenu !== 'radius'}
              className={`discovery-map__dropdown-menu discovery-map__dropdown-menu--right${openMenu === 'radius' ? ' discovery-map__dropdown-menu--open' : ''}`}
              role="menu"
            >
              {radiusOptions.map((option) => (
                <button
                  className={`discovery-map__dropdown-option${radiusMeters === option.value ? ' discovery-map__dropdown-option--active' : ''}`}
                  key={option.value}
                  onClick={() => handleRadiusSelect(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="discovery-map__canvas discovery-map__canvas--wide">
        <div className="discovery-map__root" ref={mapContainerRef}></div>
        {isLoading ? (
          <div className="discovery-map__overlay-note">Ищем места рядом...</div>
        ) : null}
        {mapLoadError || loadError ? (
          <div className="discovery-map__overlay-note discovery-map__overlay-note--error">
            {mapLoadError ?? loadError}
          </div>
        ) : null}
        {!isLoading && !mapLoadError && !loadError && nearbyPoints.length === 0 ? (
          <div className="discovery-map__overlay-note">{emptyMessage}</div>
        ) : null}
        {draftRouteNotice ? (
          <div
            className={`discovery-map__toast discovery-map__toast--${draftRouteNoticeTone}`}
            key={draftRouteNoticeKey}
            role="status"
          >
            {draftRouteNotice}
          </div>
        ) : null}
        {visibleDraftStops.length > 0 ? (
          <div className="discovery-map__draft-actions">
            <button
              className="discovery-map__draft-button"
              onClick={onClearDraftRoute}
              type="button"
            >
              Сбросить
            </button>
            {draftStops.length > 1 ? (
              canSaveDraftRoute ? (
                <button
                  className="discovery-map__draft-button discovery-map__draft-button--primary"
                  onClick={onSaveDraftRoute}
                  type="button"
                >
                  Сохранить
                </button>
              ) : (
                <Link
                  className="discovery-map__draft-button discovery-map__draft-button--primary discovery-map__draft-button--link"
                  to={appRoutes.signIn}
                >
                  Сохранить
                </Link>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="discovery-map__navigation" style={fullscreen ? { display: 'none' } : undefined}>
        <div className="discovery-map__navigation-side discovery-map__navigation-side--start">
          <button
            className="discovery-map__arrow-button"
            disabled={!canNavigatePoints}
            onClick={handleSelectPreviousPoint}
            type="button"
          >
            <span aria-hidden="true">←</span>
          </button>
        </div>

        <div className="discovery-map__navigation-center">
          <button className="button button--primary discovery-map__locate-button" onClick={focusOnUser} type="button">
            Найти себя
          </button>
        </div>

        <div className="discovery-map__navigation-side discovery-map__navigation-side--end">
          <button
            className="discovery-map__arrow-button"
            disabled={!canNavigatePoints}
            onClick={handleSelectNextPoint}
            type="button"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {geolocationError ? <p className="map-card__note">{geolocationError}</p> : null}
    </section>
  )
}

function buildPopupContent({
  point,
  googleMapsUrl,
  canAddToDraft,
  isInDraft,
  isRouteTarget,
  onAddPointToDraft,
  onBuildRoute,
  onCancelRoute,
  showDirectRoute,
  showRouteActions,
}: {
  canAddToDraft: boolean
  isInDraft: boolean
  isRouteTarget: boolean
  onAddPointToDraft?: () => void
  point: NearbyPoint
  googleMapsUrl: string
  onBuildRoute: () => void
  onCancelRoute?: () => void
  showDirectRoute: boolean
  showRouteActions: boolean
}) {
  const container = document.createElement('div')
  container.className = 'map-popup'

  const title = document.createElement('strong')
  title.className = 'map-popup__title'
  title.textContent = point.title
  container.appendChild(title)

  if (point.addressLabel) {
    const meta = document.createElement('p')
    meta.className = 'map-popup__meta'
    meta.textContent = point.addressLabel
    container.appendChild(meta)
  }

  const actions = document.createElement('div')
  actions.className = 'map-popup__actions'

  const openLink = document.createElement('a')
  openLink.className = 'map-popup__link'
  openLink.href = googleMapsUrl
  openLink.rel = 'noreferrer'
  openLink.target = '_blank'
  openLink.textContent = 'Открыть в Google Maps'
  actions.appendChild(openLink)

  if (showDirectRoute) {
    const routeButton = document.createElement('button')
    routeButton.type = 'button'

    if (isRouteTarget && onCancelRoute) {
      routeButton.className = 'map-popup__button map-popup__button--cancel'
      routeButton.textContent = 'Убрать маршрут'
      routeButton.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onCancelRoute()
      })
    } else {
      routeButton.className = 'map-popup__button'
      routeButton.textContent = 'Построить маршрут'
      routeButton.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onBuildRoute()
      })
    }

    actions.appendChild(routeButton)
  }

  if (showRouteActions) {
    const addButton = document.createElement('button')
    addButton.className = `map-popup__button map-popup__button--accent${isInDraft ? ' map-popup__button--active' : ''}`
    addButton.disabled = !canAddToDraft
    addButton.type = 'button'
    addButton.textContent = isInDraft ? 'В маршруте' : 'Добавить'
    addButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onAddPointToDraft?.()
    })
    actions.appendChild(addButton)
  }

  container.appendChild(actions)
  return container
}

function getSourcePointId(stop: RouteStop) {
  return stop.id.replace(/-draft-stop.*$/, '')
}




