import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '@/app/providers/useAuth'
import type {
  AudioStory,
  Excursion,
  GeoPoint,
  NearbyPoint,
  RouteStop,
} from '@/entities/excursion/model/types'
import { fetchPointDetailData } from '@/entities/excursion/model/usePointDetailsMap'
import { getDistanceMetersBetween } from '@/features/route-map/lib/route-geometry'
import { generatePersonalRouteName } from '@/features/user-routes/lib/personal-route-names'
import { UserRoutesContext } from '@/features/user-routes/model/user-routes-context'
import { appApi } from '@/shared/api/client'
import { appRoutes } from '@/shared/config/routes'
import { getDifficultyByDistance } from '@/shared/lib/excursion-difficulty'

const maxDraftStops = 10
const storageKeyPrefix = 't-guide:user-routes'

interface StoredUserRoutes {
  personalRoutes: Excursion[]
  savedRoutes: Excursion[]
}

interface UserRoutesProviderProps {
  children: ReactNode
}

export function UserRoutesProvider({ children }: UserRoutesProviderProps) {
  const { session } = useAuth()
  const location = useLocation()
  const [savedRoutes, setSavedRoutes] = useState<Excursion[]>(() =>
    loadStoredRoutes(session?.profile?.id ?? 'guest').savedRoutes,
  )
  const [personalRoutes, setPersonalRoutes] = useState<Excursion[]>(() =>
    loadStoredRoutes(session?.profile?.id ?? 'guest').personalRoutes,
  )
  const [draftState, setDraftState] = useState<{
    pathname: string
    stops: RouteStop[]
  }>({
    pathname: location.pathname,
    stops: [],
  })
  const [editingRouteSlug, setEditingRouteSlug] = useState<string | null>(null)
  // Ref keeps the current value readable by callbacks without stale closures
  const editingRouteSlugRef = useRef<string | null>(null)
  const isAuthenticated = Boolean(session?.isAuthenticated && session.profile)
  const storageScope = session?.profile?.id ?? 'guest'
  const draftStops = useMemo(
    () => (draftState.pathname === location.pathname ? draftState.stops : []),
    [draftState.pathname, draftState.stops, location.pathname],
  )

  const persistRoutes = useCallback(
    (nextState: StoredUserRoutes) => {
      setSavedRoutes(nextState.savedRoutes)
      setPersonalRoutes(nextState.personalRoutes)
      writeStoredRoutes(storageScope, nextState)
    },
    [storageScope],
  )

  const isRouteSaved = useCallback(
    (slug: string) => savedRoutes.some((route) => route.slug === slug),
    [savedRoutes],
  )

  const isPointInDraft = useCallback(
    (pointId: string) => draftStops.some((stop) => getSourcePointId(stop.id) === pointId),
    [draftStops],
  )

  const toggleSavedRoute = useCallback(
    (route: Excursion) => {
      if (!isAuthenticated) {
        return
      }

      const alreadySaved = savedRoutes.some((savedRoute) => savedRoute.slug === route.slug)
      const nextSavedRoutes = alreadySaved
        ? savedRoutes.filter((savedRoute) => savedRoute.slug !== route.slug)
        : [route, ...savedRoutes]

      persistRoutes({
        personalRoutes,
        savedRoutes: dedupeRoutes(nextSavedRoutes),
      })

      if (alreadySaved) {
        void appApi.removeSavedRoute({ slug: route.slug })
      } else {
        void appApi.saveRoute({ route })
      }
    },
    [isAuthenticated, persistRoutes, personalRoutes, savedRoutes],
  )

  const removeSavedRoute = useCallback(
    (slug: string) => {
      if (!isAuthenticated) {
        return
      }

      persistRoutes({
        personalRoutes,
        savedRoutes: savedRoutes.filter((route) => route.slug !== slug),
      })
      void appApi.removeSavedRoute({ slug })
    },
    [isAuthenticated, persistRoutes, personalRoutes, savedRoutes],
  )

  const removePersonalRoute = useCallback(
    (slug: string) => {
      if (!isAuthenticated) {
        return
      }

      persistRoutes({
        personalRoutes: personalRoutes.filter((route) => route.slug !== slug),
        savedRoutes,
      })
    },
    [isAuthenticated, persistRoutes, personalRoutes, savedRoutes],
  )

  const addPointToDraft = useCallback((point: NearbyPoint) => {
    const draftStopId = `${point.id}-draft-stop`
    setDraftState((currentState) => {
      const currentStops =
        currentState.pathname === location.pathname ? currentState.stops : []

      if (
        currentStops.length >= maxDraftStops ||
        currentStops.some((stop) => getSourcePointId(stop.id) === point.id)
      ) {
        return currentState
      }

      return {
        pathname: location.pathname,
        stops: [
          ...currentStops,
          createRouteStopFromPoint(point, currentStops.length + 1),
        ],
      }
    })
    void fetchPointDetailData(point.id).then((data) => {
      if (!data?.audioUrl) return
      setDraftState((currentState) => {
        const idx = currentState.stops.findIndex((s) => s.id === draftStopId)
        if (idx === -1) return currentState
        const updated = [...currentState.stops]
        updated[idx] = {
          ...updated[idx],
          audio: {
            ...updated[idx].audio,
            hasAudioGuide: true,
            audioGuideUrl: data.audioUrl,
            url: data.audioUrl,
            transcriptPreview: data.audioTranscript ?? updated[idx].audio.transcriptPreview,
          },
        }
        return { ...currentState, stops: updated }
      })
    })
  }, [location.pathname])

  const removeDraftStop = useCallback((stopId: string) => {
    setDraftState((currentState) => {
      const currentStops =
        currentState.pathname === location.pathname ? currentState.stops : []

      return {
        pathname: location.pathname,
        stops: currentStops
          .filter((stop) => stop.id !== stopId)
          .map((stop, index) => ({
            ...stop,
            order: index + 1,
          })),
      }
    })
  }, [location.pathname])

  const reorderDraftStops = useCallback((fromIndex: number, toIndex: number) => {
    setDraftState((currentState) => {
      const currentStops =
        currentState.pathname === location.pathname ? currentState.stops : []
      if (
        fromIndex === toIndex ||
        fromIndex < 0 || toIndex < 0 ||
        fromIndex >= currentStops.length || toIndex >= currentStops.length
      ) {
        return currentState
      }
      const reordered = [...currentStops]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      return {
        pathname: location.pathname,
        stops: reordered.map((stop, index) => ({ ...stop, order: index + 1 })),
      }
    })
  }, [location.pathname])

  const loadRouteForEditing = useCallback((route: Excursion) => {
    editingRouteSlugRef.current = route.slug
    setEditingRouteSlug(route.slug)
    setDraftState({
      pathname: appRoutes.excursions,
      stops: route.stops.map((stop, index) => ({ ...stop, order: index + 1 })),
    })
  }, [])

  const clearDraftRoute = useCallback(() => {
    const slug = editingRouteSlugRef.current
    if (slug) {
      editingRouteSlugRef.current = null
      setEditingRouteSlug(null)
      persistRoutes({
        personalRoutes: personalRoutes.filter((r) => r.slug !== slug),
        savedRoutes,
      })
    }
    setDraftState({
      pathname: location.pathname,
      stops: [],
    })
  }, [location.pathname, persistRoutes, personalRoutes, savedRoutes])

  const saveDraftRoute = useCallback(() => {
    if (draftStops.length < 2) {
      return {
        route: null,
        status: 'invalid' as const,
      }
    }

    const slug = editingRouteSlugRef.current
    const draftSignature = getRouteSignature(draftStops)

    if (slug) {
      // Edit mode: replace the original route
      const originalRoute = personalRoutes.find((r) => r.slug === slug)
      if (originalRoute && getRouteSignature(originalRoute.stops) === draftSignature) {
        // No changes — just exit edit mode without saving a duplicate
        editingRouteSlugRef.current = null
        setEditingRouteSlug(null)
        return { route: originalRoute, status: 'duplicate' as const }
      }

      const route = createPersonalRoute(draftStops)
      const nextPersonalRoutes = dedupeRoutes([
        route,
        ...personalRoutes.filter((r) => r.slug !== slug),
      ])
      editingRouteSlugRef.current = null
      setEditingRouteSlug(null)
      persistRoutes({ personalRoutes: nextPersonalRoutes, savedRoutes })
      void appApi.createPersonalRoute({ route })
      return { route, status: 'saved' as const }
    }

    const duplicateRoute = personalRoutes.find(
      (route) => getRouteSignature(route.stops) === draftSignature,
    )

    if (duplicateRoute) {
      return {
        route: duplicateRoute,
        status: 'duplicate' as const,
      }
    }

    const route = createPersonalRoute(draftStops)
    const nextPersonalRoutes = dedupeRoutes([route, ...personalRoutes])

    persistRoutes({
      personalRoutes: nextPersonalRoutes,
      savedRoutes,
    })
    void appApi.createPersonalRoute({ route })

    return {
      route,
      status: 'saved' as const,
    }
  }, [draftStops, persistRoutes, personalRoutes, savedRoutes])

  const shareRoute = useCallback(async (route: Excursion) => {
    const fallbackRouteUrl = `${window.location.origin}/excursions/${route.slug}`
    const routeUrl = await appApi
      .shareRoute({ slug: route.slug })
      .then((response) => response.url)
      .catch(() => fallbackRouteUrl)
    const shareData = {
      text: route.tagline,
      title: route.title,
      url: routeUrl,
    }

    if (navigator.share) {
      await navigator.share(shareData)
      return
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(routeUrl)
    }
  }, [])

  const value = useMemo(
    () => ({
      addPointToDraft,
      clearDraftRoute,
      draftStops,
      editingRouteSlug,
      isPointInDraft,
      isRouteSaved,
      loadRouteForEditing,
      personalRoutes,
      reorderDraftStops,
      removeDraftStop,
      removePersonalRoute,
      removeSavedRoute,
      saveDraftRoute,
      savedRoutes,
      shareRoute,
      toggleSavedRoute,
    }),
    [
      addPointToDraft,
      clearDraftRoute,
      draftStops,
      editingRouteSlug,
      isPointInDraft,
      isRouteSaved,
      loadRouteForEditing,
      personalRoutes,
      reorderDraftStops,
      removeDraftStop,
      removePersonalRoute,
      removeSavedRoute,
      saveDraftRoute,
      savedRoutes,
      shareRoute,
      toggleSavedRoute,
    ],
  )

  return (
    <UserRoutesContext.Provider value={value}>
      {children}
    </UserRoutesContext.Provider>
  )
}

