export type SupportedLocale = 'ru' | 'en' | 'de' | 'fr' | 'es'
export type ExcursionDifficulty = 'easy' | 'medium' | 'hard'
export type ExcursionTheme = 'walk' | 'food' | 'nature' | 'fun' | 'mixed'
export type PointCategory =
  | 'museum'
  | 'food'
  | 'park'
  | 'entertainment'
  | 'landmark'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface AudioStory {
  id: string
  hasAudioGuide: boolean
  audioGuideUrl: string | null
  audioDuration: number
  audioLanguage: SupportedLocale
  url: string | null
  durationSeconds: number
  language: SupportedLocale
  transcriptPreview: string
}

export interface RouteStop {
  id: string
  order: number
  title: string
  category: PointCategory
  // Exact backend category name ("Музеи", "Исторические места"). The `category`
  // enum above is a best-effort bucket for icon selection; this preserves the
  // admin-chosen label verbatim for display.
  categoryName?: string
  shortDescription: string
  description: string
  coordinates: GeoPoint
  imageUrl: string
  expectedVisitMinutes: number
  rating: number
  scheduleLabel: string
  audio: AudioStory
}

export interface NearbyPoint {
  id: string
  title: string
  category: PointCategory
  // Exact backend category name — see RouteStop.categoryName.
  categoryName?: string
  shortDescription: string
  description: string
  coordinates: GeoPoint
  imageUrl: string
  expectedVisitMinutes: number
  rating: number
  scheduleLabel: string
  distanceMeters: number
  addressLabel?: string
  googleMapsUrl?: string
  audioGuideUrl: string | null
  audioTranscript?: string | null
}

export interface Excursion {
  id: number
  slug: string
  createdAt: string
  title: string
  tagline: string
  description: string
  theme: ExcursionTheme
  district: string
  durationMinutes: number
  distanceKm: number
  // Stop count from the list endpoint (which omits the point array). Cards use
  // it as a fallback when `stops` hasn't been hydrated from the detail call.
  pointsCount?: number
  startLabel: string
  finishLabel: string
  coverImageUrl: string
  routeColor: string
  difficulty: ExcursionDifficulty
  audienceLabel: string
  stops: RouteStop[]
}
