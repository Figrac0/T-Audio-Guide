import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  Excursion,
  ExcursionTheme,
  NearbyPoint,
  SupportedLocale,
} from '@/entities/excursion/model/types'
import { useDiscoveryRoutes } from '@/entities/excursion/model/useDiscoveryRoutes'
import {
  buildOsmWalkingRouteGeometryFromPoints,
  type LngLat,
} from '@/features/route-map/lib/route-geometry'
import { useUserGeolocation } from '@/features/route-map/model/useUserGeolocation'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { appRoutes } from '@/shared/config/routes'
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
  const [radiusMeters, setRadiusMeters] = useState(storedContext.radiusMeters ?? 1000)
  const [selectedPointId, setSelectedPointId] = useState('')
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

  const { excursions, isLoading, nearbyPoints } = useDiscoveryRoutes({
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
  useEffect(() => {
    if (draftStops.length === 0 || (draftStops.length === 1 && !userPosition)) {
      setRouteSegmentsState({ signature: '', segments: [] })
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
        (ex: Excursion) =>
          (activeTheme === 'all' || ex.theme === activeTheme) &&
          (maxDuration === null || ex.durationMinutes <= maxDuration),
      ),
    [excursions, activeTheme, maxDuration],
  )

  const draftPointIds = useMemo(
    () => new Set(draftStops.map((s) => s.id.replace(/-draft-stop(?:-\d+)?$/, ''))),
    [draftStops],
  )

  // Recompute expected signature to detect when route is stale during fetching
  const routeSignature =
    draftStops.length === 0 || (draftStops.length === 1 && !userPosition)
      ? ''
      : `${userPosition ? 'lead' : 'plain'}:${[
          ...(userPosition ? [userPosition] : []),
          ...draftStops.map((s) => s.coordinates),
        ]
          .map((p) => `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`)
          .join('|')}`

  const routeState: PlannerRouteState =
    routeSegmentsState.signature === routeSignature
      ? { hasLeadSegment: Boolean(userPosition), segments: routeSegmentsState.segments }
      : { hasLeadSegment: false, segments: [] }

  const handleSelectPoint = useCallback((pointId: string) => {
    setSelectedPointId(pointId)
  }, [])

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

  const handleSaveRoute = useCallback(() => {
    const result = saveDraftRoute()
    if (result.status === 'invalid') {
      setNotice('Добавьте минимум две точки.')
      return
    }
    if (result.route) {
      navigate(appRoutes.excursion(result.route.slug))
    }
  }, [navigate, saveDraftRoute])

  const handleClearRoute = useCallback(() => {
    clearDraftRoute()
    setExpandedStopId(null)
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
    draftPointIds,
    draftStops,
    excursions: filteredExcursions,
    expandedStopId,
    geolocationError,
    handleAddPoint,
    handleClearRoute,
    handleLocateUser,
    handleRemoveStop,
    handleSaveRoute,
    handleSelectPoint,
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
