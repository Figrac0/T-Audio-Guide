import type {
  ExcursionDifficulty,
  ExcursionTheme,
  GeoPoint,
  PointCategory,
  SupportedLocale,
} from '@/entities/excursion/model/types'

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} мин`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (!minutes) {
    return `${hours} ч`
  }

  return `${hours} ч ${minutes} мин`
}

export function formatDistance(distanceKm: number): string {
  return `${distanceKm.toFixed(1).replace('.', ',')} км`
}

export function formatStopCount(count: number): string {
  const lastDigit = count % 10
  const lastTwoDigits = count % 100

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${count} точка`
  }

  if (
    lastDigit >= 2 &&
    lastDigit <= 4 &&
    !(lastTwoDigits >= 12 && lastTwoDigits <= 14)
  ) {
    return `${count} точки`
  }

  return `${count} точек`
}

export function formatDifficulty(difficulty: ExcursionDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return 'Легко'
    case 'medium':
      return 'Средне'
    case 'hard':
      return 'Сложно'
    default:
      return 'Маршрут'
  }
}

export function formatTheme(theme: ExcursionTheme): string {
  switch (theme) {
    case 'walk':
      return 'Прогулка'
    case 'food':
      return 'Еда'
    case 'nature':
      return 'Природа'
    case 'fun':
      return 'Развлечения'
    case 'mixed':
      return 'Разное'
    default:
      return 'Маршрут'
  }
}

export function formatPointCategory(category: PointCategory): string {
  switch (category) {
    case 'museum':
      return 'Музей'
    case 'food':
      return 'Еда'
    case 'park':
      return 'Природа'
    case 'entertainment':
      return 'Развлечения'
    case 'landmark':
      return 'История'
    default:
      return 'Точка'
  }
}

// Prefer the verbatim backend category name when available — the `category`
// enum only has 5 buckets, so admin-created categories without a verbatim
// dictionary match all collapse to "История". Falls back to the enum label
// for mock data / points that carry no categoryName.
export function getPointCategoryLabel(point: {
  category: PointCategory
  categoryName?: string
}): string {
  const name = point.categoryName?.trim()
  return name && name.length > 0 ? name : formatPointCategory(point.category)
}

export function formatCoordinates(point: GeoPoint): string {
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`
}

export function formatRating(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} / 5`
}

export function formatLocaleLabel(locale: SupportedLocale): string {
  switch (locale) {
    case 'ru':
      return 'Русский'
    case 'en':
      return 'English'
    case 'de':
      return 'Deutsch'
    case 'fr':
      return 'Français'
    case 'es':
      return 'Español'
    default:
      return locale
  }
}
