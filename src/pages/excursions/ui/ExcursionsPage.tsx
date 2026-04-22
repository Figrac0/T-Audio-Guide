import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { RouteBuilderMap, type RouteBuilderMapHandle } from './RouteBuilderMap'
import './ExcursionsPage.css'

const PEEK_HEIGHT = 52
const DRAG_MIN = 10
const PEEK_SNAP_THRESHOLD = 18

function getCatalogInitial(): number {
  if (typeof window === 'undefined') return 6
  if (window.matchMedia('(min-width: 1440px)').matches) return 8
  if (window.matchMedia('(min-width: 480px)').matches) return 6
  return 4
}

function useCatalogInitial(): number {
  const [initial, setInitial] = useState(getCatalogInitial)
  useEffect(() => {
    const update = () => setInitial(getCatalogInitial())
    const q1440 = window.matchMedia('(min-width: 1440px)')
    const q480 = window.matchMedia('(min-width: 480px)')
    q1440.addEventListener('change', update)
    q480.addEventListener('change', update)
    return () => {
      q1440.removeEventListener('change', update)
      q480.removeEventListener('change', update)
    }
  }, [])
  return initial
}

function clampSheetTranslate(value: number, peekTranslate: number) {
  return Math.min(peekTranslate, Math.max(DRAG_MIN, value))
}

