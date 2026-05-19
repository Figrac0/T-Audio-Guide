export const appMapConfig = {
  // Default map center when the user has no geolocation —
  // площадь Куйбышева, Самара.
  defaultCenter: {
    lat: 53.1956,
    lng: 50.1015,
  },
  defaultZoom: 14,
  // Minimum selectable radius (used for API clamping / zoom mapping).
  discoveryRadiusMeters: 1200,
  // Radius shown on first visit (before user changes it via the menu).
  defaultDiscoveryRadiusMeters: 3000,
} as const
