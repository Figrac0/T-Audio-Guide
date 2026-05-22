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
  type RouteGeometry,
} from '@/features/route-map/lib/route-geometry'
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
import { appMapConfig } from '@/shared/config/map'
import { getDiscoveryRadiusForZoom } from '@/shared/lib/discovery-radius'
import { appRoutes } from '@/shared/config/routes'
import { buildGoogleMapsUrl } from '@/shared/lib/maps'
import './DiscoveryMap.css'
import '@/features/route-map/ui/map-marker-skin.css'
import '@/features/route-map/ui/leaflet-popup-close.css'

export interface DiscoveryCategoryOption {
  // `id` is either a backend categoryId (number) or 'all'.
  // Legacy frontend slugs are still accepted for back-compat.
  id: PointCategory | 'all' | number
  label: string
}

export interface DiscoveryRadiusOption {
  label: string
  value: number
}

interface DiscoveryMapProps {
  activeCategory: PointCategory | 'all' | number
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
  initialCenter?: GeoPoint
  isLoading: boolean
  isMapLocked?: boolean
  loadError: string | null
  nearbyPoints: NearbyPoint[]
  onAddPointToDraft?: (point: NearbyPoint) => void
  onBuildRoute: (pointId: string) => void
  onChangeRadius: (radiusMeters: number) => void
  onClearDraftRoute?: () => void
  onLocateUser: () => void
  onMapClick?: (coords: GeoPoint) => void
  onSaveDraftRoute?: () => void
  onSearchQueryChange?: (value: string) => void
  onSelectCategory: (category: PointCategory | 'all' | number) => void
  onSelectNextPoint: () => void
  onSelectPoint: (pointId: string) => void
  onSelectPreviousPoint: () => void
  panOnlyId?: string
  radiusMeters: number
  radiusOptions?: DiscoveryRadiusOption[]
  recenterTrigger?: number
  routeTargetId: string | null
  searchQuery?: string
  selectedPointId: string
  showDirectRouteInPopup?: boolean
  showPopupRouteActions?: boolean
  userPosition: GeoPoint | null
  isManualUserPosition?: boolean
  isRadiusLocked?: boolean
}