function loadStoredRoutes(storageScope: string): StoredUserRoutes {
  if (typeof window === 'undefined') {
    return {
      personalRoutes: [],
      savedRoutes: [],
    }
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(storageScope))

    if (!rawValue) {
      return {
        personalRoutes: [],
        savedRoutes: [],
      }
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredUserRoutes>

    return {
      personalRoutes: Array.isArray(parsed.personalRoutes) ? parsed.personalRoutes : [],
      savedRoutes: Array.isArray(parsed.savedRoutes) ? parsed.savedRoutes : [],
    }
  } catch {
    return {
      personalRoutes: [],
      savedRoutes: [],
    }
  }
}

function writeStoredRoutes(storageScope: string, state: StoredUserRoutes) {
  try {
    window.localStorage.setItem(getStorageKey(storageScope), JSON.stringify(state))
  } catch {
    return
  }
}

function getStorageKey(storageScope: string) {
  return `${storageKeyPrefix}:${storageScope}`
}

function dedupeRoutes(routes: Excursion[]) {
  const seenSlugs = new Set<string>()

  return routes.filter((route) => {
    if (seenSlugs.has(route.slug)) {
      return false
    }

    seenSlugs.add(route.slug)
    return true
  })
}

function createRouteStopFromPoint(point: NearbyPoint, order: number): RouteStop {
  return {
    audio: createDraftAudio(point),
    category: point.category,
    coordinates: point.coordinates,
    description: point.description,
    distanceMeters: point.distanceMeters,
    expectedVisitMinutes: point.expectedVisitMinutes,
    id: `${point.id}-draft-stop`,
    imageUrl: point.imageUrl,
    order,
    rating: point.rating,
    scheduleLabel: point.scheduleLabel,
    shortDescription: point.shortDescription,
    title: point.title,
  }
}

