import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import type { Excursion, RouteStop } from '@/entities/excursion/model/types'
import {
  durationOptions,
  themeOptions,
  useExcursionsPageState,
} from '@/pages/excursions/model/useExcursionsPageState'
import { appRoutes } from '@/shared/config/routes'
import {
  formatDifficulty,
  formatDistance,
  formatDuration,
  formatPointCategory,
  formatStopCount,
  formatTheme,
} from '@/shared/lib/format'
import { buildRoutePlaceholderImage } from '@/shared/lib/placeholder-images'
import { ResilientImage } from '@/shared/ui/ResilientImage'
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

// ── ExcursionsPage ────────────────────────────────────────────────────────────

export function ExcursionsPage() {
  const state = useExcursionsPageState()

  // ── Sheet drag state ────────────────────────────────────────────────────────

  const [sheetState, setSheetState] = useState<SheetState>('peek')
  const [isDragging, setIsDragging] = useState(false)
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
    setIsDragging(true)
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
    <div className="ep">
      {/* Fullscreen map */}
      <div className="ep__map">
        <RouteBuilderMap
          draftPointIds={state.draftPointIds}
          isDraftFull={state.draftStops.length >= 6}
          isLoading={state.isLoading || !state.canLoadNearbyPlaces}
          isPointInDraft={state.isPointInDraft}
          nearbyPoints={state.nearbyPoints}
          onAddPoint={state.handleAddPoint}
          onChangeRadius={state.setRadiusMeters}
          onSelectPoint={state.handleSelectPoint}
          radiusMeters={state.radiusMeters}
          recenterKey={state.recenterKey}
          routeState={state.routeState}
          selectedPointId={state.selectedPointId}
          userPosition={state.userPosition}
        />
      </div>

      {/* Map corner buttons — only in peek state */}
      {state.draftStops.length > 0 && sheetState === 'peek' && (
        <>
          <button
            className="ep__corner-btn ep__corner-btn--left"
            onClick={state.handleClearRoute}
            type="button"
          >
            Сбросить
          </button>
          {state.draftStops.length >= 2 && (
            <button
              className="ep__corner-btn ep__corner-btn--right"
              onClick={state.handleSaveRoute}
              type="button"
            >
              Сохранить
            </button>
          )}
        </>
      )}

      {/* Toast notice */}
      {state.notice && (
        <div className="ep__notice" role="status">{state.notice}</div>
      )}

      {/* Geolocation error */}
      {state.geolocationError && (
        <p className="ep__geo-error">{state.geolocationError}</p>
      )}

      {/* Bottom sheet */}
      <div className="ep-sheet" ref={sheetRef}>
        {/* Drag handle row */}
        <div
          aria-label="Потяните вверх чтобы открыть панель"
          className="ep-sheet__drag"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ')
              setSheetState((s) => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')
          }}
          onPointerCancel={handleDragEnd}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          role="button"
          tabIndex={0}
        >
          <div className="ep-sheet__handle" />
          <button
            aria-label="Найти моё местоположение"
            className="ep-sheet__locate"
            onClick={state.handleLocateUser}
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

        {/* Scrollable body */}
        <div className="ep-sheet__body">

          {/* ── My Route ──────────────────────────────────────────────────── */}
          {state.draftStops.length > 0 && (
            <section className="ep-draft">
              <div className="ep-draft__head">
                <div>
                  <h2 className="ep-draft__title">
                    Мой маршрут
                    <span className="ep-draft__badge">{state.draftStops.length}/6</span>
                  </h2>
                  <p className="ep-draft__sub">Нажмите на точку на карте, чтобы добавить</p>
                </div>
              </div>

              <div className="ep-draft__stops">
                {state.draftStops.map((stop) => (
                  <DraftStopCard
                    isExpanded={state.expandedStopId === stop.id}
                    key={stop.id}
                    onRemove={() => state.handleRemoveStop(stop.id)}
                    onToggle={() =>
                      state.setExpandedStopId((id) => (id === stop.id ? null : stop.id))
                    }
                    stop={stop}
                  />
                ))}
              </div>

              <div className="ep-draft__actions">
                <button
                  className="ep-draft__action-btn"
                  onClick={state.handleClearRoute}
                  type="button"
                >
                  Сбросить
                </button>
                {state.draftStops.length >= 2 && (
                  <button
                    className="ep-draft__action-btn ep-draft__action-btn--primary"
                    onClick={state.handleSaveRoute}
                    type="button"
                  >
                    Сохранить маршрут
                  </button>
                )}
              </div>
            </section>
          )}

          {/* ── Filters ───────────────────────────────────────────────────── */}
          <section className="ep-filters">
            <div className="ep-filters__group">
              {themeOptions.map((theme) => (
                <button
                  className={`ep-filters__pill${state.activeTheme === theme ? ' ep-filters__pill--active' : ''}`}
                  key={theme}
                  onClick={() => state.setActiveTheme(theme)}
                  type="button"
                >
                  {theme === 'all' ? 'Все темы' : formatTheme(theme)}
                </button>
              ))}
            </div>

            <div className="ep-filters__divider" />

            <div className="ep-filters__group">
              <button
                className={`ep-filters__pill${state.maxDuration === null ? ' ep-filters__pill--active' : ''}`}
                onClick={() => state.setMaxDuration(null)}
                type="button"
              >
                Любое время
              </button>
              {durationOptions.map((d) => (
                <button
                  className={`ep-filters__pill${state.maxDuration === d ? ' ep-filters__pill--active' : ''}`}
                  key={d}
                  onClick={() => state.setMaxDuration(d)}
                  type="button"
                >
                  До {formatDuration(d)}
                </button>
              ))}
            </div>
          </section>

          {/* ── Excursion catalog ─────────────────────────────────────────── */}
          <section className="ep-catalog">
            <div className="ep-catalog__head">
              <h2 className="ep-catalog__title">Готовые маршруты</h2>
              {state.excursions.length > 0 && (
                <span className="ep-catalog__count">{state.excursions.length}</span>
              )}
            </div>

            {state.isLoading && state.excursions.length === 0 ? (
              <ExcursionsSkeleton />
            ) : state.excursions.length === 0 ? (
              <p className="ep-catalog__empty">
                Маршруты не найдены. Попробуйте другой фильтр или отдалите карту.
              </p>
            ) : (
              <div className="ep-catalog__grid">
                {state.excursions.map((excursion) => (
                  <ExcursionCard excursion={excursion} key={excursion.id} />
                ))}
              </div>
            )}
          </section>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <footer className="ep-footer">
            <div className="ep-footer__brand">
              <span className="ep-footer__logo">T-GUIDE</span>
              <p className="ep-footer__tagline">Аудиогид по городу</p>
            </div>
            <p className="ep-footer__desc">
              Готовые маршруты с описаниями достопримечательностей, точки интереса
              рядом с вами и удобная навигация по улицам — всё в одном месте.
            </p>
            <div className="ep-footer__features">
              <span className="ep-footer__feature">🎧 Аудиоэкскурсии</span>
              <span className="ep-footer__feature">🗺 Готовые маршруты</span>
              <span className="ep-footer__feature">📍 Места рядом</span>
              <span className="ep-footer__feature">🚶 Пешие прогулки</span>
            </div>
            <p className="ep-footer__copy">© T-Guide · Открывайте город пешком</p>
          </footer>
        </div>
      </div>
    </div>
  )
}

