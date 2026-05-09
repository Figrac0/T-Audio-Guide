import type { PointCategory } from '@/entities/excursion/model/types'
import { type ApiCategory, mapCategoryName } from '@/shared/api/mappers'
import { pointsService } from '@/shared/api/pointsService'

// Module-level cache: backend categories are static enough that one fetch per
// session is enough. The promise pattern ensures concurrent callers share the
// same in-flight request instead of issuing duplicates.
let cachedCategoriesPromise: Promise<ApiCategory[]> | null = null

function loadCategoriesOnce(): Promise<ApiCategory[]> {
  if (!cachedCategoriesPromise) {
    cachedCategoriesPromise = pointsService.getCategories().catch((error) => {
      // Reset cache on failure so the next call retries instead of being stuck
      // on a permanent rejection.
      cachedCategoriesPromise = null
      throw error
    })
  }
  return cachedCategoriesPromise
}

/**
 * Resolve a frontend category slug (e.g. 'museum') to all backend category IDs
 * whose name maps to that slug. A single frontend slug can fan out to multiple
 * backend categories (e.g. 'museum' covers both "Музей" and "Галерея").
 *
 * Returns empty array on fetch failure — caller should treat that as
 * "no filter" and fetch all points.
 */
export async function getCategoryIdsForSlug(slug: PointCategory): Promise<number[]> {
  try {
    const categories = await loadCategoriesOnce()
    return categories.filter((c) => mapCategoryName(c.name) === slug).map((c) => c.id)
  } catch {
    return []
  }
}

export function getCachedCategoriesPromise(): Promise<ApiCategory[]> {
  return loadCategoriesOnce()
}
