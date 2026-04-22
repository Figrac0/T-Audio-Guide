import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import type {
  Excursion,
  NearbyPoint,
  RouteStop,
  SupportedLocale,
} from '@/entities/excursion/model/types'
import { useDiscoveryRoutes } from '@/entities/excursion/model/useDiscoveryRoutes'
import {
  buildOsmWalkingRouteGeometryFromPoints,
  formatMeters,
  type LngLat,
  type RouteGeometry,
} from '@/features/route-map/lib/route-geometry'
import { useUserGeolocation } from '@/features/route-map/model/useUserGeolocation'
import { useAuth } from '@/app/providers/useAuth'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { appRoutes } from '@/shared/config/routes'
import {
  detectSupportedLocale,
  getStoredDiscoveryContext,
  saveDiscoveryContext,
} from '@/shared/lib/discovery-context'
import {
  formatDistance,
  formatDuration,
  formatPointCategory,
  formatStopCount,
  formatTheme,
} from '@/shared/lib/format'
import { buildRoutePlaceholderImage } from '@/shared/lib/placeholder-images'
import { ResilientImage } from '@/shared/ui/ResilientImage'
import { PointModal } from './PointModal'
import { RouteBuilderMap } from './RouteBuilderMap'
import './ExcursionsPage.css'

// ── Sheet snap constants ──────────────────────────────────────────────────────

const PEEK_HEIGHT = 52
const DRAG_MIN = 10
const HALF_RATIO = 0.48

type SheetState = 'peek' | 'half' | 'full'

function getSnapTranslate(state: SheetState, sheetHeight: number): number {
  if (state === 'full') return DRAG_MIN
  if (state === 'half') return sheetHeight - Math.round(window.innerHeight * HALF_RATIO)
  return sheetHeight - PEEK_HEIGHT
}

// ── useSegmentedRoute ─────────────────────────────────────────────────────────
// Fetches pairwise OSRM walking routes between consecutive stops and combines
// them into a MultiLineString so each segment renders in a distinct color.

