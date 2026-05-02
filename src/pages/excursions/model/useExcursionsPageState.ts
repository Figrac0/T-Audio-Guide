import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  ExcursionTheme,
  NearbyPoint,
  SupportedLocale,
} from '@/entities/excursion/model/types'
import { useDiscoveryRoutes } from '@/entities/excursion/model/useDiscoveryRoutes'
import {
  buildOsmWalkingRouteGeometryFromPoints,
  createLineGeometryFromPoints,
  getCachedWalkingRouteBuildResult,
  type LngLat,
} from '@/features/route-map/lib/route-geometry'
import { useUserGeolocation } from '@/features/route-map/model/useUserGeolocation'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { appMapConfig } from '@/shared/config/map'
import { appRoutes } from '@/shared/config/routes'
import { clampDiscoveryRadius } from '@/shared/lib/discovery-radius'
import {
  detectSupportedLocale,
  getStoredDiscoveryContext,
  saveDiscoveryContext,
} from '@/shared/lib/discovery-context'

export const themeOptions: Array<ExcursionTheme | 'all'> = [
  'all',
  'walk',
  'food',
  'nature',
  'fun',
  'mixed',
]

export const durationOptions = [30, 45, 60, 90, 120] as const

// Route segments from OSRM. segments[0] is the guide segment (user→stop1) when hasLeadSegment=true.
export interface PlannerRouteState {
  hasLeadSegment: boolean
  segments: LngLat[][]
}

