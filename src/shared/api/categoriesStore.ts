import { useEffect, useState } from 'react'

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
let cachedCategoriesValue: ApiCategory[] | null = null
const categoriesSubscribers = new Set<(list: ApiCategory[]) => void>()

function loadCategoriesOnce(): Promise<ApiCategory[]> {
  if (!cachedCategoriesPromise) {
    cachedCategoriesPromise = pointsService
      .getCategories()
      .then((list) => {
        cachedCategoriesValue = list
        for (const sub of categoriesSubscribers) sub(list)
        return list
      })
      .catch((error) => {
        cachedCategoriesPromise = null
        throw error
      })
  }
  return cachedCategoriesPromise
}

// Synchronous lookup map: backend categoryId → frontend slug. Populated as
// soon as the categories list resolves so non-React code (e.g. mappers) can
// derive icons without awaiting.
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
 * React hook that returns the backend category list. Re-renders consumers
 * once data loads. Categories are fetched ONCE per session and shared.
 */
export function useCategories(): { categories: ApiCategory[]; isLoading: boolean } {
  const [categories, setCategories] = useState<ApiCategory[]>(
    () => cachedCategoriesValue ?? [],
  )
  const [isLoading, setIsLoading] = useState(() => cachedCategoriesValue == null)

  useEffect(() => {
    let active = true
    if (cachedCategoriesValue != null) {
      // Already cached — no work needed
      queueMicrotask(() => {
        if (!active || cachedCategoriesValue == null) return
        setCategories(cachedCategoriesValue)
        setIsLoading(false)
      })
    } else {
      void loadCategoriesOnce()
        .then((list) => {
          if (!active) return
          setCategories(list)
        })
        .catch(() => {
          if (!active) return
          // Leave categories empty — UI should handle the empty case gracefully
        })
        .finally(() => {
          if (active) setIsLoading(false)
        })
    }

    // Subscribe so consumers re-render if the store updates after admin CRUD
    const onUpdate = (list: ApiCategory[]) => {
      if (active) setCategories(list)
    }
    categoriesSubscribers.add(onUpdate)
    return () => {
      active = false
      categoriesSubscribers.delete(onUpdate)
    }
  }, [])

  return { categories, isLoading }
}

/**
 * Best-effort slug→ids resolver, kept for backwards compatibility with the
 * old hardcoded category filter pipeline. New code should use the backend
 * category IDs directly via useCategories().
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
