import { useEffect, useMemo, useState } from 'react'

import { adminService } from '@/shared/api/adminService'
import type { ApiPointDetail, ApiPointMedia } from '@/shared/api/mappers'
import { pointsService } from '@/shared/api/pointsService'

export interface PointDetailData {
  description: string
  shortDescription: string
  imageUrl: string
  audioUrl: string | null
  audioTranscript: string | null
  address: string
  workingHours: string
}

// Session-level cache of /points/{id} detail. The endpoint is effectively
// static for a session, so once fetched we never re-request.
const cache = new Map<string, PointDetailData>()
const inflight = new Map<string, Promise<PointDetailData | null>>()

function pickFirstMedia(
  media: ApiPointMedia[] | undefined,
  predicate: (item: ApiPointMedia) => boolean,
) {
  if (!media?.length) return undefined
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder).find(predicate)
}

export function extractPointDetailData(detail: ApiPointDetail): PointDetailData {
  const photo = pickFirstMedia(detail.media, (item) => /photo|image/i.test(item.type ?? ''))
  const audio = pickFirstMedia(detail.media, (item) => /audio/i.test(item.type ?? ''))
  return {
    description: detail.description ?? '',
    shortDescription: detail.shortDescription ?? '',
    imageUrl: photo?.url ?? '',
    audioUrl: audio?.url ?? null,
    audioTranscript: audio?.transcript ?? null,
    address: detail.address ?? '',
    workingHours: detail.workingHours ?? '',
  }
}

// Draft-stop ids carry a "-draft-stop" suffix; the backend point id is the
// numeric prefix. Both prebuilt and user-built routes resolve through this.
export function toBackendPointId(id: string): string {
  return id.replace(/-draft-stop(?:-\d+)?$/, '')
}

export function fetchPointDetailData(id: string): Promise<PointDetailData | null> {
  const cached = cache.get(id)
  if (cached) return Promise.resolve(cached)

  const existing = inflight.get(id)
  if (existing) return existing

  const numericId = Number(id)
  if (!Number.isFinite(numericId)) return Promise.resolve(null)

  // Admin endpoint returns the full detail including workingHours; public
  // endpoint may omit it. Try admin first, fall back to public for non-admins.
  const promise = (async (): Promise<PointDetailData | null> => {
    try {
      const response = await adminService.getPoint(numericId)
      const data = extractPointDetailData(response)
      cache.set(id, data)
      return data
    } catch {
      try {
        const response = await pointsService.getPointDetail(numericId)
        const data = extractPointDetailData(response)
        cache.set(id, data)
        return data
      } catch {
        return null
      }
    } finally {
      inflight.delete(id)
    }
  })()

  inflight.set(id, promise)
  return promise
}

/**
 * Backfills full point detail (description + photo/audio media) for a set of
 * points. Search and excursion-detail endpoints only return PointShortItem
 * (no full description, no media), so list cards and detail panels rely on
 * this hook to show real uploaded photos and the full description.
 */
export function usePointDetailsMap(ids: string[]): Map<string, PointDetailData> {
  const [version, forceUpdate] = useState(0)
  const backendIds = useMemo(
    () => Array.from(new Set(ids.map(toBackendPointId).filter(Boolean))),
    [ids],
  )
  const idsKey = useMemo(() => backendIds.slice().sort().join(','), [backendIds])

  useEffect(() => {
    let isActive = true
    const missing = backendIds.filter(
      (id) => !cache.has(id) && Number.isFinite(Number(id)),
    )
    if (missing.length === 0) return

    void Promise.all(missing.map(fetchPointDetailData)).then(() => {
      if (isActive) forceUpdate((value) => value + 1)
    })

    return () => {
      isActive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  return useMemo(() => {
    const map = new Map<string, PointDetailData>()
    for (const id of backendIds) {
      const data = cache.get(id)
      if (data) map.set(id, data)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, version])
}
