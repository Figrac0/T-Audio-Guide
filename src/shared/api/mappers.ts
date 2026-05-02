import type {
  Excursion,
  ExcursionTheme,
  NearbyPoint,
  PointCategory,
  RouteStop,
  SupportedLocale,
} from '@/entities/excursion/model/types'

// ── Swagger-accurate backend types ───────────────────────────────────────────

export interface ApiGeoPoint {
  latitude: number
  longitude: number
}

/** GET /points/search → PointListResponse.points[] */
export interface ApiPointShort {
  id: number
  title: string
  categoryId: number
  categoryName: string
  coordinates: ApiGeoPoint
  visitTime?: number
}

export interface ApiPointMedia {
  url: string
  type: string   // 'IMAGE' | 'VIDEO' | 'AUDIO'
  sortOrder: number
}

/** GET /points/{pointId} → PointDetailResponse */
export interface ApiPointDetail {
  id: number
  title: string
  description?: string
  categoryId: number
  categoryName: string
  address?: string
  coordinates: ApiGeoPoint
  visitTime?: number
  workingHours?: string
  media?: ApiPointMedia[]
}

/** POST /excursions/search → ExcursionListResponse.excursions[] */
export interface ApiExcursionShort {
  id: number
  routeType?: string
  visibility?: string
  owner?: boolean
  title: string
  description?: string
  shortDescription?: string
  distance?: number      // meters, int32
  durationMin?: number   // minutes, int32 — swagger field name
  pointsCount?: number   // swagger field name
  coordinates?: ApiGeoPoint
  categoryIds?: number[]
}

/**
 * Points inside ExcursionDetailResponse are PointShortItem (no description/image/address).
 * Swagger: excursionDetail.points = { points: PointShortItem[] } — double-nested wrapper.
 */
export interface ApiExcursionPoint extends ApiPointShort {
  order?: number
}

interface ApiExcursionPointsWrapper {
  points?: ApiExcursionPoint[]
}

/** GET /excursions/{excursionId} → ExcursionDetailResponse */
export interface ApiExcursionDetail extends ApiExcursionShort {
  duration?: number     // alternative field name in detail response
  // swagger: points is { points: PointShortItem[] } — double-nested wrapper
  points?: ApiExcursionPointsWrapper | ApiExcursionPoint[]
}

export interface ApiCategory {
  id: number
  name: string
  slug: string
}

/** Response wrappers */
export interface ApiPointListResponse {
  points: ApiPointShort[]
}

export interface ApiExcursionListResponse {
  excursions: ApiExcursionShort[]
}

export interface ApiCategoryListResponse {
  categories: ApiCategory[]
}

// ── Category name → frontend PointCategory ───────────────────────────────────

const categoryNameMap: Record<string, PointCategory> = {
  // English slugs (direct match)
  museum: 'museum',
  food: 'food',
  park: 'park',
  entertainment: 'entertainment',
  landmark: 'landmark',
  // Common English variants
  gallery: 'museum',
  restaurant: 'food',
  cafe: 'food',
  garden: 'park',
  nature: 'park',
  theater: 'entertainment',
  cinema: 'entertainment',
  monument: 'landmark',
  attraction: 'landmark',
  // Russian names
  музей: 'museum',
  галерея: 'museum',
  выставка: 'museum',
  ресторан: 'food',
  кафе: 'food',
  еда: 'food',
  парк: 'park',
  сад: 'park',
  природа: 'park',
  развлечения: 'entertainment',
  театр: 'entertainment',
  кино: 'entertainment',
  достопримечательность: 'landmark',
  памятник: 'landmark',
  монумент: 'landmark',
}

export function mapCategoryName(name: string): PointCategory {
  return categoryNameMap[name.toLowerCase()] ?? 'landmark'
}

// ── Haversine distance (meters) ──────────────────────────────────────────────

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Media helpers ────────────────────────────────────────────────────────────

function getImageUrl(media?: ApiPointMedia[]): string {
  if (!media?.length) return ''
  const img = media.find((m) => /^image|^photo/i.test(m.type ?? ''))
  return img?.url ?? media[0]?.url ?? ''
}

// ── Theme inference ──────────────────────────────────────────────────────────

function inferTheme(title: string, description: string): ExcursionTheme {
  const text = `${title} ${description}`.toLowerCase()
  if (/еда|ресторан|кафе|гастро|вкус|food|eat/.test(text)) return 'food'
  if (/природ|парк|лес|сад|зелен|park|nature/.test(text)) return 'nature'
  if (/развлечен|квест|аттракцион|fun/.test(text)) return 'fun'
  if (/музей|храм|монумент|история|культур|walk/.test(text)) return 'walk'
  return 'mixed'
}

