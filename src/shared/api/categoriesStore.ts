import type { PointCategory } from '@/entities/excursion/model/types'
import {
  type ApiCategory,
  mapCategoryFromBackend,
  mapCategoryName,
} from '@/shared/api/mappers'
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

// Synchronous lookup map: backend categoryId → frontend slug. Populated when
// the categories list resolves; used by mappers that already have an id in
// hand (e.g. PointShortItem.categoryId) and want to avoid async lookups.
const categoryIdToSlug = new Map<number, PointCategory>()

void loadCategoriesOnce()
  .then((categories) => {
    for (const c of categories) {
      categoryIdToSlug.set(c.id, mapCategoryFromBackend(c))
    }
  })
  .catch(() => {
    /* swallow — fallback path uses mapCategoryName at call sites */
  })

export function getCategorySlugById(id: number | null | undefined): PointCategory | null {
  if (id == null) return null
  return categoryIdToSlug.get(id) ?? null
}

/**
 * Resolve a frontend category slug (e.g. 'museum') to all backend category IDs.
 * Matching priority:
 *   1. Direct slug match against backend's `slug` field (e.g. backend slug
 *      "museum" → frontend slug 'museum'). Most reliable, language-agnostic.
 *   2. Fallback: match by localized name through the legacy `categoryNameMap`
 *      lookup table — needed if the backend ships categories without a
 *      matching slug.
 *
 * Returns empty array on fetch failure — caller should treat that as
 * "no filter" and fetch all points.
 */
export async function getCategoryIdsForSlug(slug: PointCategory): Promise<number[]> {
  try {
    const categories = await loadCategoriesOnce()
    const matched = categories.filter(
      (c) => c.slug === slug || mapCategoryName(c.name) === slug,
    )
    return matched.map((c) => c.id)
  } catch {
    return []
  }
}

export function getCachedCategoriesPromise(): Promise<ApiCategory[]> {
  return loadCategoriesOnce()
}