export function useExcursionsPageState() {
  const navigate = useNavigate()
  const {
    addPointToDraft,
    clearDraftRoute,
    draftStops,
    isPointInDraft,
    removeDraftStop,
    saveDraftRoute,
  } = useUserRoutes()

  const storedContext = useMemo(() => getStoredDiscoveryContext(), [])
  const detectedLocale = useMemo<SupportedLocale>(() => {
    if (typeof window === 'undefined') return storedContext.locale
    return detectSupportedLocale(
      navigator.languages?.[0] ?? navigator.language ?? storedContext.browserLocale,
    )
  }, [storedContext.browserLocale, storedContext.locale])

  const [locale] = useState<SupportedLocale>(storedContext.locale ?? detectedLocale)
  const [activeTheme, setActiveTheme] = useState<ExcursionTheme | 'all'>('all')
  const [maxDuration, setMaxDuration] = useState<number | null>(null)
  const [radiusMeters, setRadiusMeters] = useState(
    clampDiscoveryRadius(storedContext.radiusMeters ?? appMapConfig.discoveryRadiusMeters),
  )
  const [selectedPointId, setSelectedPointId] = useState('')
  const [detailPointId, setDetailPointId] = useState<string | null>(null)
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null)
  const [recenterKey, setRecenterKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [routeSegmentsState, setRouteSegmentsState] = useState<{
    signature: string
    segments: LngLat[][]
  }>({ signature: '', segments: [] })

  const {
    error: geolocationError,
    requestLocation,
    status: geolocationStatus,
    userPosition,
  } = useUserGeolocation()

  const center = userPosition ?? storedContext.center
  const canLoadNearbyPlaces =
    Boolean(userPosition) || geolocationStatus === 'blocked' || geolocationStatus === 'unsupported'

  const { error: discoveryError, excursions, isLoading, nearbyPoints } = useDiscoveryRoutes({
    activePointCategory: 'all',
    center,
    enabled: canLoadNearbyPlaces,
    locale,
    radiusMeters,
    search: '',
  })

  useEffect(() => {
    saveDiscoveryContext({
      activePointCategory: 'all',
      browserLocale:
        typeof window === 'undefined'
          ? storedContext.browserLocale
          : (navigator.languages?.[0] ?? navigator.language ?? storedContext.browserLocale),
      center,
      locale,
      radiusMeters,
      updatedAt: new Date().toISOString(),
    })
  }, [center, locale, radiusMeters, storedContext.browserLocale])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2800)
    return () => window.clearTimeout(id)
  }, [notice])

  // Build route segments. When userPosition is available it is prepended as point[0],
  // making segments[0] the guide segment (user → first stop), rendered dashed.
  const cachedRouteSegments = useMemo(() => {
    if (draftStops.length === 0 || (draftStops.length === 1 && !userPosition)) {
      return null
    }

    const points = [
      ...(userPosition ? [userPosition] : []),
      ...draftStops.map((stop) => stop.coordinates),
    ]
    const hasLeadSegment = Boolean(userPosition)
    const signature = `${hasLeadSegment ? 'lead' : 'plain'}:${points
      .map((point) => `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`)
      .join('|')}`

    // Check each adjacent pair individually — the async effect caches pairs, not the full path
    const segments: LngLat[][] = []
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const cached = getCachedWalkingRouteBuildResult([from, to])
      if (!cached) return null
      if (cached.geometry?.type === 'LineString') {
        segments.push(cached.geometry.coordinates)
      } else if (cached.geometry?.type === 'MultiLineString') {
        segments.push(cached.geometry.coordinates[0] ?? [[from.lng, from.lat], [to.lng, to.lat]])
      } else {
        segments.push([[from.lng, from.lat], [to.lng, to.lat]])
      }
    }

    return { signature, segments }
  }, [draftStops, userPosition])

  useEffect(() => {
    if (draftStops.length === 0 || (draftStops.length === 1 && !userPosition)) {
      return
    }

    const hasLeadSegment = Boolean(userPosition)
    const points = [
      ...(userPosition ? [userPosition] : []),
      ...draftStops.map((s) => s.coordinates),
    ]
    const signature = `${hasLeadSegment ? 'lead' : 'plain'}:${points
      .map((p) => `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`)
      .join('|')}`
    const controller = new AbortController()

    async function buildSegments() {
      const segments = await Promise.all(
        points.slice(0, -1).map(async (point, index) => {
          const next = points[index + 1]
          const result = await buildOsmWalkingRouteGeometryFromPoints(
            [point, next],
            controller.signal,
          ).catch(() => null)

          if (result?.geometry?.type === 'LineString') return result.geometry.coordinates
          if (result?.geometry?.type === 'MultiLineString') {
            return result.geometry.coordinates[0] ?? [[point.lng, point.lat], [next.lng, next.lat]]
          }
          return [[point.lng, point.lat], [next.lng, next.lat]] as LngLat[]
        }),
      )

      if (!controller.signal.aborted) {
        setRouteSegmentsState({ signature, segments })
      }
    }

    void buildSegments()
    return () => controller.abort()
  }, [draftStops, userPosition])

  const filteredExcursions = useMemo(
    () =>
      excursions.filter(
        (ex) =>
          (activeTheme === 'all' || ex.theme === activeTheme) &&
          (maxDuration === null || ex.durationMinutes <= maxDuration),
      ),
    [excursions, activeTheme, maxDuration],
  )

  const routePoints = useMemo(
    () => [
      ...(userPosition ? [userPosition] : []),
      ...draftStops.map((stop) => stop.coordinates),
    ],
    [draftStops, userPosition],
  )

  const routeSignature = useMemo(() => {
    if (draftStops.length === 0 || (draftStops.length === 1 && !userPosition)) return ''
    const prefix = userPosition ? 'lead' : 'plain'
    return `${prefix}:${routePoints.map((p) => `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`).join('|')}`
  }, [draftStops.length, routePoints, userPosition])

  const fallbackRouteSegments = useMemo(() => {
    if (!routeSignature) {
      return []
    }

    return routePoints.slice(0, -1).map((point, index) => {
      const nextPoint = routePoints[index + 1]
      const geometry = createLineGeometryFromPoints([point, nextPoint])
      return geometry.type === 'LineString' ? geometry.coordinates : []
    })
  }, [routePoints, routeSignature])

  const routeState = useMemo<PlannerRouteState>(() => {
    if (routeSegmentsState.signature === routeSignature) {
      return {
        hasLeadSegment: Boolean(userPosition),
        segments:
          routeSegmentsState.segments.length > 0 ? routeSegmentsState.segments : fallbackRouteSegments,
      }
    }

    if (cachedRouteSegments?.signature === routeSignature) {
      return {
        hasLeadSegment: Boolean(userPosition),
        segments:
          cachedRouteSegments.segments.length > 0
            ? cachedRouteSegments.segments
            : fallbackRouteSegments,
      }
    }

    if (routeSignature) {
      return { hasLeadSegment: Boolean(userPosition), segments: fallbackRouteSegments }
    }
    return { hasLeadSegment: false, segments: [] }
  }, [
    cachedRouteSegments,
    fallbackRouteSegments,
    routeSegmentsState.segments,
    routeSegmentsState.signature,
    routeSignature,
    userPosition,
  ])

  const handleSelectPoint = useCallback((pointId: string) => {
    setSelectedPointId(pointId)
    setDetailPointId(null)
  }, [])

  const handleShowDetail = useCallback((pointId: string) => {
    setDetailPointId(pointId)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailPointId(null)
  }, [])

  const handlePopupClose = useCallback(() => {
    setDetailPointId(null)
  }, [])

  const detailPoint = useMemo(
    () => (detailPointId !== null ? nearbyPoints.find((p) => p.id === detailPointId) ?? null : null),
    [detailPointId, nearbyPoints],
  )

  const handleAddPoint = useCallback(
    (point: NearbyPoint) => {
      if (isPointInDraft(point.id)) {
        setNotice('Точка уже добавлена в маршрут.')
        return
      }
      if (draftStops.length >= 6) {
        setNotice('В маршрут можно добавить не больше 6 точек.')
        return
      }
      addPointToDraft(point)
      setSelectedPointId(point.id)
      if (!userPosition) requestLocation()
    },
    [addPointToDraft, draftStops.length, isPointInDraft, requestLocation, userPosition],
  )

  const handleRemoveStop = useCallback(
    (stopId: string) => {
      removeDraftStop(stopId)
      setExpandedStopId((id) => (id === stopId ? null : id))
    },
    [removeDraftStop],
  )

  const handleRemovePointFromDraft = useCallback(
    (pointId: string) => {
      const stop = draftStops.find(
        (s) => s.id.replace(/-draft-stop(?:-\d+)?$/, '') === pointId,
      )
      if (stop) removeDraftStop(stop.id)
    },
    [draftStops, removeDraftStop],
  )

  const handleSaveRoute = useCallback(() => {
    const result = saveDraftRoute()
    if (result.status === 'invalid') {
      setNotice('Добавьте минимум две точки.')
      return
    }
    if (result.route) {
      setExpandedStopId(null)
      setSelectedPointId('')
      setNotice(null)
      clearDraftRoute()
      navigate(appRoutes.excursion(result.route.slug))
    }
  }, [clearDraftRoute, navigate, saveDraftRoute])

  const handleClearRoute = useCallback(() => {
    clearDraftRoute()
    setExpandedStopId(null)
    setSelectedPointId('')
    setNotice(null)
  }, [clearDraftRoute])

  const handleLocateUser = useCallback(() => {
    if (!userPosition) {
      requestLocation()
      return
    }
    setRecenterKey((n) => n + 1)
  }, [requestLocation, userPosition])

  return {
    activeTheme,
    canLoadNearbyPlaces,
    detailPoint,
    discoveryError,
    draftStops,
    excursions: filteredExcursions,
    expandedStopId,
    geolocationError,
    handleAddPoint,
    handleClearRoute,
    handleCloseDetail,
    handleLocateUser,
    handlePopupClose,
    handleRemovePointFromDraft,
    handleRemoveStop,
    handleSaveRoute,
    handleSelectPoint,
    handleShowDetail,
    isLoading,
    isPointInDraft,
    maxDuration,
    nearbyPoints,
    notice,
    radiusMeters,
    recenterKey,
    routeState,
    selectedPointId,
    setActiveTheme,
    setExpandedStopId,
    setMaxDuration,
    setRadiusMeters,
    userPosition,
  }
}