export function ExcursionsPage() {
  const state = useExcursionsPageState()
  const [showAll, setShowAll] = useState(false)
  const catalogInitial = useCatalogInitial()

  const [peekTranslate, setPeekTranslate] = useState(0)
  const [sheetTranslate, setSheetTranslate] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const mapHandleRef = useRef<RouteBuilderMapHandle>(null)
  const hasMeasuredRef = useRef(false)
  const peekTranslateRef = useRef(0)
  const sheetTranslateRef = useRef(0)
  const dragRef = useRef({ active: false, startPointerY: 0, startTranslate: 0 })

  useEffect(() => {
    document.body.classList.add('app-body--routes-page')
    return () => document.body.classList.remove('app-body--routes-page')
  }, [])

  const syncSheetPosition = useCallback((nextTranslate: number) => {
    const sheet = sheetRef.current
    if (!sheet) return
    const safe = clampSheetTranslate(nextTranslate, peekTranslateRef.current)
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${safe}px)`
    sheetTranslateRef.current = safe
    setSheetTranslate(safe)
  }, [])

  const animateSheetPosition = useCallback((nextTranslate: number, duration = 0.32) => {
    const sheet = sheetRef.current
    if (!sheet) return
    const safe = clampSheetTranslate(nextTranslate, peekTranslateRef.current)
    sheet.style.transition = `transform ${duration}s cubic-bezier(0.4, 0, 0.2, 1)`
    sheet.style.transform = `translateY(${safe}px)`
    sheetTranslateRef.current = safe
    setSheetTranslate(safe)
  }, [])

  const snapToPeek = useCallback(() => {
    animateSheetPosition(peekTranslateRef.current)
  }, [animateSheetPosition])

  const updateSheetBounds = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return
    const prevPeek = peekTranslateRef.current
    const nextPeek = Math.max(DRAG_MIN, sheet.offsetHeight - PEEK_HEIGHT)
    const isNearPeek =
      !hasMeasuredRef.current ||
      Math.abs(sheetTranslateRef.current - prevPeek) <= PEEK_SNAP_THRESHOLD
    hasMeasuredRef.current = true
    peekTranslateRef.current = nextPeek
    setPeekTranslate(nextPeek)
    syncSheetPosition(isNearPeek ? nextPeek : clampSheetTranslate(sheetTranslateRef.current, nextPeek))
  }, [syncSheetPosition])

  useEffect(() => { peekTranslateRef.current = peekTranslate }, [peekTranslate])
  useEffect(() => { sheetTranslateRef.current = sheetTranslate }, [sheetTranslate])

  useEffect(() => {
    window.addEventListener('app-menu-open', snapToPeek)
    return () => window.removeEventListener('app-menu-open', snapToPeek)
  }, [snapToPeek])

  useLayoutEffect(() => {
    updateSheetBounds()
    const frameId = window.requestAnimationFrame(updateSheetBounds)
    const onResize = () => { if (!dragRef.current.active) updateSheetBounds() }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
    }
  }, [updateSheetBounds])

  const isSheetCollapsed = !isDragging && Math.abs(sheetTranslate - peekTranslate) <= 1

  const handleSheetToggle = useCallback(() => {
    if (isDragging) return
    if (Math.abs(sheetTranslateRef.current - peekTranslateRef.current) <= PEEK_SNAP_THRESHOLD) {
      mapHandleRef.current?.closePopup()
      animateSheetPosition(DRAG_MIN)
    } else {
      animateSheetPosition(peekTranslateRef.current)
    }
  }, [animateSheetPosition, isDragging])

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current
    if (!sheet) return
    mapHandleRef.current?.closePopup()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      active: true,
      startPointerY: event.clientY,
      startTranslate: sheetTranslateRef.current,
    }
    sheet.style.transition = 'none'
    sheet.style.willChange = 'transform'
    setIsDragging(true)
  }, [])

  const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const sheet = sheetRef.current
    if (!sheet) return
    const raw = dragRef.current.startTranslate + (event.clientY - dragRef.current.startPointerY)
    const nextY = clampSheetTranslate(raw, peekTranslateRef.current)
    sheet.style.transform = `translateY(${nextY}px)`
    sheetTranslateRef.current = nextY
  }, [])

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setIsDragging(false)

    const sheet = sheetRef.current
    if (!sheet) return

    const current = sheetTranslateRef.current
    if (Math.abs(current - peekTranslateRef.current) <= PEEK_SNAP_THRESHOLD) {
      animateSheetPosition(peekTranslateRef.current, 0.26)
    } else {
      syncSheetPosition(current)
    }

    // Clear will-change after transition to avoid persistent compositor layer
    const clear = () => { sheet.style.willChange = '' }
    sheet.addEventListener('transitionend', clear, { once: true })
    setTimeout(clear, 450)
  }, [animateSheetPosition, syncSheetPosition])

  const showRouteActions = state.draftStops.length > 0 && isSheetCollapsed
  const hasMoreExcursions = state.excursions.length > catalogInitial

  return (
    <div className="ep">
      <div className="ep__map">
        <RouteBuilderMap
          ref={mapHandleRef}
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

      {showRouteActions ? (
        <>
          <button className="ep__corner-btn ep__corner-btn--left" onClick={state.handleClearRoute} type="button">
            Сбросить
          </button>
          {state.draftStops.length >= 2 ? (
            <button className="ep__corner-btn ep__corner-btn--right" onClick={state.handleSaveRoute} type="button">
              Сохранить
            </button>
          ) : null}
        </>
      ) : null}

      {state.notice ? (
        <div className="ep__notice" role="status">{state.notice}</div>
      ) : null}

      {state.geolocationError ? <p className="ep__geo-error">{state.geolocationError}</p> : null}

      <div className="ep-sheet" ref={sheetRef}>
        <div
          aria-label="Потяните вверх чтобы открыть панель"
          className="ep-sheet__drag"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              handleSheetToggle()
            }
          }}
          onPointerCancel={handleDragEnd}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          role="button"
          tabIndex={0}
        >
          {showRouteActions ? (
            <div className="ep-sheet__top-actions">
              <button
                className="ep-sheet__top-action"
                onClick={state.handleClearRoute}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                Сбросить
              </button>
              {state.draftStops.length >= 2 ? (
                <button
                  className="ep-sheet__top-action ep-sheet__top-action--primary"
                  onClick={state.handleSaveRoute}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  Сохранить
                </button>
              ) : null}
            </div>
          ) : null}

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
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="ep-sheet__body">
          {state.draftStops.length > 0 ? (
            <section className="ep-draft">
              <div className="ep-draft__head">
                <h2 className="ep-draft__title">
                  Мой маршрут
                  <span className="ep-draft__badge">{state.draftStops.length}/6</span>
                </h2>
              </div>

              <div className="ep-draft__stops">
                {state.draftStops.map((stop) => (
                  <DraftStopCard
                    isExpanded={state.expandedStopId === stop.id}
                    key={stop.id}
                    onRemove={() => state.handleRemoveStop(stop.id)}
                    onToggle={() => state.setExpandedStopId((cur) => (cur === stop.id ? null : stop.id))}
                    stop={stop}
                  />
                ))}
              </div>

              <div className="ep-draft__actions">
                <button className="ep-draft__action-btn" onClick={state.handleClearRoute} type="button">
                  Сбросить маршрут
                </button>
                {state.draftStops.length >= 2 ? (
                  <button
                    className="ep-draft__action-btn ep-draft__action-btn--primary"
                    onClick={state.handleSaveRoute}
                    type="button"
                  >
                    Сохранить маршрут
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="ep-catalog">
            <div className="ep-catalog__head">
              <h2 className="ep-catalog__title">Готовые маршруты</h2>
              {state.excursions.length > 0 ? (
                <span className="ep-catalog__count">{state.excursions.length}</span>
              ) : null}
            </div>

            <div className="ep-filters">
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
                {durationOptions.map((duration) => (
                  <button
                    className={`ep-filters__pill${state.maxDuration === duration ? ' ep-filters__pill--active' : ''}`}
                    key={duration}
                    onClick={() => state.setMaxDuration(duration)}
                    type="button"
                  >
                    До {formatDuration(duration)}
                  </button>
                ))}
              </div>
            </div>

            {state.isLoading && state.excursions.length === 0 ? (
              <ExcursionsSkeleton />
            ) : state.excursions.length === 0 ? (
              <p className="ep-catalog__empty">
                Маршруты не найдены. Попробуйте другой фильтр или отдалите карту.
              </p>
            ) : (
              <>
                <div className="ep-catalog__grid">
                  {state.excursions.slice(0, catalogInitial).map((excursion) => (
                    <ExcursionCard excursion={excursion} key={excursion.id} />
                  ))}
                </div>

                {hasMoreExcursions ? (
                  <>
                    <div className={`ep-catalog__extra${showAll ? ' ep-catalog__extra--open' : ''}`}>
                      <div className="ep-catalog__extra-inner">
                        <div className="ep-catalog__grid">
                          {state.excursions.slice(catalogInitial).map((excursion) => (
                            <ExcursionCard excursion={excursion} key={excursion.id} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="ep-catalog__toggle-wrap">
                      <button
                        className={`ep-catalog__toggle${showAll ? ' ep-catalog__toggle--open' : ''}`}
                        onClick={() => setShowAll((v) => !v)}
                        type="button"
                      >
                        {showAll ? 'Скрыть' : `Показать все (${state.excursions.length})`}
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </section>

          <footer className="ep-footer">
            <div className="ep-footer__brand">
              <span className="ep-footer__logo">T-GUIDE</span>
              <p className="ep-footer__tagline">Аудиогид по городу</p>
            </div>
            <p className="ep-footer__desc">
              Готовые маршруты с описаниями достопримечательностей, точки интереса рядом с вами и удобная навигация по улицам — всё в одном месте.
            </p>
            <div className="ep-footer__features">
              <span className="ep-footer__feature">Аудиоэкскурсии</span>
              <span className="ep-footer__feature">Готовые маршруты</span>
              <span className="ep-footer__feature">Места рядом</span>
              <span className="ep-footer__feature">Пешие прогулки</span>
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
  const text = stop.description || stop.shortDescription
  const preview = [
    stop.expectedVisitMinutes > 0 && formatDuration(stop.expectedVisitMinutes),
    stop.scheduleLabel,
  ].filter(Boolean).join(' · ')

  return (
    <div className={`ep-stop${isExpanded ? ' ep-stop--open' : ''}`}>
      <button className="ep-stop__header" onClick={onToggle} type="button">
        <span className="ep-stop__order">{stop.order}</span>
        <div className="ep-stop__info">
          <span className="ep-stop__cat">{formatPointCategory(stop.category)}</span>
          <span className="ep-stop__name">{stop.title}</span>
          {preview ? <span className="ep-stop__preview">{preview}</span> : null}
        </div>
        <span aria-hidden="true" className={`ep-stop__chevron${isExpanded ? ' ep-stop__chevron--open' : ''}`}>
          +
        </span>
      </button>

      <div className={`ep-stop__body${isExpanded ? ' ep-stop__body--open' : ''}`}>
        <div className="ep-stop__body-inner">
          {text ? <p className="ep-stop__desc">{text}</p> : null}
          <div className="ep-stop__meta">
            {stop.rating > 0 ? <span className="ep-stop__chip">★ {stop.rating.toFixed(1)}</span> : null}
            {stop.expectedVisitMinutes > 0 ? <span className="ep-stop__chip">{formatDuration(stop.expectedVisitMinutes)}</span> : null}
            {stop.scheduleLabel ? <span className="ep-stop__chip">{stop.scheduleLabel}</span> : null}
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
        <div className="ep-card__header">
          <span className="ep-card__district">{excursion.district}</span>
          <h3 className="ep-card__title">{excursion.title}</h3>
          <p className="ep-card__tagline">{excursion.tagline}</p>
          <p className="ep-card__description">{excursion.description}</p>
        </div>

        <div className="ep-card__stats">
          <span className="ep-card__stat">{formatDistance(excursion.distanceKm)}</span>
          <span className="ep-card__stat">{formatStopCount(excursion.stops.length)}</span>
          <span className="ep-card__stat">{formatDuration(excursion.durationMinutes)}</span>
        </div>

        <div className="ep-card__details">
          <span className="ep-card__detail"><strong>Сложность:</strong> {formatDifficulty(excursion.difficulty)}</span>
          <span className="ep-card__detail"><strong>Для кого:</strong> {excursion.audienceLabel}</span>
          <span className="ep-card__detail"><strong>Старт:</strong> {excursion.startLabel}</span>
          <span className="ep-card__detail"><strong>Финиш:</strong> {excursion.finishLabel}</span>
        </div>

        <Link className="button button--primary ep-card__open" to={appRoutes.excursion(excursion.slug)}>
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
