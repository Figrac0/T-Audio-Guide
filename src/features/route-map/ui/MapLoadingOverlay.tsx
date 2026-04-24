import './map-loading-overlay.css'

interface MapLoadingOverlayProps {
  subtitle: string
  title: string
}

export function MapLoadingOverlay({ subtitle, title }: MapLoadingOverlayProps) {
  return (
    <div className="map-loading-overlay" role="status">
      <div aria-hidden="true" className="map-loading-overlay__pulse" />
      <div className="map-loading-overlay__content">
        <p className="map-loading-overlay__title">{title}</p>
        <p className="map-loading-overlay__subtitle">{subtitle}</p>
      </div>
    </div>
  )
}
