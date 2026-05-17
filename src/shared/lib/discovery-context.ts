import type {
  GeoPoint,
  PointCategory,
  SupportedLocale,
} from '@/entities/excursion/model/types'
import { appMapConfig } from '@/shared/config/map'
import { clampDiscoveryRadius } from '@/shared/lib/discovery-radius'

export interface DiscoveryContext {
  // Backend categoryId (number) or 'all'. Legacy slug strings are tolerated
  // for older sessions stored before the dynamic-category migration.
  activePointCategory: PointCategory | 'all' | number
  center: GeoPoint
  locale: SupportedLocale
  browserLocale: string
  radiusMeters: number
  updatedAt: string
}

const discoveryContextKey = 't-guide:discovery-context'
const legacyMoscowCenter: GeoPoint = { lat: 55.751244, lng: 37.618423 }
const legacyCenterTolerance = 0.00001

export function detectSupportedLocale(localeCandidate?: string): SupportedLocale {
  const normalizedLocale = (localeCandidate ?? '').toLowerCase()

  if (normalizedLocale.startsWith('ru')) {
    return 'ru'
  }

  if (normalizedLocale.startsWith('de')) {
    return 'de'
  }

  if (normalizedLocale.startsWith('fr')) {
    return 'fr'
  }

  if (normalizedLocale.startsWith('es')) {
    return 'es'
  }

  return 'en'
}

export function getDefaultDiscoveryContext(): DiscoveryContext {
  const browserLocale =
    typeof window === 'undefined'
      ? 'ru-RU'
      : navigator.languages?.[0] ?? navigator.language ?? 'ru-RU'

  return {
    activePointCategory: 'all',
    center: appMapConfig.defaultCenter,
    locale: detectSupportedLocale(browserLocale),
    browserLocale,
    radiusMeters: appMapConfig.discoveryRadiusMeters,
    updatedAt: new Date().toISOString(),
  }
}

export function getStoredDiscoveryContext(): DiscoveryContext {
  if (typeof window === 'undefined') {
    return getDefaultDiscoveryContext()
  }

  const defaultContext = getDefaultDiscoveryContext()
  const serializedValue = sessionStorage.getItem(discoveryContextKey)

  if (!serializedValue) {
    return defaultContext
  }

  try {
    const parsedValue = JSON.parse(serializedValue) as Partial<DiscoveryContext>

    const parsedCenter =
      parsedValue.center?.lat !== undefined && parsedValue.center?.lng !== undefined
        ? parsedValue.center
        : defaultContext.center

    return {
      activePointCategory: parsedValue.activePointCategory ?? defaultContext.activePointCategory,
      center: isLegacyMoscowCenter(parsedCenter) ? defaultContext.center : parsedCenter,
      locale: parsedValue.locale ?? defaultContext.locale,
      browserLocale: parsedValue.browserLocale ?? defaultContext.browserLocale,
      radiusMeters:
        typeof parsedValue.radiusMeters === 'number'
          ? clampDiscoveryRadius(parsedValue.radiusMeters)
          : defaultContext.radiusMeters,
      updatedAt: parsedValue.updatedAt ?? defaultContext.updatedAt,
    }
  } catch {
    return defaultContext
  }
}

function isLegacyMoscowCenter(center: GeoPoint) {
  return (
    Math.abs(center.lat - legacyMoscowCenter.lat) <= legacyCenterTolerance &&
    Math.abs(center.lng - legacyMoscowCenter.lng) <= legacyCenterTolerance
  )
}

export function saveDiscoveryContext(context: DiscoveryContext) {
  if (typeof window === 'undefined') {
    return
  }

  sessionStorage.setItem(discoveryContextKey, JSON.stringify(context))
}
