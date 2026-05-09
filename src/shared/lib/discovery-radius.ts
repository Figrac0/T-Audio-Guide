import { appMapConfig } from '@/shared/config/map'

const MIN_DISCOVERY_RADIUS_METERS = appMapConfig.discoveryRadiusMeters
const MAX_DISCOVERY_RADIUS_METERS = 15000

export function clampDiscoveryRadius(radiusMeters: number): number {
  return Math.round(
    Math.min(MAX_DISCOVERY_RADIUS_METERS, Math.max(MIN_DISCOVERY_RADIUS_METERS, radiusMeters)),
  )
}

export function getDiscoveryRadiusForZoom(zoom: number): number {
  const minZoom = 11
  const maxZoom = 18

  if (zoom <= minZoom) {
    return MAX_DISCOVERY_RADIUS_METERS
  }

  if (zoom >= maxZoom) {
    return MIN_DISCOVERY_RADIUS_METERS
  }

  // Normalize zoom to 0-1 range (where 0 = max radius, 1 = min radius)
  const progress = (zoom - minZoom) / (maxZoom - minZoom)

  // Apply ease-out cubic function for smooth, progressive transitions
  // This makes radius changes slower at first (low zoom levels) and faster later
  const eased = 1 - Math.pow(1 - progress, 3)

  const radius = MAX_DISCOVERY_RADIUS_METERS +
    (MIN_DISCOVERY_RADIUS_METERS - MAX_DISCOVERY_RADIUS_METERS) * eased

  return clampDiscoveryRadius(radius)
}