// ── DraftStopCard ─────────────────────────────────────────────────────────────

interface DraftStopCardProps {
  isExpanded: boolean
  onRemove: () => void
  onToggle: () => void
  stop: RouteStop
}

function DraftStopCard({ isExpanded, onRemove, onToggle, stop }: DraftStopCardProps) {
  return (
    <div className={`ep-stop${isExpanded ? ' ep-stop--open' : ''}`}>
      <button className="ep-stop__header" onClick={onToggle} type="button">
        <span className="ep-stop__order">{stop.order}</span>
        <div className="ep-stop__info">
          <span className="ep-stop__cat">{formatPointCategory(stop.category)}</span>
          <span className="ep-stop__name">{stop.title}</span>
        </div>
        <span aria-hidden="true" className="ep-stop__chevron">{isExpanded ? '▴' : '▾'}</span>
      </button>

      <div className="ep-stop__body">
        <div className="ep-stop__body-inner">
          {(stop.description || stop.shortDescription) && (
            <p className="ep-stop__desc">{stop.description || stop.shortDescription}</p>
          )}
          <div className="ep-stop__meta">
            {stop.rating > 0 && (
              <span className="ep-stop__chip">★ {stop.rating.toFixed(1)}</span>
            )}
            {stop.expectedVisitMinutes > 0 && (
              <span className="ep-stop__chip">{formatDuration(stop.expectedVisitMinutes)}</span>
            )}
            {stop.scheduleLabel && (
              <span className="ep-stop__chip">{stop.scheduleLabel}</span>
            )}
          </div>
          <button
            className="ep-stop__remove"
            onClick={onRemove}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Убрать из маршрута
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ExcursionCard ─────────────────────────────────────────────────────────────

interface ExcursionCardProps {
  excursion: Excursion
}

function ExcursionCard({ excursion }: ExcursionCardProps) {
  const placeholder = buildRoutePlaceholderImage(excursion.theme)

  return (
    <article className="ep-card">
      <div className="ep-card__cover">
        <ResilientImage
          alt={excursion.title}
          fallbackSrcs={[placeholder]}
          loading="lazy"
          placeholderSrc={placeholder}
          referrerPolicy="no-referrer"
          src={excursion.coverImageUrl}
        />
        <span className="ep-card__theme">{formatTheme(excursion.theme)}</span>
      </div>
      <div className="ep-card__body">
        <h3 className="ep-card__title">{excursion.title}</h3>
        <p className="ep-card__tagline">{excursion.tagline}</p>
        <div className="ep-card__stats">
          <span className="ep-card__stat">{formatDistance(excursion.distanceKm)}</span>
          <span className="ep-card__stat">{formatStopCount(excursion.stops.length)}</span>
          <span className="ep-card__stat">{formatDuration(excursion.durationMinutes)}</span>
        </div>
        <Link
          className="button button--primary ep-card__open"
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
    <div className="ep-catalog__skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="ep-card-skeleton" key={i}>
          <div className="ep-card-skeleton__cover" />
          <div className="ep-card-skeleton__body">
            <div className="ep-skeleton-line ep-skeleton-line--wide" />
            <div className="ep-skeleton-line" />
            <div className="ep-skeleton-line ep-skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  )
}
