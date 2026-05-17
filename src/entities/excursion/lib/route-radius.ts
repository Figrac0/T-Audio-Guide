import type { Excursion, GeoPoint } from '@/entities/excursion/model/types'

const earthRadiusMeters = 6371000
const radiusToleranceMeters = 1

export function routeHasAllStopsWithinRadius(
  excursion: Excursion,
  center: GeoPoint,
  radiusMeters: number,
): boolean {
  if (excursion.stops.length === 0) {
    return false
  }

  return excursion.stops.every(
    (stop) =>
      getDistanceMetersBetween(stop.coordinates, center) <=
      radiusMeters + radiusToleranceMeters,
  )
}

export function filterRoutesByStopRadius(
  excursions: Excursion[],
  center: GeoPoint,
  radiusMeters: number,
): Excursion[] {
  return excursions.filter((excursion) =>
    routeHasAllStopsWithinRadius(excursion, center, radiusMeters),
  )
}

function getDistanceMetersBetween(from: GeoPoint, to: GeoPoint): number {
  const fromLat = degreesToRadians(from.lat)
  const toLat = degreesToRadians(to.lat)
  const deltaLat = degreesToRadians(to.lat - from.lat)
  const deltaLng = degreesToRadians(to.lng - from.lng)

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}
