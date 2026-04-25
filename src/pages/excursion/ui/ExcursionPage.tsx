import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'

import { useRouteBySlug } from '@/entities/excursion/model/useRouteBySlug'
import type { Excursion, GeoPoint, RouteStop } from '@/entities/excursion/model/types'
import { formatMeters, getDistanceMetersBetween } from '@/features/route-map/lib/route-geometry'
import { useUserGeolocation } from '@/features/route-map/model/useUserGeolocation'
import { RouteMap } from '@/features/route-map/ui/RouteMap'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { appRoutes } from '@/shared/config/routes'
import { getStoredDiscoveryContext } from '@/shared/lib/discovery-context'
import {
  formatDifficulty,
  formatDistance,
  formatDuration,
  formatLocaleLabel,
  formatPointCategory,
  formatStopCount,
  formatTheme,
} from '@/shared/lib/format'
import './ExcursionPage.css'

// ── Sheet constants ──────────────────────────────────────────────────────────

const CLOSED_HEIGHT = 52
const DRAG_MIN = 10

type SheetState = 'closed' | 'peek' | 'full'

function getSnapTranslate(state: SheetState, sheetHeight: number, peekHeight: number): number {
  if (state === 'full') return DRAG_MIN
  if (state === 'peek') return Math.max(DRAG_MIN, sheetHeight - peekHeight)
  return Math.max(DRAG_MIN, sheetHeight - CLOSED_HEIGHT)
}

// ── Main page ────────────────────────────────────────────────────────────────

type Phase = 'info' | 'navigation' | 'complete'

export function ExcursionPage() {
  const { slug } = useParams<{ slug: string }>()
  const storedContext = useMemo(() => getStoredDiscoveryContext(), [])
  const { isRouteSaved, personalRoutes, savedRoutes, shareRoute, toggleSavedRoute } = useUserRoutes()
  const { error: geolocationError, requestLocation, userPosition } = useUserGeolocation()

  const { error, isLoading, route } = useRouteBySlug({
    activePointCategory: storedContext.activePointCategory,
    center: storedContext.center,
    enabled: Boolean(slug),
    locale: storedContext.locale,
    radiusMeters: storedContext.radiusMeters,
    slug: slug ?? '',
  })

  const locallyStoredRoute =
    [...personalRoutes, ...savedRoutes].find((r) => r.slug === slug) ?? null
  const excursion = (route as Excursion | null) ?? locallyStoredRoute

  const [phase, setPhase] = useState<Phase>('info')
  const [currentStopIndex, setCurrentStopIndex] = useState(0)

  if (isLoading && !locallyStoredRoute) {
    return (
      <section className="status-card">
        <h1 className="status-card__title">Открываем маршрут</h1>
        <p className="status-card__text">Загружаем точки, карту и сценарий прогулки.</p>
      </section>
    )
  }

  if (error && !locallyStoredRoute) {
    return (
      <section className="status-card">
        <h1 className="status-card__title">Не удалось открыть маршрут</h1>
        <p className="status-card__text">{error}</p>
      </section>
    )
  }

  if (!excursion) {
    return (
      <section className="not-found">
        <p className="eyebrow">Маршрут</p>
        <h1 className="not-found__title">Маршрут не найден</h1>
        <p className="not-found__description">Откройте другой маршрут из каталога.</p>
        <Link className="button button--secondary" to={appRoutes.excursions}>
          Вернуться к каталогу
        </Link>
      </section>
    )
  }

  const isSaved = isRouteSaved(excursion.slug)

  if (phase === 'complete') {
    return (
      <CompleteScreen
        excursion={excursion}
        isSaved={isSaved}
        onReturnToInfo={() => {
          setCurrentStopIndex(0)
          setPhase('info')
        }}
        onSave={() => toggleSavedRoute(excursion)}
        onShare={() => void shareRoute(excursion)}
      />
    )
  }

  if (phase === 'navigation') {
    return (
      <NavigationPhase
        currentStopIndex={currentStopIndex}
        excursion={excursion}
        onBack={() => setPhase('info')}
        onComplete={() => setPhase('complete')}
        onStopChange={setCurrentStopIndex}
        requestLocation={requestLocation}
        userPosition={userPosition}
      />
    )
  }

  return (
    <InfoPhase
      excursion={excursion}
      geolocationError={geolocationError}
      isSaved={isSaved}
      onSave={() => toggleSavedRoute(excursion)}
      onShare={() => void shareRoute(excursion)}
      onStart={() => {
        setCurrentStopIndex(0)
        setPhase('navigation')
      }}
      userPosition={userPosition}
    />
  )
}

