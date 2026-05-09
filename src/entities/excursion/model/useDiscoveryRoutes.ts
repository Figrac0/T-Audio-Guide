import { useEffect, useState } from 'react'

import type {
  Excursion,
  GeoPoint,
  NearbyPoint,
  PointCategory,
  SupportedLocale,
} from '@/entities/excursion/model/types'
import { appApi } from '@/shared/api/client'

interface UseDiscoveryRoutesParams {
  activePointCategory: PointCategory | 'all'
  center: GeoPoint
  enabled?: boolean
  locale: SupportedLocale
  radiusMeters: number
  search?: string
}

// Compare two NearbyPoint objects for content equality. If equal, the previous
// object reference can be reused to avoid triggering child re-renders/image reloads.
function nearbyPointsEqual(a: NearbyPoint, b: NearbyPoint): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.category === b.category &&
    a.distanceMeters === b.distanceMeters &&
    a.coordinates.lat === b.coordinates.lat &&
    a.coordinates.lng === b.coordinates.lng &&
    a.imageUrl === b.imageUrl &&
    a.shortDescription === b.shortDescription &&
    a.description === b.description &&
    a.rating === b.rating &&
    a.expectedVisitMinutes === b.expectedVisitMinutes &&
    a.scheduleLabel === b.scheduleLabel &&
    a.audioGuideUrl === b.audioGuideUrl
  )
}

function excursionsEqual(a: Excursion, b: Excursion): boolean {
  return (
    a.id === b.id &&
    a.slug === b.slug &&
    a.title === b.title &&
    a.theme === b.theme &&
    a.durationMinutes === b.durationMinutes &&
    a.distanceKm === b.distanceKm &&
    a.difficulty === b.difficulty &&
    a.coverImageUrl === b.coverImageUrl &&
    a.routeColor === b.routeColor &&
    a.stops.length === b.stops.length &&
    a.stops.every((stop, i) => stop.id === b.stops[i]?.id)
  )
}

// Stabilize array references when content is unchanged. Mock API rebuilds
// every object on every call, so without this every zoom/radius update would
// fan out into list re-mounts, image reloads, and marker icon swaps.
function stabilizeArray<T extends { id: string | number }>(
  prev: T[],
  next: T[],
  isEqual: (a: T, b: T) => boolean,
): T[] {
  if (prev.length === 0) return next
  const prevById = new Map<string | number, T>(prev.map((item) => [item.id, item]))
  const reused = next.map((nextItem) => {
    const prevItem = prevById.get(nextItem.id)
    return prevItem && isEqual(prevItem, nextItem) ? prevItem : nextItem
  })
  if (
    reused.length === prev.length &&
    reused.every((item, i) => item === prev[i])
  ) {
    return prev
  }
  return reused
}

export function useDiscoveryRoutes({
  activePointCategory,
  center,
  enabled = true,
  locale,
  radiusMeters,
  search,
}: UseDiscoveryRoutesParams) {
  const [nearbyPoints, setNearbyPoints] = useState<NearbyPoint[]>([])
  const [excursions, setExcursions] = useState<Excursion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setNearbyPoints([])
      setExcursions([])
      setIsLoading(false)
      setError(null)
      return undefined
    }

    // Set loading immediately on dep change — not after the debounce. This
    // signals to consumers (DiscoveryMap guide-route effect) that the current
    // nearbyPoints data is potentially stale: any route built right now would
    // use coordinates from the previous fetch, which is exactly what causes
    // the "route to old point location" bug after toggling manual position.
    setIsLoading(true)
    setError(null)

    let isActive = true

    // Debounce: wait 300 ms before firing the API call so rapid radius changes
    // from scroll events don't flood the network.
    const debounceTimer = setTimeout(() => {
      async function loadDiscoveryFeed() {
        try {
          const response = await appApi.getDiscoveryFeed({
            category: activePointCategory,
            center,
            locale,
            radiusMeters,
            search,
          })

          if (!isActive) {
            return
          }

          setNearbyPoints((prev) =>
            stabilizeArray(prev, response.nearbyPoints, nearbyPointsEqual),
          )
          setExcursions((prev) =>
            stabilizeArray(prev, response.excursions, excursionsEqual),
          )
        } catch (loadError) {
          if (!isActive) {
            return
          }

          console.error(loadError)
          setNearbyPoints([])
          setExcursions([])
          setError('Не удалось загрузить данные для экрана.')
        } finally {
          if (isActive) {
            setIsLoading(false)
          }
        }
      }

      void loadDiscoveryFeed()
    }, 300)

    return () => {
      isActive = false
      clearTimeout(debounceTimer)
    }
  }, [activePointCategory, center, enabled, locale, radiusMeters, search])

  return {
    error,
    excursions,
    isLoading,
    nearbyPoints,
  }
}
