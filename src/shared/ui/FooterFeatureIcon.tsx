type FooterFeatureIconName =
  | 'audio'
  | 'routes'
  | 'nearby'
  | 'walking'
  | 'back'
  | 'time'

interface FooterFeatureIconProps {
  name: FooterFeatureIconName
}

export function FooterFeatureIcon({ name }: FooterFeatureIconProps) {
  switch (name) {
    case 'audio':
      return (
        <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
          <path d="M10 8v8a3 3 0 1 1-2-2.83V6.5l9-2v8a3 3 0 1 1-2-2.83V5.06L10 6.17V8Z" fill="currentColor" />
        </svg>
      )
    case 'routes':
      return (
        <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
          <path d="m12 3 2.4 5 5.6.8-4 3.9.95 5.55L12 15.9 7.05 18.25 8 12.7 4 8.8l5.6-.8L12 3Z" fill="currentColor" />
        </svg>
      )
    case 'nearby':
      return (
        <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
          <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        </svg>
      )
    case 'walking':
      return (
        <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
          <path d="M5 12h10.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
          <path d="m12.5 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
      )
    case 'back':
      return (
        <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
          <path d="M19 12H8.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
          <path d="m11.5 7-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
      )
    case 'time':
      return (
        <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
          <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4.2l2.8 1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      )
    default:
      return null
  }
}