// ── Phase 1 — Info screen ────────────────────────────────────────────────────

interface InfoPhaseProps {
  excursion: Excursion
  geolocationError: string | null
  isSaved: boolean
  onSave: () => void
  onShare: () => void
  onStart: () => void
  userPosition: GeoPoint | null | undefined
}

function InfoPhase({
  excursion,
  geolocationError,
  isSaved,
  onSave,
  onShare,
  onStart,
  userPosition,
}: InfoPhaseProps) {
  const distanceToStart = userPosition
    ? getDistanceMetersBetween(userPosition, excursion.stops[0].coordinates)
    : null

  return (
    <div className="ep-info">
      <Link className="ep-info__back" to={appRoutes.excursions}>
        <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
          <path
            d="M15 19l-7-7 7-7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
        </svg>
        К маршрутам
      </Link>

      {/* Hero */}
      <section className="ep-info__hero">
        {excursion.coverImageUrl ? (
          <div className="ep-info__cover">
            <img
              alt={excursion.title}
              referrerPolicy="no-referrer"
              src={excursion.coverImageUrl}
            />
          </div>
        ) : null}

        <div className="ep-info__hero-top">
          <span className="eyebrow">{formatTheme(excursion.theme)}</span>
          <span className="ep-info__difficulty">{formatDifficulty(excursion.difficulty)}</span>
        </div>

        <h1 className="ep-info__title">{excursion.title}</h1>
        <p className="ep-info__tagline">{excursion.tagline}</p>

        <div className="ep-info__stats">
          <div className="ep-info__stat">
            <span className="ep-info__stat-value">{formatDuration(excursion.durationMinutes)}</span>
            <span className="meta-label">Продолжительность</span>
          </div>
          <div className="ep-info__stat">
            <span className="ep-info__stat-value">{formatDistance(excursion.distanceKm)}</span>
            <span className="meta-label">Длина маршрута</span>
          </div>
          <div className="ep-info__stat">
            <span className="ep-info__stat-value">{formatStopCount(excursion.stops.length)}</span>
            <span className="meta-label">Точки маршрута</span>
          </div>
          <div className="ep-info__stat">
            <span className="ep-info__stat-value">{excursion.audienceLabel}</span>
            <span className="meta-label">Формат прогулки</span>
          </div>
        </div>

        <div className="ep-info__chips">
          <span className="chip chip--accent">Старт: {excursion.startLabel}</span>
          <span className="chip">Финиш: {excursion.finishLabel}</span>
          {distanceToStart !== null ? (
            <span className="chip">До старта: {formatMeters(distanceToStart)}</span>
          ) : null}
        </div>

        <p className="ep-info__desc">{excursion.description}</p>

        <div className="ep-info__secondary-actions">
          <button
            aria-pressed={isSaved}
            className={`button ${isSaved ? 'button--primary' : 'button--secondary'}`}
            onClick={onSave}
            type="button"
          >
            {isSaved ? 'Сохранено' : 'Сохранить маршрут'}
          </button>
          <button className="button button--ghost" onClick={onShare} type="button">
            Поделиться
          </button>
        </div>

        {geolocationError ? <p className="ep-info__geo-error">{geolocationError}</p> : null}
      </section>

      {/* Stops */}
      <section className="ep-info__stops">
        <h2 className="ep-info__stops-heading">
          Точки маршрута
          <span className="ep-info__stops-count">{excursion.stops.length}</span>
        </h2>
        <div className="ep-info__stops-list">
          {excursion.stops.map((stop, i) => (
            <StopCard index={i} key={stop.id} stop={stop} />
          ))}
        </div>
      </section>

      {/* Sticky start CTA */}
      <div className="ep-info__cta">
        <button className="button button--primary ep-info__start-btn" onClick={onStart} type="button">
          Начать маршрут
        </button>
      </div>
    </div>
  )
}

