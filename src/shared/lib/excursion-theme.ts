import type {
  Excursion,
  ExcursionTheme,
  PointCategory,
  RouteStop,
} from '@/entities/excursion/model/types'

type CategoryStop = { category: PointCategory }

function categoryCounts(stops: ReadonlyArray<CategoryStop>): Record<PointCategory, number> {
  const counts: Record<PointCategory, number> = {
    museum: 0,
    food: 0,
    park: 0,
    entertainment: 0,
    landmark: 0,
  }
  for (const stop of stops) {
    counts[stop.category] += 1
  }
  return counts
}

function distinctCategoryCount(stops: ReadonlyArray<CategoryStop>): number {
  return new Set(stops.map((stop) => stop.category)).size
}

/**
 * The single badge theme for a route, derived from its stops' categories.
 * The text-based heuristic used before mislabelled routes (e.g. an all-
 * entertainment route showing as "Прогулка"); this looks at what the route
 * actually contains.
 *
 * Priority — first match wins (kept aligned with the filter predicates
 * below so a route's badge is always reachable through a filter chip):
 *  1. mixed  — 4+ distinct categories ("много разных категорий")
 *  2. fun    — has at least one entertainment stop
 *  3. nature — has at least one park stop
 *  4. food   — has 2+ food stops
 *  5. walk   — default (a general stroll)
 */
export function deriveExcursionTheme(stops: ReadonlyArray<RouteStop>): ExcursionTheme {
  if (stops.length === 0) return 'walk'

  const counts = categoryCounts(stops)

  if (distinctCategoryCount(stops) >= 4) return 'mixed'
  if (counts.entertainment >= 1) return 'fun'
  if (counts.park >= 1) return 'nature'
  if (counts.food >= 2) return 'food'
  return 'walk'
}

/**
 * Whether a route matches a theme filter chip. Filters are independent
 * predicates over the route's stops — a route can match several at once:
 *  - walk   — more than 4 stops
 *  - food   — at least 2 food stops
 *  - nature — at least 1 park stop
 *  - fun    — at least 1 entertainment stop
 *  - mixed  — 4+ distinct point categories
 *
 * When the route has no loaded stops (e.g. a list response that omitted the
 * point array) it falls back to matching the route's derived badge theme.
 */
export function matchesExcursionThemeFilter(
  excursion: Excursion,
  theme: ExcursionTheme | 'all',
): boolean {
  if (theme === 'all') return true

  const stops = excursion.stops
  if (stops.length === 0) {
    return excursion.theme === theme
  }

  const counts = categoryCounts(stops)
  switch (theme) {
    case 'walk':
      return stops.length > 4
    case 'food':
      return counts.food >= 2
    case 'nature':
      return counts.park >= 1
    case 'fun':
      return counts.entertainment >= 1
    case 'mixed':
      return distinctCategoryCount(stops) >= 4
    default:
      return false
  }
}
