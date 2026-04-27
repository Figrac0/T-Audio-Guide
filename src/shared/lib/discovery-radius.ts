import { appMapConfig } from '@/shared/config/map'

const MIN_DISCOVERY_RADIUS_METERS = appMapConfig.discoveryRadiusMeters
const MAX_DISCOVERY_RADIUS_METERS = 15000

const zoomRadiusStops = [
  { zoom: 11, radius: MAX_DISCOVERY_RADIUS_METERS },
  { zoom: 12, radius: 11200 },
  { zoom: 13, radius: 8200 },
  { zoom: 14, radius: 5600 },
  { zoom: 15, radius: 3400 },
  { zoom: 16, radius: 2100 },
  { zoom: 17, radius: MIN_DISCOVERY_RADIUS_METERS },
] as const

export function clampDiscoveryRadius(radiusMeters: number): number {
  return Math.round(
    Math.min(MAX_DISCOVERY_RADIUS_METERS, Math.max(MIN_DISCOVERY_RADIUS_METERS, radiusMeters)),
  )
}

export function getDiscoveryRadiusForZoom(zoom: number): number {
  if (zoom <= zoomRadiusStops[0].zoom) {
    return zoomRadiusStops[0].radius
  }

  const lastStop = zoomRadiusStops[zoomRadiusStops.length - 1]

  if (zoom >= lastStop.zoom) {
    return lastStop.radius
  }

  for (let index = 0; index < zoomRadiusStops.length - 1; index += 1) {
    const currentStop = zoomRadiusStops[index]
    const nextStop = zoomRadiusStops[index + 1]

    if (zoom >= currentStop.zoom && zoom <= nextStop.zoom) {
      const progress = (zoom - currentStop.zoom) / (nextStop.zoom - currentStop.zoom)
      const interpolated =
        currentStop.radius + (nextStop.radius - currentStop.radius) * progress

      return clampDiscoveryRadius(interpolated)
    }
  }

  return clampDiscoveryRadius(MIN_DISCOVERY_RADIUS_METERS)
}
