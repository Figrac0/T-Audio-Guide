import { useEffect, useRef, useState } from 'react'

import { pointsService } from '@/shared/api/pointsService'
import {
  type ApiPointDetail,
  type ApiPointMedia,
  mapNearbyPointFromDetail,
} from '@/shared/api/mappers'
import type { NearbyPoint } from '@/entities/excursion/model/types'

interface PointDetail extends NearbyPoint {
  // Raw photo url (first PHOTO from media[], sorted by sortOrder)
  photoUrl: string | null
  // Raw audio url (first AUDIO from media[])
  audioUrl: string | null
  // Transcript from the first AUDIO media (if any)
  audioTranscript: string | null
}

// Session-level cache of fetched details. /points/{id} is essentially static
// for a given user session — once we know the description and media URLs,
// no reason to re-fetch on every selection.
const detailCache = new Map<string, PointDetail>()

function pickFirst(media: ApiPointMedia[] | undefined, predicate: (m: ApiPointMedia) => boolean) {
  if (!media?.length) return undefined
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder).find(predicate)
}

function toPointDetail(detail: ApiPointDetail, centerLat: number, centerLng: number): PointDetail {
  const photo = pickFirst(detail.media, (m) => /^image|^photo/i.test(m.type))
  const audio = pickFirst(detail.media, (m) => /^audio/i.test(m.type))
  const base = mapNearbyPointFromDetail(detail, centerLat, centerLng)
  return {
    ...base,
    photoUrl: photo?.url ?? null,
    audioUrl: audio?.url ?? null,
    audioTranscript: audio?.transcript ?? null,
  }
}

/**
 * Fetches full point detail (description, address, media) for a selected
 * point. Falls through to whatever PointShortItem data we already have from
 * the search response while the detail request is in flight, so the UI never
 * shows an empty card.
 */
export function usePointDetail(
  pointId: string | null | undefined,
  fallback: NearbyPoint | null,
  centerLat: number,
  centerLng: number,
): NearbyPoint & {
  photoUrl: string | null
  audioUrl: string | null
  audioTranscript: string | null
} | null {
  // Seed with cache if we already have detail for this id; otherwise null.
  const cached = pointId ? detailCache.get(pointId) ?? null : null
  const [detail, setDetail] = useState<PointDetail | null>(cached)
  // Track the last id we fetched for, so when id changes we clear stale data.
  const lastFetchedRef = useRef<string | null>(cached?.id ?? null)

  useEffect(() => {
    if (!pointId) {
      setDetail(null)
      lastFetchedRef.current = null
      return
    }

    // Cache hit — surface immediately, no network call.
    const fromCache = detailCache.get(pointId)
    if (fromCache) {
      setDetail(fromCache)
      lastFetchedRef.current = pointId
      return
    }

    // Cache miss — clear stale detail, fetch fresh.
    if (lastFetchedRef.current !== pointId) {
      setDetail(null)
      lastFetchedRef.current = pointId
    }

    let active = true
    const numericId = Number(pointId)
    if (!Number.isFinite(numericId)) return

    pointsService
      .getPointDetail(numericId)
      .then((response) => {
        if (!active) return
        const next = toPointDetail(response, centerLat, centerLng)
        detailCache.set(pointId, next)
        setDetail(next)
      })
      .catch(() => {
        // Silently ignore — the UI will keep using the search-result fallback.
      })

    return () => {
      active = false
    }
  }, [pointId, centerLat, centerLng])

  if (!pointId) return null

  // Prefer the detail when available, otherwise fall back to the short-item
  // data so the card has SOMETHING to render (title, shortDescription).
  if (detail) return detail
  if (fallback) {
    return {
      ...fallback,
      photoUrl: null,
      audioUrl: null,
      audioTranscript: null,
    }
  }
  return null
}