const mapPadding: [number, number, number, number] = [56, 48, 48, 48]
const selectedPointZoom = 16
const locateZoom = 15.5
// Cluster radius in px: markers are 34px circles, cluster when centers are within 40px
const CLUSTER_RADIUS_PX = 40

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
  initialCenter,
  isLoading,
  isMapLocked = false,
  loadError,
  nearbyPoints,
  onAddPointToDraft,
  onBuildRoute,
  onChangeRadius,
  onClearDraftRoute,
  onLocateUser,
  onMapClick,
  onSaveDraftRoute,
  onSearchQueryChange,
  onSelectCategory,
  onSelectNextPoint,
  onSelectPoint,
  onSelectPreviousPoint,
  panOnlyId = '',
  radiusMeters,
  radiusOptions = [],
  recenterTrigger = 0,
  routeTargetId,
  searchQuery = '',
  selectedPointId,
  showDirectRouteInPopup = false,
  showPopupRouteActions = true,
  userPosition,
  isManualUserPosition = false,
  isRadiusLocked = false,
}: DiscoveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const radiusCircleRef = useRef<L.Circle | null>(null)
  const markerRefs = useRef(new Map<string, L.Marker>())
  // Tracks last applied icon state per marker — avoids redundant setIcon swaps
  // (which recreate the DOM node even with identical HTML, causing micro-flicker).
  const markerIconStateRef = useRef(
    new Map<string, { active: boolean; draftOrder: number | null }>(),
  )
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const initialCenterRef = useRef(initialCenter ?? userPosition ?? appMapConfig.defaultCenter)
  const skipSelectedFocusRef = useRef(true)
  const hasAutoFittedRef = useRef(false)
  const selectionSourceRef = useRef<SelectionSource | null>(null)
  const lastNonEmptySelectedIdRef = useRef<string>('')
  // Tracks the route signature last fitted to — prevents re-fitting on every
  // nearbyPoints refresh while the same route is active.
  const lastFittedRouteRef = useRef<string>('')
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const clusterLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const clustersRef = useRef<Array<{ ids: string[]; key: string; lat: number; lng: number }>>([])
  const prevSelectedClusterKeyRef = useRef<string | null>(null)
  const clusterZoomRef = useRef<number | null>(null)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRadiusLockedRef = useRef(isRadiusLocked)
  isRadiusLockedRef.current = isRadiusLocked
  const pointCacheRef = useRef<Map<string, NearbyPoint>>(new Map())
  const onChangeRadiusRef = useRef(onChangeRadius)
  const onMapClickRef = useRef(onMapClick)
  const selectedPointIdRef = useRef(selectedPointId)
  const panOnlyIdRef = useRef(panOnlyId)
  const nearbyPointsRef = useRef(nearbyPoints)
  const popupPointIdRef = useRef<string | null>(null)
  const suppressPopupCloseRef = useRef(false)
  const userClosedPopupRef = useRef(false)
  const userInteractedWithMapRef = useRef(false)
  const displayRadiusRef = useRef(radiusMeters)
  const targetRadiusRef = useRef(radiusMeters)
  const radiusInterpolationRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const [clusterVersion, setClusterVersion] = useState(0)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<'category' | 'radius' | null>(null)
  const [displayRadius, setDisplayRadius] = useState(radiusMeters)
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

  // Keep radius callback ref current so zoomend listener always calls latest version
  onChangeRadiusRef.current = onChangeRadius
  onMapClickRef.current = onMapClick
  selectedPointIdRef.current = selectedPointId
  panOnlyIdRef.current = panOnlyId
  nearbyPointsRef.current = nearbyPoints

  // Update point cache — used to keep pinned markers visible when outside radius
  for (const p of nearbyPoints) {
    pointCacheRef.current.set(p.id, p)
  }

  // effectivePoints = nearby + any pinned points (route target, draft stops) not in nearby
  const effectivePoints = useMemo(() => {
    const nearbyIds = new Set(nearbyPoints.map((p) => p.id))
    const extras: NearbyPoint[] = []
    if (routeTargetId && !nearbyIds.has(routeTargetId)) {
      const cached = pointCacheRef.current.get(routeTargetId)
      if (cached) extras.push(cached)
    }
    visibleDraftPointIds.forEach((id) => {
      if (!nearbyIds.has(id)) {
        const cached = pointCacheRef.current.get(id)
        if (cached) extras.push(cached)
      }
    })
    return extras.length > 0 ? [...nearbyPoints, ...extras] : nearbyPoints
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyPoints, routeTargetId, visibleDraftPointIds])

  const guidedPoint =
    effectivePoints.find((point) => point.id === routeTargetId) ?? null
  const pointsBounds = useMemo(() => {
    const points = [
      ...effectivePoints.map((point) => point.coordinates),
      ...(userPosition ? [userPosition] : []),
    ]

    return getBoundsFromPoints(points)
  }, [effectivePoints, userPosition])
  // Signature must include guidedPoint coordinates, not just id: when the user
  // toggles manual position the center changes and points get re-derived with
  // shifted coordinates (mock API generates them relative to center). If only
  // id were tracked, the route would keep pointing at stale coordinates.
  const guideSignature =
    userPosition && guidedPoint
      ? `${guidedPoint.id}:${guidedPoint.coordinates.lat.toFixed(5)}:${guidedPoint.coordinates.lng.toFixed(5)}:${userPosition.lat.toFixed(5)}:${userPosition.lng.toFixed(5)}`
      : ''

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
      // Layer order matters: routeLayer (circle + polylines) → overlay (POI
      // markers) → clusterLayer → userLayer (user position, always on top)
      const routeLayer = L.layerGroup().addTo(map)
      const overlay = L.layerGroup().addTo(map)
      const clusterLayer = L.layerGroup().addTo(map)
      const userLayer = L.layerGroup().addTo(map)

      mapRef.current = map
      routeLayerRef.current = routeLayer
      overlayRef.current = overlay
      clusterLayerRef.current = clusterLayer
      userLayerRef.current = userLayer
      clusterZoomRef.current = map.getZoom()

      map.on('popupclose', () => {
        if (suppressPopupCloseRef.current) {
          return
        }

        popupPointIdRef.current = null
        userClosedPopupRef.current = true
      })

      // Smooth radius interpolation on zoom changes
      const updateTargetRadius = (newTarget: number) => {
        newTarget = Math.round(newTarget)
        if (newTarget === targetRadiusRef.current) return

        targetRadiusRef.current = newTarget

        if (radiusInterpolationRef.current !== null) {
          cancelAnimationFrame(radiusInterpolationRef.current)
        }

        const startRadius = displayRadiusRef.current
        const startTime = performance.now()
        const duration = 600

        const animate = (now: number) => {
          const elapsed = now - startTime
          const progress = Math.min(1, elapsed / duration)
          const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress

          const newRadius = Math.round(startRadius + (newTarget - startRadius) * eased)
          displayRadiusRef.current = newRadius
          setDisplayRadius(newRadius)

          if (progress < 1) {
            radiusInterpolationRef.current = requestAnimationFrame(animate)
          } else {
            radiusInterpolationRef.current = null
            onChangeRadiusRef.current(newTarget)
          }
        }

        radiusInterpolationRef.current = requestAnimationFrame(animate)
      }

      // Update radius only on zoom changes — debounced so fast wheel/pinch zoom
      // doesn't fire multiple API-triggering interpolations in a row.
      map.on('zoomend', () => {
        if (zoomDebounceRef.current !== null) {
          clearTimeout(zoomDebounceRef.current)
        }
        zoomDebounceRef.current = window.setTimeout(() => {
          if (!isRadiusLockedRef.current) {
            const newRadius = getDiscoveryRadiusForZoom(map.getZoom())
            updateTargetRadius(newRadius)
          }
        }, 250)
        clusterZoomRef.current = map.getZoom()
        setClusterVersion((v) => v + 1)
      })

      map.on('click', (event: L.LeafletMouseEvent) => {
        onMapClickRef.current?.({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        })
      })

      map.on('movestart', () => {
        userInteractedWithMapRef.current = true
        userClosedPopupRef.current = true
      })

      map.on('zoomstart', () => {
        userInteractedWithMapRef.current = true
        userClosedPopupRef.current = true
      })

      queueMicrotask(() => setMapLoadError(null))
    } catch (error) {
      console.error(error)
      queueMicrotask(() => setMapLoadError('Не удалось открыть карту.'))
    }

    return () => {
      if (zoomDebounceRef.current !== null) clearTimeout(zoomDebounceRef.current)
      if (radiusInterpolationRef.current !== null) cancelAnimationFrame(radiusInterpolationRef.current)
      routeLayerRef.current?.clearLayers()
      routeLayerRef.current = null
      clusterLayerRef.current?.clearLayers()
      clusterLayerRef.current = null
      overlayRef.current?.clearLayers()
      overlayRef.current = null
      userLayerRef.current?.clearLayers()
      userLayerRef.current = null
      markers.clear()
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
      mapContainerRef.current?.classList.add('dm--locked')
    } else {
      map.dragging.enable()
      map.scrollWheelZoom.enable()
      map.doubleClickZoom.enable()
      map.touchZoom.enable()
      mapContainerRef.current?.classList.remove('dm--locked')
    }
  }, [isMapLocked])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    // Passive — handler only inspects the target, never preventDefaults.
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })

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

      // Skip building while nearby data is being refetched after a
      // userPosition change. With the mock backend, point coordinates are
      // derived from the user's center — so an in-flight refetch will return
      // shifted coordinates and the value of `guidedPoint` we have right now
      // is stale. Building a route from stale coordinates would draw the
      // line to where the point USED to be (off-screen, far from the marker).
      // The effect will re-run automatically once the new data arrives
      // (guideSignature changes when guidedPoint.coordinates change).
      if (isLoading) {
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
  // guideSignature encodes guidedPoint.id + userPosition coords — no need to
  // list guidedPoint/userPosition separately; doing so causes spurious rebuilds
  // whenever nearbyPoints gets a new array reference after zoom → radius refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideSignature, isLoading])

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
  // draftSignature already encodes userPosition + each stop's coordinates
  // (see line 230). userPosition / visibleDraftStops are read inside the
  // closure but listing them here would re-fire the effect on identity-only
  // changes (new array refs without coordinate changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSignature])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    // Only fly to route bounds when the route itself changes — not on every
    // nearbyPoints refresh (which happens on zoom/radius changes).
    const routeSignature = `${routeTargetId ?? ''}:${visibleDraftStopsSignature}`

    if (draftBounds && visibleDraftStops.length) {
      if (routeSignature !== lastFittedRouteRef.current && !userInteractedWithMapRef.current && !userClosedPopupRef.current) {
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
      if (routeSignature !== lastFittedRouteRef.current && !userInteractedWithMapRef.current && !userClosedPopupRef.current) {
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
  // Intentionally excludes displayRadius: the dedicated effect below updates circle
  // via setRadius() in-place, avoiding ~36 layer rebuilds per radius interpolation.
  useEffect(() => {
    const routeLayer = routeLayerRef.current
    if (!routeLayer) return

    routeLayer.clearLayers()

    if (userPosition) {
      const circle = createDiscoveryRadiusCircle(userPosition, displayRadiusRef.current)
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
  }, [draftGeometry, guideGeometry, userPosition])

  // User position marker — kept in its own layer (added last) so it always
  // renders on top of POI markers and cluster bubbles.
  useEffect(() => {
    const layer = userLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (userPosition) {
      L.marker([userPosition.lat, userPosition.lng], {
        icon: createUserIcon(isManualUserPosition),
        title: 'Ваше местоположение',
        zIndexOffset: 2000,
      }).addTo(layer)
    }
  }, [isManualUserPosition, userPosition])

  // Markers layer: POI markers — DIFFED on each update instead of clear+rebuild.
  // For 100-200 markers, recreating all DOM nodes on every nearbyPoints change
  // (which happens on every zoom→radius change) caused severe lag and white screen.
  // Now we add only new ids, remove gone ids, and update icons/popups in-place.
  useEffect(() => {
    const overlay = overlayRef.current
    const map = mapRef.current
    if (!overlay || !map) return

    suppressPopupCloseRef.current = true

    const newIds = new Set(effectivePoints.map((point) => point.id))

    // Remove markers that are no longer in the points list
    markerRefs.current.forEach((marker, id) => {
      if (!newIds.has(id)) {
        overlay.removeLayer(marker)
        markerRefs.current.delete(id)
        markerIconStateRef.current.delete(id)
      }
    })

    // Add new / update existing
    effectivePoints.forEach((point) => {
      const googleMapsUrl = buildGoogleMapsUrl(point.coordinates, userPosition)
      const isInDraft = visibleDraftPointIds.has(point.id)
      const draftOrder = visibleDraftOrderMap.get(point.id) ?? null
      const isActive = point.id === selectedPointIdRef.current

      const popupContent = buildPopupContent({
        googleMapsUrl,
        showDirectRoute: showDirectRouteInPopup || showPopupRouteActions,
        showRouteActions: showPopupRouteActions,
        isRouteTarget: point.id === routeTargetId,
        onBuildRoute: () => {
          preservePageScroll()
          selectionSourceRef.current = 'route'
          onSelectPoint(point.id)
          onBuildRoute(point.id)
          markerRefs.current.get(point.id)?.closePopup()
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
      })

      const existing = markerRefs.current.get(point.id)
      if (existing) {
        // Sync position when the point's coordinates change. Mock API derives
        // coords relative to the user's center, so toggling manual position
        // shifts every point — without this the marker stays at the previous
        // location even after nearbyPoints reflects the new coordinates.
        const currentLatLng = existing.getLatLng()
        if (
          currentLatLng.lat !== point.coordinates.lat ||
          currentLatLng.lng !== point.coordinates.lng
        ) {
          existing.setLatLng([point.coordinates.lat, point.coordinates.lng])
        }
        const prevIconState = markerIconStateRef.current.get(point.id)
        if (
          !prevIconState ||
          prevIconState.active !== isActive ||
          prevIconState.draftOrder !== draftOrder
        ) {
          existing.setIcon(createPoiIcon(point, isActive, draftOrder, true))
          markerIconStateRef.current.set(point.id, { active: isActive, draftOrder })
          // setIcon resets the element className, wiping dm--visible-in-cluster.
          // Restore it so the selected marker stays visible in cluster mode.
          if (mapContainerRef.current?.classList.contains('dm--clustering')) {
            const isInMultiCluster = clustersRef.current.some(
              (c) => c.ids.length > 1 && c.ids.includes(point.id),
            )
            if (!isInMultiCluster) {
              const el = existing.getElement()
              if (el) el.classList.add('dm--visible-in-cluster')
            }
          }
        }
        existing.setZIndexOffset(isActive ? 1000 : 0)
        existing.setPopupContent(popupContent)
        return
      }

      const newMarker = L.marker([point.coordinates.lat, point.coordinates.lng], {
        icon: createPoiIcon(point, isActive, draftOrder, true),
        title: buildMarkerTitle(point),
        zIndexOffset: isActive ? 1000 : 0,
      })
        .bindPopup(popupContent, {
          // autoPan animates once on popup open so the user sees it; that's
          // a one-shot pan and does not restrict subsequent panning.
          autoPan: true,
          // keepInView would continuously re-pan the map back whenever the
          // user drags it while the popup is open — feels like the camera is
          // "locked" to the marker. Disabled so users can freely move around
          // while a popup is visible.
          keepInView: false,
          className: routeMapPopupClassName,
        })
        .on('click', () => {
          preservePageScroll()
          selectionSourceRef.current = 'marker'
          userClosedPopupRef.current = false
          userInteractedWithMapRef.current = false
          popupPointIdRef.current = point.id
          onSelectPoint(point.id)
          newMarker.openPopup()
        })

      newMarker.addTo(overlay)
      markerRefs.current.set(point.id, newMarker)
      markerIconStateRef.current.set(point.id, { active: isActive, draftOrder })
    })

    suppressPopupCloseRef.current = false

    const popupPointId = popupPointIdRef.current
    if (!popupPointId || popupPointId !== selectedPointIdRef.current) {
      return
    }

    const selectedMarker = markerRefs.current.get(popupPointId)
    if (!selectedMarker) {
      return
    }

    // Don't reopen popup if user closed it (prevents auto-reopening on mobile when nearbyPoints update)
    if (userClosedPopupRef.current) {
      return
    }

    const reopenTimeout = window.setTimeout(() => {
      if (!selectedMarker.isPopupOpen()) {
        selectedMarker.openPopup()
      }
    }, 0)

    return () => {
      window.clearTimeout(reopenTimeout)
    }
  }, [draftStops.length, effectivePoints, onAddPointToDraft, onBuildRoute, onClearDraftRoute, onSelectPoint, routeTargetId, showDirectRouteInPopup, showPopupRouteActions, userPosition, visibleDraftOrderMap, visibleDraftPointIds])


  // Initialize and sync when radiusMeters changes from parent (e.g., from radius menu)
  useEffect(() => {
    targetRadiusRef.current = radiusMeters
    displayRadiusRef.current = radiusMeters
    setDisplayRadius(radiusMeters)
  }, [radiusMeters])

  // Update radius circle when displayRadius changes (smooth via interpolation above)
  useEffect(() => {
    const circle = radiusCircleRef.current
    if (!circle) return
    circle.setRadius(displayRadius)
  }, [displayRadius])

  // Marker clustering: group markers whose centres are within CLUSTER_RADIUS_PX
  // of each other on screen. Runs on every zoom change and every points update.
  // selectedPointId is intentionally NOT a dep — selection changes are handled
  // by the separate selection-in-cluster effect below to avoid re-triggering
  // the cluster-pop animation on every point selection.
  useEffect(() => {
    const map = mapRef.current
    const clusterLayer = clusterLayerRef.current
    const container = mapContainerRef.current
    if (!map || !clusterLayer) return

    // Greedy pixel-distance clustering. Pixel coords are precomputed once so the
    // inner loop does no projection calls. Inner loop starts at j = i+1 (each
    // pair checked once) — halves iterations vs the original O(n²) approach.
    const n = effectivePoints.length
    const pxX = new Float64Array(n)
    const pxY = new Float64Array(n)
    for (let k = 0; k < n; k++) {
      const p = effectivePoints[k]
      const px = map.latLngToContainerPoint([p.coordinates.lat, p.coordinates.lng])
      pxX[k] = px.x
      pxY[k] = px.y
    }

    const R2 = CLUSTER_RADIUS_PX * CLUSTER_RADIUS_PX
    const visited = new Set<string>()
    const rawClusters: Array<{ ids: string[]; lat: number; lng: number }> = []

    for (let i = 0; i < n; i++) {
      const point = effectivePoints[i]
      if (visited.has(point.id)) continue
      visited.add(point.id)

      const cx = pxX[i]
      const cy = pxY[i]
      const ids = [point.id]
      let sumLat = point.coordinates.lat
      let sumLng = point.coordinates.lng

      for (let j = i + 1; j < n; j++) {
        const other = effectivePoints[j]
        if (visited.has(other.id)) continue
        const dx = cx - pxX[j]
        const dy = cy - pxY[j]
        if (dx * dx + dy * dy <= R2) {
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
      container?.classList.remove('dm--clustering')
      markerRefs.current.forEach((marker) => {
        const el = marker.getElement()
        if (el) el.classList.remove('dm--visible-in-cluster')
      })
      // Remove all existing cluster markers
      for (const marker of clusterMarkersRef.current.values()) {
        clusterLayer.removeLayer(marker)
      }
      clusterMarkersRef.current.clear()
      clustersRef.current = []
      prevSelectedClusterKeyRef.current = null
      return
    }

    container?.classList.add('dm--clustering')

    markerRefs.current.forEach((marker) => {
      const el = marker.getElement()
      if (el) el.classList.remove('dm--visible-in-cluster')
    })

    // Build keyed cluster list and diff against previous cluster markers.
    // Reusing existing Leaflet marker instances for unchanged clusters prevents
    // the cluster-pop animation from re-firing on selection changes.
    const nextClusterMap = new Map<string, L.Marker>()
    const nextClusters: Array<{ ids: string[]; key: string; lat: number; lng: number }> = []

    for (const cluster of rawClusters) {
      const key = [...cluster.ids].sort().join(':')
      nextClusters.push({ ...cluster, key })

      if (cluster.ids.length === 1) {
        const marker = markerRefs.current.get(cluster.ids[0])
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
                  const p = effectivePoints.find((pt) => pt.id === id)!
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

    // Remove cluster markers that no longer exist
    for (const [key, marker] of clusterMarkersRef.current) {
      if (!nextClusterMap.has(key)) {
        clusterLayer.removeLayer(marker)
        // Clear prevSelected if its cluster was removed
        if (prevSelectedClusterKeyRef.current === key) {
          prevSelectedClusterKeyRef.current = null
        }
      }
    }

    clusterMarkersRef.current = nextClusterMap
    clustersRef.current = nextClusters
  }, [clusterVersion, effectivePoints])

  // Selection-in-cluster: when the selected point is inside a multi-point cluster,
  // replace the cluster count with its category icon (no individual marker shown).
  // Runs after the clustering effect to read the freshly-built cluster state.
  useEffect(() => {
    const clusters = clustersRef.current
    const clusterMarkers = clusterMarkersRef.current

    // Restore the previously selected cluster's icon back to count
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

    // Find the multi-point cluster containing the selected point
    const selectedCluster = clusters.find(
      (c) => c.ids.length > 1 && c.ids.includes(selectedPointId),
    )
    if (!selectedCluster) return

    const marker = clusterMarkers.get(selectedCluster.key)
    if (!marker) return

    const selectedPoint = effectivePoints.find((p) => p.id === selectedPointId)
    if (!selectedPoint) return

    // Swap count for category icon directly in the DOM — no setIcon(), no animation
    const el = marker.getElement()
    const inner = el?.querySelector('.cluster-marker')
    if (inner) {
      inner.innerHTML = getPointCategoryIcon(selectedPoint.category)
      prevSelectedClusterKeyRef.current = selectedCluster.key
    }
  }, [selectedPointId, clusterVersion, effectivePoints])

  // Selection-only icon update. The main marker diff effect uses
  // selectedPointIdRef and won't re-run when ONLY selection changes, so we
  // need this separate pass. Use the icon-state cache to avoid redundant
  // setIcon calls — typically only 0-2 markers actually change visual state
  // (the previous selected loses --active, the new one gains it).
  useEffect(() => {
    effectivePoints.forEach((point) => {
      const marker = markerRefs.current.get(point.id)
      if (!marker) return
      const isActive = point.id === selectedPointId
      const draftOrder = visibleDraftOrderMap.get(point.id) ?? null
      const prev = markerIconStateRef.current.get(point.id)
      marker.setZIndexOffset(isActive ? 1000 : 0)
      if (prev && prev.active === isActive && prev.draftOrder === draftOrder) return
      marker.setIcon(createPoiIcon(point, isActive, draftOrder, true))
      markerIconStateRef.current.set(point.id, { active: isActive, draftOrder })
      // Restore dm--visible-in-cluster for ALL single-point cluster markers after
      // setIcon() wipes the element className — not just the active one.
      if (mapContainerRef.current?.classList.contains('dm--clustering')) {
        const isInMultiCluster = clustersRef.current.some(
          (c) => c.ids.length > 1 && c.ids.includes(point.id),
        )
        if (!isInMultiCluster) {
          const el = marker.getElement()
          if (el) el.classList.add('dm--visible-in-cluster')
        }
      }
    })
  }, [effectivePoints, selectedPointId, visibleDraftOrderMap])

  // Pan-only: triggered by a nearby card click. Closes any open popup, pans to
  // the point at the current zoom level, and does NOT open the popup.
  useEffect(() => {
    if (!panOnlyId) return
    const map = mapRef.current
    const point = nearbyPointsRef.current.find((p) => p.id === panOnlyId)
    if (!map || !point) return
    map.closePopup()
    popupPointIdRef.current = null
    userClosedPopupRef.current = true
    map.panTo([point.coordinates.lat, point.coordinates.lng], { animate: true })
  }, [panOnlyId])

  useEffect(() => {
    if (!selectedPointId) return

    // Pan-only selection: was triggered by a nearby card click.
    // The panOnlyId effect already panned the map; don't open a popup here.
    if (selectedPointId === panOnlyIdRef.current) {
      lastNonEmptySelectedIdRef.current = selectedPointId
      return
    }

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
      // Popup already opened synchronously in the click handler — don't reopen
      // it here, that would cause a close+open flash (autoPan fires twice).
      if (!marker.isPopupOpen()) {
        popupPointIdRef.current = point.id
        marker.openPopup()
      }
      return
    }

    // On mobile, if user has interacted with the map (pan/zoom) or closed popup,
    // don't auto-center to prevent interrupting their navigation
    if (userInteractedWithMapRef.current || userClosedPopupRef.current) {
      return
    }

    applyLeafletLocation(map, {
      center: toLngLat(point.coordinates),
      zoom: selectedPointZoom,
      duration: 600,
      easing: 'ease-in-out',
    })

    const popupTimeout = window.setTimeout(() => {
      popupPointIdRef.current = point.id
      marker.openPopup()
    }, 240)
    return () => window.clearTimeout(popupTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPointId])

  useEffect(() => {
    if (!recenterTrigger) return
    const map = mapRef.current
    if (!userPosition || !map) return
    // Zoom to street level so the user can see their building and street name.
    applyLeafletLocation(map, {
      center: toLngLat(userPosition),
      zoom: 17,
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

  function handleCategorySelect(category: PointCategory | 'all' | number) {
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

      <div className={`discovery-map__canvas discovery-map__canvas--wide${isMapLocked ? ' dm--locked' : ''}`}>
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

      {/* Geolocation error banner is rendered by the parent (HomePage) so it
          can be dismissed and auto-hide on sheet open. */}
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