function createDraftAudio(point: NearbyPoint): AudioStory {
  const hasAudio = Boolean(point.audioGuideUrl)
  return {
    hasAudioGuide: hasAudio,
    audioGuideUrl: point.audioGuideUrl ?? null,
    audioDuration: 90,
    audioLanguage: 'ru',
    durationSeconds: 90,
    id: `${point.id}-draft-audio`,
    language: 'ru',
    transcriptPreview: point.audioTranscript ?? `Короткий рассказ о точке «${point.title}» будет доступен во время прогулки.`,
    url: point.audioGuideUrl ?? null,
  }
}

function createPersonalRoute(stops: RouteStop[]): Excursion {
  const now = Date.now()
  const distanceKm = getRouteDistanceKm(stops.map((stop) => stop.coordinates))
  const visitMinutes = stops.reduce((total, stop) => total + stop.expectedVisitMinutes, 0)
  const transitMinutes = Math.max(8, Math.round(distanceKm * 12))
  const { tagline, title } = generatePersonalRouteName(stops)

  return {
    audienceLabel: 'Личный маршрут',
    coverImageUrl: stops[0]?.imageUrl ?? '',
    createdAt: new Date(now).toISOString(),
    description: 'Маршрут собран из выбранных мест рядом.',
    difficulty: getDifficultyByDistance(distanceKm),
    distanceKm,
    district: 'Личная подборка',
    durationMinutes: visitMinutes + transitMinutes,
    finishLabel: stops.at(-1)?.title ?? 'Финиш',
    id: now,
    routeColor: '#1f8a70',
    slug: `personal-${now}`,
    startLabel: stops[0]?.title ?? 'Старт',
    stops: stops.map((stop, index) => ({
      ...stop,
      id: `${stop.id}-${now}`,
      order: index + 1,
    })),
    tagline,
    theme: 'mixed',
    title,
  }
}

function getRouteDistanceKm(points: GeoPoint[]) {
  if (points.length < 2) {
    return 0
  }

  let distanceMeters = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    distanceMeters += getDistanceMetersBetween(points[index], points[index + 1])
  }

  return Number(Math.max(0.2, distanceMeters / 1000).toFixed(1))
}

function getRouteSignature(stops: RouteStop[]) {
  return stops
    .map((stop) => getSourcePointId(stop.id))
    .join('|')
}

function getSourcePointId(stopId: string) {
  return stopId.replace(/-draft-stop(?:-\d+)?$/, '')
}
