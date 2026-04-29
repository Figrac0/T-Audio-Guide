import { useSyncExternalStore } from 'react'

import type { Excursion } from '@/entities/excursion/model/types'

export const lastRoutesStorageKey = 'lastRoutes'
const lastRoutesChangedEvent = 't-guide:last-routes-changed'
const maxLastRoutesCount = 3

export interface LastRouteItem {
  id: string
  title: string
  totalPoints: number
  completedPoints: number
  isCompleted: boolean
  updatedAt: string
}

const emptySnapshot: LastRouteItem[] = []
let cachedRawValue: string | null = null
let cachedSnapshot: LastRouteItem[] = emptySnapshot

export function useLastRoutes() {
  return useSyncExternalStore(
    subscribeToLastRoutes,
    readLastRoutes,
    getServerSnapshot,
  )
}

export function startLastRoute(route: Excursion) {
  writeLastRoute({
    completedPoints: 0,
    isCompleted: false,
    route,
  })
}

export function updateLastRouteProgress(route: Excursion, completedPoints: number) {
  const existingRoute = readLastRoutes().find((item) => item.id === route.slug)
  const safeCompletedPoints = clampCompletedPoints(
    Math.max(existingRoute?.completedPoints ?? 0, completedPoints),
    route.stops.length,
  )

  writeLastRoute({
    completedPoints: safeCompletedPoints,
    isCompleted: safeCompletedPoints >= route.stops.length,
    route,
  })
}

export function completeLastRoute(route: Excursion) {
  writeLastRoute({
    completedPoints: route.stops.length,
    isCompleted: true,
    route,
  })
}

function writeLastRoute({
  completedPoints,
  isCompleted,
  route,
}: {
  completedPoints: number
  isCompleted: boolean
  route: Excursion
}) {
  if (typeof window === 'undefined') {
    return
  }

  const nextRoute: LastRouteItem = {
    completedPoints: clampCompletedPoints(completedPoints, route.stops.length),
    id: route.slug,
    isCompleted,
    title: route.title,
    totalPoints: route.stops.length,
    updatedAt: new Date().toISOString(),
  }
  const nextRoutes = [
    nextRoute,
    ...readLastRoutes().filter((item) => item.id !== nextRoute.id),
  ].slice(0, maxLastRoutesCount)

  try {
    window.localStorage.setItem(lastRoutesStorageKey, JSON.stringify(nextRoutes))
    cachedRawValue = null
    window.dispatchEvent(new Event(lastRoutesChangedEvent))
  } catch {
    return
  }
}

function subscribeToLastRoutes(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === lastRoutesStorageKey) {
      listener()
    }
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(lastRoutesChangedEvent, listener)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(lastRoutesChangedEvent, listener)
  }
}

function readLastRoutes(): LastRouteItem[] {
  if (typeof window === 'undefined') {
    return emptySnapshot
  }

  const rawValue = window.localStorage.getItem(lastRoutesStorageKey)

  if (rawValue === cachedRawValue) {
    return cachedSnapshot
  }

  cachedRawValue = rawValue
  cachedSnapshot = parseLastRoutes(rawValue)
  return cachedSnapshot
}

function parseLastRoutes(rawValue: string | null): LastRouteItem[] {
  if (!rawValue) {
    return emptySnapshot
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown

    if (!Array.isArray(parsed)) {
      return emptySnapshot
    }

    return parsed
      .flatMap((item) => {
        const route = parseLastRouteItem(item)
        return route ? [route] : []
      })
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      .slice(0, maxLastRoutesCount)
  } catch {
    return emptySnapshot
  }
}

function parseLastRouteItem(item: unknown): LastRouteItem | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const candidate = item as Partial<LastRouteItem>

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.totalPoints !== 'number' ||
    typeof candidate.completedPoints !== 'number' ||
    typeof candidate.isCompleted !== 'boolean' ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return null
  }

  const totalPoints = Math.max(0, Math.floor(candidate.totalPoints))
  const completedPoints = candidate.isCompleted
    ? totalPoints
    : clampCompletedPoints(candidate.completedPoints, totalPoints)

  return {
    completedPoints,
    id: candidate.id,
    isCompleted: candidate.isCompleted,
    title: candidate.title,
    totalPoints,
    updatedAt: candidate.updatedAt,
  }
}

function clampCompletedPoints(completedPoints: number, totalPoints: number) {
  return Math.min(
    Math.max(0, Math.floor(completedPoints)),
    Math.max(0, Math.floor(totalPoints)),
  )
}

function getServerSnapshot() {
  return emptySnapshot
}