function StopCard({ stop, index }: { stop: RouteStop; index: number }) {
  return (
    <article className="ep-info__stop">
      <div className="ep-info__stop-aside">
        <div className="ep-info__stop-num">{index + 1}</div>
        <div className="ep-info__stop-line" aria-hidden="true" />
      </div>
      <div className="ep-info__stop-body">
        {stop.imageUrl ? (
          <div className="ep-info__stop-img">
            <img
              alt={stop.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              src={stop.imageUrl}
            />
          </div>
        ) : null}

        <div className="ep-info__stop-meta">
          <span className="chip chip--sm">{formatPointCategory(stop.category)}</span>
          {stop.rating > 0 ? (
            <span className="ep-info__stop-rating">★ {stop.rating.toFixed(1)}</span>
          ) : null}
          {stop.expectedVisitMinutes > 0 ? (
            <span className="ep-info__stop-time">~{stop.expectedVisitMinutes} мин</span>
          ) : null}
        </div>

        <h3 className="ep-info__stop-title">{stop.title}</h3>

        {stop.scheduleLabel ? (
          <p className="ep-info__stop-schedule">
            <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 24 24" width="12">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 7v5l3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
            {stop.scheduleLabel}
          </p>
        ) : null}

        <p className="ep-info__stop-desc">{stop.description || stop.shortDescription}</p>

        {stop.audio.transcriptPreview ? (
          <div className="ep-info__stop-audio">
            <span aria-hidden="true" className="ep-info__stop-audio-icon">🎧</span>
            <p className="ep-info__stop-audio-preview">{stop.audio.transcriptPreview}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

// ── Phase 2 — Navigation ─────────────────────────────────────────────────────

interface NavigationPhaseProps {
  currentStopIndex: number
  excursion: Excursion
  onBack: () => void
  onComplete: () => void
  onStopChange: (index: number) => void
  requestLocation: () => void
  userPosition: GeoPoint | null | undefined
}

function NavigationPhase({
  currentStopIndex,
  excursion,
  onBack,
  onComplete,
  onStopChange,
  requestLocation,
  userPosition,
}: NavigationPhaseProps) {
  const currentStop = excursion.stops[currentStopIndex] ?? excursion.stops[0]
  const isLastStop = currentStopIndex >= excursion.stops.length - 1

  const [sheetState, setSheetState] = useState<SheetState>('closed')
  const sheetStateRef = useRef<SheetState>('closed')
  const sheetRef = useRef<HTMLDivElement>(null)
  const navRowRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const peekHeightRef = useRef(130)
  const skipSnapRef = useRef(false)
  const dragRef = useRef({
    active: false,
    startPointerY: 0,
    startTranslate: 0,
    lastPointerY: 0,
    lastTime: 0,
    velocity: 0,
  })

  // ── Body class ──────────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.classList.add('app-body--excursion-nav')
    return () => {
      document.body.classList.remove('app-body--excursion-nav')
    }
  }, [])

  useEffect(() => {
    sheetStateRef.current = sheetState
  }, [sheetState])

  // ── Snap helpers ────────────────────────────────────────────────────────────
  const snapToClosed = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    skipSnapRef.current = true
    setSheetState('closed')
    sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${sheet.offsetHeight - CLOSED_HEIGHT}px)`
  }, [])

  const snapToPeek = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const peekT = getSnapTranslate('peek', sheet.offsetHeight, peekHeightRef.current)
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    skipSnapRef.current = true
    setSheetState('peek')
    sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${peekT}px)`
  }, [])

  // ── Menu/sheet open events ──────────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('app-menu-open', snapToClosed)
    return () => window.removeEventListener('app-menu-open', snapToClosed)
  }, [snapToClosed])

  useEffect(() => {
    if (sheetState !== 'closed') {
      window.dispatchEvent(new CustomEvent('app-sheet-open'))
    }
  }, [sheetState])

  // ── Snap on state change (keyboard / programmatic) ──────────────────────────
  useEffect(() => {
    if (skipSnapRef.current) {
      skipSnapRef.current = false
      return
    }
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return
    const target = getSnapTranslate(sheetState, sheet.offsetHeight, peekHeightRef.current)
    if (sheetState === 'peek' && bodyRef.current) bodyRef.current.scrollTop = 0
    sheet.style.transition = 'transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${target}px)`
  }, [sheetState])

  // ── Initial position + resize ───────────────────────────────────────────────
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const applyInitial = () => {
      if (sheet.offsetHeight > 0) {
        sheet.style.transition = 'none'
        sheet.style.transform = `translateY(${sheet.offsetHeight - CLOSED_HEIGHT}px)`
      }
    }
    applyInitial()
    const onResize = () => {
      if (dragRef.current.active) return
      const target = getSnapTranslate(
        sheetStateRef.current,
        sheet.offsetHeight,
        peekHeightRef.current,
      )
      sheet.style.transition = 'none'
      sheet.style.transform = `translateY(${target}px)`
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Peek height measurement ─────────────────────────────────────────────────
  useEffect(() => {
    const el = navRowRef.current
    if (!el) return
    const update = () => {
      peekHeightRef.current = CLOSED_HEIGHT + el.offsetHeight
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Scroll-to-close (full state overscroll) ─────────────────────────────────
  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return
    let reachedTopAt = -1

    const onTouchStart = (e: TouchEvent) => {
      reachedTopAt = bodyEl.scrollTop === 0 ? e.touches[0].clientY : -1
    }
    const onTouchMove = (e: TouchEvent) => {
      if (sheetStateRef.current !== 'full') return
      const y = e.touches[0].clientY
      if (bodyEl.scrollTop === 0 && reachedTopAt < 0) reachedTopAt = y
      if (reachedTopAt < 0 || bodyEl.scrollTop > 0) return
      if (y - reachedTopAt > 52) {
        reachedTopAt = Infinity
        const sheet = sheetRef.current
        if (!sheet) return
        skipSnapRef.current = true
        setSheetState('closed')
        sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
        sheet.style.transform = `translateY(${sheet.offsetHeight - CLOSED_HEIGHT}px)`
      }
    }
    const onTouchEnd = () => {
      reachedTopAt = -1
    }

    bodyEl.addEventListener('touchstart', onTouchStart, { passive: true })
    bodyEl.addEventListener('touchmove', onTouchMove, { passive: true })
    bodyEl.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      bodyEl.removeEventListener('touchstart', onTouchStart)
      bodyEl.removeEventListener('touchmove', onTouchMove)
      bodyEl.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // ── Drag handlers ───────────────────────────────────────────────────────────
  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current
    if (!sheet) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const current = match
      ? parseFloat(match[1])
      : getSnapTranslate(sheetState, sheet.offsetHeight, peekHeightRef.current)
    dragRef.current = {
      active: true,
      startPointerY: e.clientY,
      startTranslate: current,
      lastPointerY: e.clientY,
      lastTime: Date.now(),
      velocity: 0,
    }
    sheet.style.transition = 'none'
    sheet.style.willChange = 'transform'
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return
    const sheet = sheetRef.current
    if (!sheet) return
    const dy = e.clientY - dragRef.current.startPointerY
    const raw = dragRef.current.startTranslate + dy
    const newT = Math.min(sheet.offsetHeight - CLOSED_HEIGHT, Math.max(DRAG_MIN, raw))
    const now = Date.now()
    const dt = Math.max(1, now - dragRef.current.lastTime)
    dragRef.current.velocity = ((e.clientY - dragRef.current.lastPointerY) / dt) * 16
    dragRef.current.lastPointerY = e.clientY
    dragRef.current.lastTime = now
    sheet.style.transform = `translateY(${newT}px)`
  }

  function handleDragEnd() {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const sheet = sheetRef.current
    if (!sheet) return
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const currentT = match ? parseFloat(match[1]) : 0
    const sheetHeight = sheet.offsetHeight
    const velocity = dragRef.current.velocity
    const snaps: [SheetState, number][] = [
      ['full', DRAG_MIN],
      ['peek', getSnapTranslate('peek', sheetHeight, peekHeightRef.current)],
      ['closed', sheetHeight - CLOSED_HEIGHT],
    ]
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < snaps.length; i++) {
      const d = Math.abs(currentT - snaps[i][1])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (velocity > 5 && bestIdx < snaps.length - 1) bestIdx++
    else if (velocity < -5 && bestIdx > 0) bestIdx--

    const [nextState, targetT] = snaps[bestIdx]
    skipSnapRef.current = true
    setSheetState(nextState)
    sheet.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${targetT}px)`
    if (nextState === 'peek' && bodyRef.current) bodyRef.current.scrollTop = 0

    const clear = () => {
      sheet.style.willChange = ''
    }
    sheet.addEventListener('transitionend', clear, { once: true })
    setTimeout(clear, 450)
  }

  // ── Stop navigation ─────────────────────────────────────────────────────────
  const handlePrevStop = () => {
    onStopChange(Math.max(0, currentStopIndex - 1))
    snapToPeek()
  }

  const handleNextStop = () => {
    if (isLastStop) {
      onComplete()
    } else {
      onStopChange(currentStopIndex + 1)
      snapToPeek()
    }
  }

  const distanceToStop = userPosition
    ? getDistanceMetersBetween(userPosition, currentStop.coordinates)
    : null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="ep-nav">
      <div className="ep-nav__map">
        <RouteMap
          onLocateUser={requestLocation}
          onSelect={() => {}}
          routeColor={excursion.routeColor}
          selectedStopId={currentStop.id}
          stops={[currentStop]}
          userPosition={userPosition}
        />
      </div>

      <div className="ep-nav__sheet" ref={sheetRef}>
        {/* ── Drag handle (52px — always visible) ── */}
        <div
          aria-label="Потяните вверх чтобы открыть панель"
          className="ep-nav__drag"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSheetState((s) =>
                s === 'closed' ? 'peek' : s === 'peek' ? 'full' : 'closed',
              )
            }
          }}
          onPointerCancel={handleDragEnd}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          role="button"
          tabIndex={0}
        >
          <button
            aria-label="Вернуться к описанию маршрута"
            className="ep-nav__back"
            onClick={onBack}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
              <path
                d="M15 19l-7-7 7-7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>

          <div className="ep-nav__handle" />

          <button
            aria-label="Найти моё местоположение"
            className="ep-nav__locate"
            onClick={requestLocation}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
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

        {/* ── Scrollable body ── */}
        <div
          className="ep-nav__body"
          ref={bodyRef}
          style={{ overflowY: sheetState === 'full' ? undefined : 'hidden' }}
        >
          {/* Nav row — at top of body, visible in peek state */}
          <div className="ep-nav__nav-row" ref={navRowRef}>
            <button
              aria-label="Предыдущая точка"
              className="ep-nav__arrow"
              disabled={currentStopIndex === 0}
              onClick={handlePrevStop}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                <path
                  d="M15 19l-7-7 7-7"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                />
              </svg>
            </button>

            <div className="ep-nav__progress">
              <span className="ep-nav__progress-count">
                {currentStopIndex + 1} / {excursion.stops.length}
              </span>
              <p className="ep-nav__progress-title">{currentStop.title}</p>
              {distanceToStop !== null ? (
                <span className="ep-nav__progress-dist">{formatMeters(distanceToStop)}</span>
              ) : null}
            </div>

            <button
              aria-label={isLastStop ? 'Завершить маршрут' : 'Следующая точка'}
              className={`ep-nav__arrow${isLastStop ? ' ep-nav__arrow--complete' : ''}`}
              onClick={handleNextStop}
              type="button"
            >
              {isLastStop ? (
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                  <path
                    d="M5 12l5 5L20 7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                  />
                </svg>
              ) : (
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                  <path
                    d="M9 5l7 7-7 7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Stop details — visible in full state */}
          <div className="ep-nav__stop">
            {currentStop.imageUrl ? (
              <div className="ep-nav__stop-img">
                <img
                  alt={currentStop.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={currentStop.imageUrl}
                />
              </div>
            ) : null}

            <div className="ep-nav__stop-header">
              <div className="ep-nav__stop-chips">
                <span className="chip chip--sm">{formatPointCategory(currentStop.category)}</span>
              </div>
              <h2 className="ep-nav__stop-title">{currentStop.title}</h2>
              <div className="ep-nav__stop-stats">
                {currentStop.rating > 0 ? (
                  <span className="ep-nav__stop-rating">★ {currentStop.rating.toFixed(1)}</span>
                ) : null}
                {currentStop.expectedVisitMinutes > 0 ? (
                  <span className="ep-nav__stop-time">
                    ~{currentStop.expectedVisitMinutes} мин
                  </span>
                ) : null}
              </div>
              {currentStop.scheduleLabel ? (
                <p className="ep-nav__stop-schedule">{currentStop.scheduleLabel}</p>
              ) : null}
            </div>

            <p className="ep-nav__stop-desc">
              {currentStop.description || currentStop.shortDescription}
            </p>

            {/* Audio guide */}
            <div className="ep-nav__audio">
              <h3 className="ep-nav__audio-heading">Аудиогид</h3>
              <p className="ep-nav__audio-preview">{currentStop.audio.transcriptPreview}</p>
              <div className="ep-nav__audio-meta">
                <span className="chip chip--sm">
                  {formatDuration(Math.ceil(currentStop.audio.durationSeconds / 60))}
                </span>
                <span className="chip chip--sm">
                  {formatLocaleLabel(currentStop.audio.language)}
                </span>
              </div>
              {currentStop.audio.url ? (
                <audio
                  controls
                  preload="metadata"
                  src={currentStop.audio.url}
                  style={{ width: '100%' }}
                />
              ) : (
                <p className="ep-nav__audio-placeholder">Доступно текстовое описание точки.</p>
              )}
            </div>

            {/* Action button */}
            <div className="ep-nav__stop-actions">
              {isLastStop ? (
                <button
                  className="button button--primary"
                  onClick={onComplete}
                  type="button"
                >
                  Завершить маршрут
                </button>
              ) : (
                <button
                  className="button button--primary"
                  onClick={handleNextStop}
                  type="button"
                >
                  Следующая: {excursion.stops[currentStopIndex + 1]?.title}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Phase 3 — Complete screen ────────────────────────────────────────────────

interface CompleteScreenProps {
  excursion: Excursion
  isSaved: boolean
  onReturnToInfo: () => void
  onSave: () => void
  onShare: () => void
}

function CompleteScreen({
  excursion,
  isSaved,
  onReturnToInfo,
  onSave,
  onShare,
}: CompleteScreenProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewSent, setReviewSent] = useState(false)

  function handleSubmitReview() {
    if (rating === 0) return
    setReviewSent(true)
  }

  return (
    <div className="ep-complete">
      <div className="ep-complete__card">
        <div className="ep-complete__badge" aria-hidden="true">🎉</div>
        <h1 className="ep-complete__title">Маршрут завершён!</h1>
        <p className="ep-complete__route">{excursion.title}</p>
        <p className="ep-complete__summary">
          Вы прошли {formatStopCount(excursion.stops.length)}, преодолели{' '}
          {formatDistance(excursion.distanceKm)} за примерно{' '}
          {formatDuration(excursion.durationMinutes)}.
        </p>

        {/* Review */}
        <div className="ep-complete__review">
          {reviewSent ? (
            <p className="ep-complete__review-sent">Спасибо за отзыв! ✓</p>
          ) : (
            <>
              <p className="ep-complete__review-label">Как вам маршрут?</p>
              <div
                aria-label="Оцените маршрут"
                className="ep-complete__stars"
                role="group"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    aria-label={`${star} из 5`}
                    aria-pressed={rating === star}
                    className={`ep-complete__star${
                      star <= (hoverRating || rating) ? ' ep-complete__star--active' : ''
                    }`}
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    type="button"
                  >
                    ★
                  </button>
                ))}
              </div>
              {rating > 0 ? (
                <>
                  <textarea
                    className="ep-complete__review-text"
                    maxLength={400}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Расскажите подробнее (необязательно)"
                    rows={3}
                    value={reviewText}
                  />
                  <button
                    className="button button--secondary"
                    onClick={handleSubmitReview}
                    type="button"
                  >
                    Отправить отзыв
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="ep-complete__actions">
          <button
            aria-pressed={isSaved}
            className={`button ${isSaved ? 'button--primary' : 'button--secondary'}`}
            onClick={onSave}
            type="button"
          >
            {isSaved ? 'Сохранено' : 'Сохранить маршрут'}
          </button>
          <button className="button button--ghost" onClick={onShare} type="button">
            Поделиться
          </button>
          <button className="button button--ghost" onClick={onReturnToInfo} type="button">
            Вернуться к описанию
          </button>
          <Link className="button button--ghost" to={appRoutes.excursions}>
            Другие маршруты
          </Link>
        </div>
      </div>
    </div>
  )
}