// ── NearbyPoint mappers ──────────────────────────────────────────────────────

export function mapNearbyPointFromShort(
  point: ApiPointShort,
  centerLat: number,
  centerLng: number,
): NearbyPoint {
  return {
    id: String(point.id),
    title: point.title,
    category: mapCategoryName(point.categoryName),
    shortDescription: '',
    description: '',
    coordinates: { lat: point.coordinates.latitude, lng: point.coordinates.longitude },
    imageUrl: '',
    expectedVisitMinutes: point.visitTime ?? 30,
    rating: 0,
    scheduleLabel: '',
    distanceMeters: haversineDistance(
      centerLat,
      centerLng,
      point.coordinates.latitude,
      point.coordinates.longitude,
    ),
    addressLabel: undefined,
    audioGuideUrl: null,
  }
}

export function mapNearbyPointFromDetail(
  point: ApiPointDetail,
  centerLat: number,
  centerLng: number,
): NearbyPoint {
  return {
    id: String(point.id),
    title: point.title,
    category: mapCategoryName(point.categoryName),
    shortDescription: point.description ?? '',
    description: point.description ?? '',
    coordinates: { lat: point.coordinates.latitude, lng: point.coordinates.longitude },
    imageUrl: getImageUrl(point.media),
    expectedVisitMinutes: point.visitTime ?? 30,
    rating: 0,
    scheduleLabel: point.workingHours ?? '',
    distanceMeters: haversineDistance(
      centerLat,
      centerLng,
      point.coordinates.latitude,
      point.coordinates.longitude,
    ),
    addressLabel: point.address,
    audioGuideUrl: null,
  }
}

// ── RouteStop mapper ─────────────────────────────────────────────────────────

export function mapRouteStopFromApiPoint(
  point: ApiExcursionPoint,
  index: number,
  locale: SupportedLocale = 'ru',
): RouteStop {
  const order = point.order != null ? point.order + 1 : index + 1
  return {
    id: String(point.id),
    order,
    title: point.title,
    category: mapCategoryName(point.categoryName),
    shortDescription: '',
    description: '',
    coordinates: { lat: point.coordinates.latitude, lng: point.coordinates.longitude },
    imageUrl: '',
    expectedVisitMinutes: point.visitTime ?? 30,
    rating: 0,
    scheduleLabel: '',
    audio: {
      id: String(point.id),
      hasAudioGuide: false,
      audioGuideUrl: null,
      audioDuration: 0,
      audioLanguage: locale,
      url: null,
      durationSeconds: 0,
      language: locale,
      transcriptPreview: '',
    },
  }
}

// ── Excursion mappers ────────────────────────────────────────────────────────

export function mapExcursionFromShort(exc: ApiExcursionShort): Excursion {
  const theme = inferTheme(exc.title, exc.description ?? exc.shortDescription ?? '')
  return {
    id: exc.id,
    slug: `excursion-${exc.id}`,
    createdAt: new Date().toISOString(),
    title: exc.title,
    tagline: exc.shortDescription ?? '',
    description: exc.description ?? '',
    theme,
    district: '',
    durationMinutes: exc.durationMin ?? 60,
    distanceKm: (exc.distance ?? 0) / 1000,
    startLabel: '',
    finishLabel: '',
    coverImageUrl: '',
    routeColor: '#0f766e',
    difficulty: 'easy',
    audienceLabel: 'Все',
    stops: [],
  }
}

function resolveExcursionPoints(raw: ApiExcursionDetail['points']): ApiExcursionPoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  // Swagger shows "object" — backend might wrap as {points: [...]}
  const wrapped = (raw as { points?: ApiExcursionPoint[] }).points
  return Array.isArray(wrapped) ? wrapped : []
}

export function mapExcursionFromDetail(
  exc: ApiExcursionDetail,
  locale: SupportedLocale = 'ru',
): Excursion {
  const base = mapExcursionFromShort({
    ...exc,
    durationMin: exc.durationMin ?? exc.duration,
  })
  const rawPoints = resolveExcursionPoints(exc.points)
  const stops: RouteStop[] = rawPoints
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p, i) => mapRouteStopFromApiPoint(p, i, locale))

  return {
    ...base,
    startLabel: stops[0]?.title ?? '',
    finishLabel: stops[stops.length - 1]?.title ?? '',
    stops,
  }
}
