import { useCallback, useEffect, useRef, useState } from 'react'
import './MapSearchBar.css'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
  addresstype: string
}

interface MapSearchBarProps {
  isOpen: boolean
  onClose: () => void
  onResult: (lat: number, lng: number, zoom: number) => void
}

function getZoom(r: NominatimResult): number {
  const t = r.addresstype || r.type
  if (t === 'country') return 5
  if (t === 'state' || t === 'region') return 7
  if (t === 'city' || t === 'town') return 12
  if (t === 'village' || t === 'suburb' || t === 'district') return 13
  return 15
}

function trimName(name: string): string {
  return name.split(',').slice(0, 3).join(',').trim()
}

export function MapSearchBar({ isOpen, onClose, onResult }: MapSearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    } else {
      setQuery('')
      setResults([])
      setIsLoading(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handle = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, onClose])

  const doSearch = useCallback(async (q: string) => {
    abortRef.current?.abort()
    if (!q.trim()) { setResults([]); setIsLoading(false); return }
    abortRef.current = new AbortController()
    setIsLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=ru`,
        { signal: abortRef.current.signal }
      )
      const data: NominatimResult[] = await res.json()
      setResults(data)
    } catch {
      // aborted or network error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleChange = useCallback((v: string) => {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void doSearch(v), 380)
  }, [doSearch])

  const handleSelect = useCallback((r: NominatimResult) => {
    onResult(parseFloat(r.lat), parseFloat(r.lon), getZoom(r))
    onClose()
  }, [onResult, onClose])

  const hasResults = results.length > 0

  return (
    <div
      aria-hidden={!isOpen}
      className={`map-search${isOpen ? ' map-search--open' : ''}`}
      ref={containerRef}
    >
      <div className={`map-search__box${hasResults ? ' map-search__box--has-results' : ''}`}>
        <div className="map-search__row">
          <span className="map-search__lens" aria-hidden="true">
            <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            aria-label="Поиск города или адреса"
            className="map-search__input"
            placeholder="Город или адрес..."
            ref={inputRef}
            tabIndex={isOpen ? 0 : -1}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
          />
          {isLoading ? (
            <span className="map-search__spinner" aria-hidden="true" />
          ) : query ? (
            <button
              aria-label="Очистить"
              className="map-search__clear"
              onClick={() => handleChange('')}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 24 24" width="11">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        {hasResults ? (
          <ul className="map-search__results" role="listbox">
            {results.map((r) => (
              <li
                className="map-search__result"
                key={r.place_id}
                role="option"
                onClick={() => handleSelect(r)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="map-search__result-pin" aria-hidden="true">
                  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="13">
                    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <span className="map-search__result-name">{trimName(r.display_name)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