function useSegmentedRoute(stops: RouteStop[]): RouteGeometry | null {
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null)

  const signature = stops
    .map((s) => `${s.coordinates.lat.toFixed(5)},${s.coordinates.lng.toFixed(5)}`)
    .join('|')

  useEffect(() => {
    if (stops.length < 2) {
      setGeometry(null)
      return
    }

    const controller = new AbortController()

    async function buildSegments() {
      const results = await Promise.all(
        stops.slice(0, -1).map((s, i) =>
          buildOsmWalkingRouteGeometryFromPoints(
            [s.coordinates, stops[i + 1].coordinates],
            controller.signal,
          ).catch(() => null),
        ),
      )

      if (controller.signal.aborted) return

      // Use OSRM geometry per segment; fall back to straight line when unavailable.
      const segments: LngLat[][] = results.map((r, i) => {
        if (r?.geometry?.type === 'LineString') return r.geometry.coordinates
        if (r?.geometry?.type === 'MultiLineString') return r.geometry.coordinates[0]
        return [
          [stops[i].coordinates.lng, stops[i].coordinates.lat],
          [stops[i + 1].coordinates.lng, stops[i + 1].coordinates.lat],
        ] as LngLat[]
      })

      setGeometry({ type: 'MultiLineString', coordinates: segments })
    }

    void buildSegments()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return geometry
}

// ── ExcursionsPage ────────────────────────────────────────────────────────────

export function ExcursionsPage() {
  const { session } = useAuth()
  const {
    addPointToDraft,
    clearDraftRoute,
    draftStops,
    isPointInDraft,
    saveDraftRoute,
  } = useUserRoutes()
  const isAuthenticated = Boolean(session?.isAuthenticated && session.profile)

  const storedContext = useMemo(() => getStoredDiscoveryContext(), [])
  const detectedLocale = useMemo<SupportedLocale>(() => {
    if (typeof window === 'undefined') return storedContext.locale
    return detectSupportedLocale(
      navigator.languages?.[0] ?? navigator.language ?? storedContext.browserLocale,
    )
  }, [storedContext.browserLocale, storedContext.locale])

  const [locale] = useState<SupportedLocale>(storedContext.locale ?? detectedLocale)
  const [radiusMeters, setRadiusMeters] = useState(storedContext.radiusMeters ?? 1000)
  const [selectedPointId, setSelectedPointId] = useState('')
  const [modalPoint, setModalPoint] = useState<NearbyPoint | null>(null)
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null)
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  const { error: geoError, requestLocation, status: geoStatus, userPosition } = useUserGeolocation()

  const canLoad = Boolean(userPosition) || geoStatus === 'blocked' || geoStatus === 'unsupported'
  const center = userPosition ?? storedContext.center

  const { excursions: allExcursions, isLoading, nearbyPoints } = useDiscoveryRoutes({
    activePointCategory: 'all',
    center,
    enabled: canLoad,
    locale,
    radiusMeters,
    search: '',
  })

  const draftRouteGeometry = useSegmentedRoute(draftStops)

  // Set of original point IDs currently in the draft — shows draft markers on map
  const draftStopIds = useMemo(
    () => new Set(draftStops.map((s) => s.id.replace(/-draft-stop.*$/, ''))),
    [draftStops],
  )

  // Persist discovery context on relevant changes
  useEffect(() => {
    saveDiscoveryContext({
      activePointCategory: 'all',
      browserLocale:
        typeof window === 'undefined'
          ? storedContext.browserLocale
          : (navigator.languages?.[0] ?? navigator.language ?? storedContext.browserLocale),
      center,
      locale,
      radiusMeters,
      updatedAt: new Date().toISOString(),
    })
  }, [center, locale, radiusMeters, storedContext.browserLocale])

  // Auto-dismiss save notice
  useEffect(() => {
    if (!saveNotice) return
    const id = window.setTimeout(() => setSaveNotice(null), 3200)
    return () => window.clearTimeout(id)
  }, [saveNotice])

  const handlePointClick = useCallback((point: NearbyPoint) => {
    setSelectedPointId(point.id)
    setModalPoint(point)
  }, [])

  const handleAddToDraft = useCallback(
    (point: NearbyPoint) => {
      addPointToDraft(point)
      if (!userPosition) requestLocation()
    },
    [addPointToDraft, requestLocation, userPosition],
  )

  const handleClearDraft = useCallback(() => {
    clearDraftRoute()
    setSaveNotice(null)
    setExpandedStopId(null)
  }, [clearDraftRoute])

  const handleSaveDraft = useCallback(() => {
    const result = saveDraftRoute()
    if (result.status === 'duplicate') {
      setSaveNotice('Такой маршрут уже сохранён.')
      return
    }
    if (result.status === 'unauthorized') {
      setSaveNotice('Войдите в профиль, чтобы сохранить маршрут.')
      return
    }
    if (result.status === 'saved') {
      clearDraftRoute()
      setExpandedStopId(null)
      setSaveNotice('Маршрут сохранён в профиле!')
    }
  }, [clearDraftRoute, saveDraftRoute])

  const handleLocate = useCallback(() => {
    if (userPosition) setRecenterTrigger((n) => n + 1)
    else requestLocation()
  }, [userPosition, requestLocation])

  // ── Bottom sheet ────────────────────────────────────────────────────────────

  const [sheetState, setSheetState] = useState<SheetState>('peek')
  const sheetStateRef = useRef<SheetState>('peek')
  const sheetRef = useRef<HTMLDivElement>(null)
  const skipSnapRef = useRef(false)

  const snapToPeek = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    skipSnapRef.current = true
    setSheetState('peek')
    sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${getSnapTranslate('peek', sheet.offsetHeight)}px)`
  }, [])

  useEffect(() => {
    window.addEventListener('app-menu-open', snapToPeek)
    return () => window.removeEventListener('app-menu-open', snapToPeek)
  }, [snapToPeek])

  useEffect(() => {
    sheetStateRef.current = sheetState
  }, [sheetState])

  useEffect(() => {
    if (skipSnapRef.current) { skipSnapRef.current = false; return }
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return
    sheet.style.transition = 'transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${getSnapTranslate(sheetState, sheet.offsetHeight)}px)`
  }, [sheetState])

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const applyInitial = () => {
      if (sheet.offsetHeight > 0) {
        sheet.style.transition = 'none'
        sheet.style.transform = `translateY(${sheet.offsetHeight - PEEK_HEIGHT}px)`
      }
    }
    applyInitial()

    const onResize = () => {
      if (dragRef.current.active) return
      sheet.style.transition = 'none'
      sheet.style.transform = `translateY(${getSnapTranslate(sheetStateRef.current, sheet.offsetHeight)}px)`
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const dragRef = useRef({
    active: false,
    startPointerY: 0,
    startTranslate: 0,
    lastPointerY: 0,
    lastTime: 0,
    velocity: 0,
  })

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current
    if (!sheet) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const current = match ? parseFloat(match[1]) : getSnapTranslate(sheetState, sheet.offsetHeight)
    dragRef.current = {
      active: true,
      lastPointerY: e.clientY,
      lastTime: Date.now(),
      startPointerY: e.clientY,
      startTranslate: current,
      velocity: 0,
    }
    sheet.style.transition = 'none'
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return
    const sheet = sheetRef.current
    if (!sheet) return
    const raw = dragRef.current.startTranslate + (e.clientY - dragRef.current.startPointerY)
    const newY = Math.min(sheet.offsetHeight - PEEK_HEIGHT, Math.max(DRAG_MIN, raw))
    const now = Date.now()
    dragRef.current.velocity =
      ((e.clientY - dragRef.current.lastPointerY) / Math.max(1, now - dragRef.current.lastTime)) * 16
    dragRef.current.lastPointerY = e.clientY
    dragRef.current.lastTime = now
    sheet.style.transform = `translateY(${newY}px)`
  }

  function handleDragEnd() {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const sheet = sheetRef.current
    if (!sheet) return
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const current = match ? parseFloat(match[1]) : 0
    const sheetHeight = sheet.offsetHeight
    const velocity = dragRef.current.velocity
    const peekT = getSnapTranslate('peek', sheetHeight)
    const halfT = getSnapTranslate('half', sheetHeight)

    skipSnapRef.current = true

    if (velocity > 8) {
      setSheetState('peek')
      sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
      sheet.style.transform = `translateY(${peekT}px)`
    } else if (velocity < -8) {
      setSheetState('full')
      sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
      sheet.style.transform = `translateY(${DRAG_MIN}px)`
    } else if (current >= peekT - 10) {
      setSheetState('peek')
      sheet.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
      sheet.style.transform = `translateY(${peekT}px)`
    } else {
      sheet.style.transition = 'none'
      setSheetState(current >= halfT * 0.5 ? 'half' : 'full')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="routes-page">
      {/* Fullscreen map */}
      <div className="routes-page__map">
        <RouteBuilderMap
          draftRouteGeometry={draftRouteGeometry}
          draftStopIds={draftStopIds}
          isLoading={isLoading || !canLoad}
          nearbyPoints={nearbyPoints}
          onChangeRadius={setRadiusMeters}
          onPointClick={handlePointClick}
          radiusMeters={radiusMeters}
          recenterTrigger={recenterTrigger}
          selectedPointId={selectedPointId}
          userPosition={userPosition}
        />
      </div>

      {/* Draft action buttons — float above the sheet peek strip */}
      {draftStops.length > 0 && (
        <div className="routes-page__draft-bar">
          <button
            className="routes-page__draft-btn"
            onClick={handleClearDraft}
            type="button"
          >
            Сбросить
          </button>
          {draftStops.length > 2 && (
            isAuthenticated ? (
              <button
                className="routes-page__draft-btn routes-page__draft-btn--primary"
                onClick={handleSaveDraft}
                type="button"
              >
                Сохранить
              </button>
            ) : (
              <Link
                className="routes-page__draft-btn routes-page__draft-btn--primary"
                to={appRoutes.signIn}
              >
                Сохранить
              </Link>
            )
          )}
        </div>
      )}

      {/* Save notice toast */}
      {saveNotice && (
        <div className="routes-page__toast" role="status">{saveNotice}</div>
      )}

      {/* Geolocation error note */}
      {geoError && (
        <p className="routes-page__geo-error">{geoError}</p>
      )}

      {/* POI detail modal — rendered above the map */}
      {modalPoint && (
        <PointModal
          isInDraft={isPointInDraft(modalPoint.id)}
          isDraftFull={draftStops.length >= 6}
          onAddToDraft={handleAddToDraft}
          onClose={() => setModalPoint(null)}
          point={modalPoint}
        />
      )}

      {/* Bottom sheet */}
      <div className="routes-sheet" ref={sheetRef}>
        <div
          aria-label="Потяните вверх чтобы открыть панель"
          className="routes-sheet__drag"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSheetState((s) => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')
            }
          }}
          onPointerCancel={handleDragEnd}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          role="button"
          tabIndex={0}
        >
          <div className="routes-sheet__handle" />
          <button
            aria-label="Найти моё местоположение"
            className="routes-sheet__locate"
            onClick={handleLocate}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
              <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 2v3M12 19v3M2 12h3M19 12h3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <div className="routes-sheet__body">
          {/* User's draft route — appears when at least one point is selected */}
          {draftStops.length > 0 && (
            <section className="routes-sheet__draft">
              <div className="routes-sheet__section-head">
                <div>
                  <h2 className="routes-sheet__section-title">
                    Мой маршрут
                    <span className="routes-sheet__stop-badge">{draftStops.length}/6</span>
                  </h2>
                  <p className="routes-sheet__section-sub">
                    Нажмите на точку для подробностей
                  </p>
                </div>
              </div>

              <div className="routes-sheet__stops">
                {draftStops.map((stop) => (
                  <DraftStopCard
                    isExpanded={expandedStopId === stop.id}
                    key={stop.id}
                    onToggle={() =>
                      setExpandedStopId((id) => (id === stop.id ? null : stop.id))
                    }
                    stop={stop}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Ready excursions from the catalog */}
          <section className="routes-sheet__excursions">
            <div className="routes-sheet__section-head">
              <h2 className="routes-sheet__section-title">Готовые маршруты</h2>
              {allExcursions.length > 0 && (
                <span className="routes-sheet__count">{allExcursions.length}</span>
              )}
            </div>

            {isLoading && allExcursions.length === 0 ? (
              <ExcursionsSkeleton />
            ) : allExcursions.length === 0 ? (
              <p className="routes-sheet__empty">
                Маршруты в этом радиусе не найдены. Попробуйте отдалить карту.
              </p>
            ) : (
              <div className="routes-sheet__excursion-list">
                {allExcursions.map((excursion) => (
                  <ExcursionRow excursion={excursion} key={excursion.id} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ── DraftStopCard ─────────────────────────────────────────────────────────────

interface DraftStopCardProps {
  isExpanded: boolean
  onToggle: () => void
  stop: RouteStop
}

function DraftStopCard({ isExpanded, onToggle, stop }: DraftStopCardProps) {
  return (
    <div className={`draft-stop${isExpanded ? ' draft-stop--expanded' : ''}`}>
      <button className="draft-stop__header" onClick={onToggle} type="button">
        <span className="draft-stop__order">{stop.order}</span>
        <div className="draft-stop__info">
          <span className="draft-stop__category">{formatPointCategory(stop.category)}</span>
          <span className="draft-stop__title">{stop.title}</span>
        </div>
        <span aria-hidden="true" className="draft-stop__chevron">
          {isExpanded ? '▴' : '▾'}
        </span>
      </button>

      {isExpanded && (
        <div className="draft-stop__detail">
          {(stop.description || stop.shortDescription) && (
            <p className="draft-stop__desc">{stop.description || stop.shortDescription}</p>
          )}
          <div className="draft-stop__detail-meta">
            {stop.rating > 0 && (
              <span className="draft-stop__stat">★ {stop.rating.toFixed(1)}</span>
            )}
            {stop.expectedVisitMinutes > 0 && (
              <span className="draft-stop__stat">{formatDuration(stop.expectedVisitMinutes)}</span>
            )}
            {stop.scheduleLabel && (
              <span className="draft-stop__stat">{stop.scheduleLabel}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ExcursionRow ──────────────────────────────────────────────────────────────

interface ExcursionRowProps {
  excursion: Excursion
}

function ExcursionRow({ excursion }: ExcursionRowProps) {
  const placeholder = buildRoutePlaceholderImage(excursion.theme)

  return (
    <article className="excursion-row">
      <div className="excursion-row__cover">
        <ResilientImage
          alt={excursion.title}
          fallbackSrcs={[placeholder]}
          loading="lazy"
          placeholderSrc={placeholder}
          referrerPolicy="no-referrer"
          src={excursion.coverImageUrl}
        />
      </div>

      <div className="excursion-row__body">
        <span className="excursion-row__theme">{formatTheme(excursion.theme)}</span>
        <h3 className="excursion-row__title">{excursion.title}</h3>
        <p className="excursion-row__tagline">{excursion.tagline}</p>
        <div className="excursion-row__stats">
          <span>{formatDistance(excursion.distanceKm)}</span>
          <span>{formatStopCount(excursion.stops.length)}</span>
          <span>{formatDuration(excursion.durationMinutes)}</span>
        </div>
        <Link
          className="button button--primary excursion-row__open"
          to={appRoutes.excursion(excursion.slug)}
        >
          Открыть маршрут
        </Link>
      </div>
    </article>
  )
}

// ── ExcursionsSkeleton ────────────────────────────────────────────────────────

function ExcursionsSkeleton() {
  return (
    <div className="routes-sheet__skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="excursion-row-skeleton" key={i}>
          <div className="excursion-row-skeleton__cover" />
          <div className="excursion-row-skeleton__body">
            <div className="skeleton-chip" />
            <div className="skeleton-line skeleton-line--wide" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  )
}
