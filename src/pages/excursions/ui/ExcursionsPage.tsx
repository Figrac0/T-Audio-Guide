import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Excursion, NearbyPoint, RouteStop } from '@/entities/excursion/model/types'
import {
  durationOptions,
  themeOptions,
  useExcursionsPageState,
} from '@/pages/excursions/model/useExcursionsPageState'
import { formatMeters } from '@/features/route-map/lib/route-geometry'
import { appRoutes } from '@/shared/config/routes'
import {
  formatDifficulty,
  formatDistance,
  formatDuration,
  formatPointCategory,
  formatStopCount,
  formatTheme,
} from '@/shared/lib/format'
import { buildPlacePlaceholderImage, buildRoutePlaceholderImage } from '@/shared/lib/placeholder-images'
import { FooterFeatureIcon } from '@/shared/ui/FooterFeatureIcon'
import { ResilientImage } from '@/shared/ui/ResilientImage'
import { RouteBuilderMap, type RouteBuilderMapHandle } from './RouteBuilderMap'
import './ExcursionsPage.css'

const DRAG_MIN = 10
const CLOSED_HEIGHT = 52        // drag handle bar only — always visible
const INTERMEDIATE_PEEK_HEIGHT = 124 // 52px bar + 72px draft-preview bar

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

function clampSheetTranslate(value: number, maxTranslate: number) {
  return Math.min(maxTranslate, Math.max(DRAG_MIN, value))
}

function getSheetTranslateY(el: HTMLElement): number {
  const t = window.getComputedStyle(el).transform
  if (!t || t === 'none') return 0
  const m = t.match(/matrix\(([^)]+)\)/)
  if (!m) return 0
  return parseFloat(m[1].split(',')[5] ?? '0')
}

export function ExcursionsPage() {
  const state = useExcursionsPageState()
  const [showAll, setShowAll] = useState(false)
  const catalogInitial = useCatalogInitial()
  const draftPointOrders = useMemo(
    () =>
      new Map(
        state.draftStops.map((stop, index) => [
          stop.id.replace(/-draft-stop(?:-\d+)?$/, ''),
          index + 1,
        ]),
      ),
    [state.draftStops],
  )

  const hasDraftStops = state.draftStops.length > 0
  const lastDraftStop = hasDraftStops ? state.draftStops[state.draftStops.length - 1] : null

  const [sheetTranslate, setSheetTranslate] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mapHandleRef = useRef<RouteBuilderMapHandle>(null)
  const hasMeasuredRef = useRef(false)
  const peekTranslateRef = useRef(0)
  const closedTranslateRef = useRef(0)
  const sheetTranslateRef = useRef(0)
  const hasDraftStopsRef = useRef(hasDraftStops)
  const prevHasDraftRef = useRef(false)
  const draftPreviewRef = useRef<HTMLDivElement>(null)
  const isDetailModeRef = useRef(false)
  const handleCloseDetailRef = useRef<() => void>(() => {})
  const dragRef = useRef({
    active: false,
    startPointerY: 0,
    startTranslate: 0,
    lastPointerY: 0,
    lastTime: 0,
    velocity: 0,
  })

  useEffect(() => {
    document.body.classList.add('app-body--routes-page')
    return () => document.body.classList.remove('app-body--routes-page')
  }, [])

  useEffect(() => { hasDraftStopsRef.current = hasDraftStops }, [hasDraftStops])

  // Derived display state — must be declared before any effect that reads it
  const isFullyOpen = !isDragging && sheetTranslate <= DRAG_MIN + 2

  const syncSheetPosition = useCallback((nextTranslate: number) => {
    const sheet = sheetRef.current
    if (!sheet) return
    const safe = clampSheetTranslate(nextTranslate, closedTranslateRef.current)
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${safe}px)`
    sheetTranslateRef.current = safe
    setSheetTranslate(safe)
  }, [])

  const animateSheetPosition = useCallback((nextTranslate: number, durationMs = 480) => {
    const sheet = sheetRef.current
    if (!sheet) return
    const safe = clampSheetTranslate(nextTranslate, closedTranslateRef.current)
    const fromY = getSheetTranslateY(sheet)
    sheet.style.willChange = 'transform'
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${fromY}px)`
    void sheet.offsetHeight
    sheet.style.transition = `transform ${durationMs}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`
    sheet.style.transform = `translateY(${safe}px)`
    sheetTranslateRef.current = safe
    setSheetTranslate(safe)
    const clear = () => { sheet.style.willChange = '' }
    sheet.addEventListener('transitionend', clear, { once: true })
    setTimeout(clear, durationMs + 100)
  }, [])

  const snapToClosed = useCallback(() => {
    animateSheetPosition(closedTranslateRef.current)
  }, [animateSheetPosition])

  const closeDetailMode = useCallback(() => {
    handleCloseDetailRef.current()
    const hasDraft = hasDraftStopsRef.current
    animateSheetPosition(hasDraft ? peekTranslateRef.current : closedTranslateRef.current)
  }, [animateSheetPosition])

  const updateSheetBounds = useCallback((hasDraft: boolean) => {
    if (!hasMeasuredRef.current) return // first-measure is handled by useLayoutEffect
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return
    const sheetH = sheet.offsetHeight
    const closedT = Math.max(DRAG_MIN, sheetH - CLOSED_HEIGHT)
    const peekT = hasDraft
      ? Math.max(DRAG_MIN, sheetH - INTERMEDIATE_PEEK_HEIGHT)
      : closedT
    closedTranslateRef.current = closedT
    peekTranslateRef.current = peekT
    // Clamp current position only if it's out of the valid range
    const curr = sheetTranslateRef.current
    if (curr > closedT || curr < DRAG_MIN) {
      syncSheetPosition(Math.min(closedT, Math.max(DRAG_MIN, curr)))
    }
  }, [syncSheetPosition])

  // NOTE: refs are always written directly by syncSheetPosition / animateSheetPosition /
  // useLayoutEffect.  These state-to-ref syncs would overwrite the freshly-set ref values
  // with stale initial state (0) on the first render cycle, causing the sheet to snap to
  // full-open.  They are intentionally omitted.

  // First measure: position sheet at closed, then track resize
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const doFirstMeasure = () => {
      if (sheet.offsetHeight === 0 || hasMeasuredRef.current) return
      const sheetH = sheet.offsetHeight
      const closedT = Math.max(DRAG_MIN, sheetH - CLOSED_HEIGHT)
      const peekT = hasDraftStopsRef.current
        ? Math.max(DRAG_MIN, sheetH - INTERMEDIATE_PEEK_HEIGHT)
        : closedT
      hasMeasuredRef.current = true
      closedTranslateRef.current = closedT
      peekTranslateRef.current = peekT
      syncSheetPosition(closedT)
    }
    doFirstMeasure()
    const frameId = window.requestAnimationFrame(doFirstMeasure)

    const onResize = () => {
      if (!dragRef.current.active) updateSheetBounds(hasDraftStopsRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
    }
  }, [syncSheetPosition, updateSheetBounds])

  // Update bounds when draft count changes; snap to correct position
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => updateSheetBounds(hasDraftStops))
    return () => window.cancelAnimationFrame(frameId)
  }, [hasDraftStops, updateSheetBounds])

  useEffect(() => {
    const prev = prevHasDraftRef.current
    prevHasDraftRef.current = hasDraftStops
    if (!hasMeasuredRef.current) return
    if (!prev && hasDraftStops) {
      // First draft added → peek to show the draft preview bar
      animateSheetPosition(peekTranslateRef.current)
    } else if (prev && !hasDraftStops) {
      // All drafts cleared/saved → collapse to closed
      animateSheetPosition(closedTranslateRef.current)
    }
  }, [hasDraftStops, animateSheetPosition])

  // Close sheet when burger opens; close burger when sheet is fully open
  useEffect(() => {
    window.addEventListener('app-menu-open', snapToClosed)
    return () => window.removeEventListener('app-menu-open', snapToClosed)
  }, [snapToClosed])

  useEffect(() => {
    if (isFullyOpen) window.dispatchEvent(new CustomEvent('app-sheet-open'))
  }, [isFullyOpen])

  useEffect(() => {
    handleCloseDetailRef.current = state.handleCloseDetail
  }, [state.handleCloseDetail])

  useEffect(() => {
    isDetailModeRef.current = Boolean(state.detailPoint)
  }, [state.detailPoint])

  useEffect(() => {
    if (state.detailPoint && hasMeasuredRef.current) {
      animateSheetPosition(DRAG_MIN)
    }
  }, [state.detailPoint, animateSheetPosition])

  // Scroll-to-close: fully open + deliberate overscroll past the top → close.
  // Uses reachedTopAt to distinguish "scrolled to top" from "swiping down to close".
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    let reachedTopAt = -1

    const onTouchStart = (e: TouchEvent) => {
      reachedTopAt = body.scrollTop === 0 ? e.touches[0].clientY : -1
    }
    const onTouchMove = (e: TouchEvent) => {
      if (sheetTranslateRef.current > DRAG_MIN + 2) return // only when fully open
      const currentY = e.touches[0].clientY
      if (body.scrollTop === 0 && reachedTopAt < 0) reachedTopAt = currentY
      if (reachedTopAt < 0 || body.scrollTop > 0) return
      if (currentY - reachedTopAt > 52) {
        reachedTopAt = Infinity
        animateSheetPosition(closedTranslateRef.current)
        if (isDetailModeRef.current) {
          setTimeout(() => { handleCloseDetailRef.current() }, 560)
        }
      }
    }
    const onTouchEnd = () => { reachedTopAt = -1 }

    body.addEventListener('touchstart', onTouchStart, { passive: true })
    body.addEventListener('touchmove', onTouchMove, { passive: true })
    body.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      body.removeEventListener('touchstart', onTouchStart)
      body.removeEventListener('touchmove', onTouchMove)
      body.removeEventListener('touchend', onTouchEnd)
    }
  }, [animateSheetPosition])

  const handleSheetToggle = useCallback(() => {
    if (isDragging) return
    if (isDetailModeRef.current) {
      closeDetailMode()
      return
    }
    if (sheetTranslateRef.current <= DRAG_MIN + 2) {
      // Fully open → collapse to closed
      animateSheetPosition(closedTranslateRef.current)
    } else {
      // Closed or peeking → expand to full
      mapHandleRef.current?.closePopup()
      animateSheetPosition(DRAG_MIN)
    }
  }, [isDragging, animateSheetPosition, closeDetailMode])

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current
    if (!sheet) return
    mapHandleRef.current?.closePopup()
    event.currentTarget.setPointerCapture(event.pointerId)
    // Catch actual visual position — sheetTranslateRef holds the animation target,
    // not where the sheet is visually when drag begins mid-animation.
    const currentT = getSheetTranslateY(sheet)
    sheetTranslateRef.current = currentT
    dragRef.current = {
      active: true,
      startPointerY: event.clientY,
      startTranslate: currentT,
      lastPointerY: event.clientY,
      lastTime: Date.now(),
      velocity: 0,
    }
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${currentT}px)`
    sheet.style.willChange = 'transform'
    setIsDragging(true)
  }, [])

  const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const sheet = sheetRef.current
    if (!sheet) return
    const raw = dragRef.current.startTranslate + (event.clientY - dragRef.current.startPointerY)
    const nextY = clampSheetTranslate(raw, closedTranslateRef.current)
    sheet.style.transform = `translateY(${nextY}px)`
    sheetTranslateRef.current = nextY

    // Animate preview bar height during drag so it tracks the sheet position.
    const preview = draftPreviewRef.current
    if (preview && hasDraftStopsRef.current && !isDetailModeRef.current) {
      const range = peekTranslateRef.current - DRAG_MIN
      const progress = range > 0
        ? Math.max(0, Math.min(1, (nextY - DRAG_MIN) / range))
        : (nextY > DRAG_MIN ? 1 : 0)
      preview.style.maxHeight = `${72 * progress}px`
    }

    const now = Date.now()
    const dt = Math.max(1, now - dragRef.current.lastTime)
    dragRef.current.velocity = ((event.clientY - dragRef.current.lastPointerY) / dt) * 16
    dragRef.current.lastPointerY = event.clientY
    dragRef.current.lastTime = now
  }, [])

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setIsDragging(false)

    const sheet = sheetRef.current
    if (!sheet) return

    // Clear drag-time inline styles — CSS transitions + isFullyOpen class take over
    const preview = draftPreviewRef.current
    if (preview) preview.style.maxHeight = ''

    const current = sheetTranslateRef.current
    const velocity = dragRef.current.velocity
    const fullT = DRAG_MIN
    const closedT = closedTranslateRef.current
    const absV = Math.abs(velocity)
    const durationMs = absV > 12 ? 300 : absV > 6 ? 400 : 480

    const clear = () => { sheet.style.willChange = '' }
    sheet.addEventListener('transitionend', clear, { once: true })
    setTimeout(clear, 580)

    if (isDetailModeRef.current) {
      const snaps = [fullT, closedT]
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < snaps.length; i++) {
        const d = Math.abs(current - snaps[i])
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      if (velocity > 5 && bestIdx < snaps.length - 1) bestIdx++
      else if (velocity < -5 && bestIdx > 0) bestIdx--

      animateSheetPosition(snaps[bestIdx], durationMs)
      if (snaps[bestIdx] === closedT) {
        setTimeout(() => { handleCloseDetailRef.current() }, durationMs + 80)
      }
      return
    }

    const peekT = peekTranslateRef.current
    const hasDraft = hasDraftStopsRef.current
    const snaps = hasDraft ? [fullT, peekT, closedT] : [fullT, closedT]

    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < snaps.length; i++) {
      const d = Math.abs(current - snaps[i])
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    if (velocity > 5 && bestIdx < snaps.length - 1) bestIdx++
    else if (velocity < -5 && bestIdx > 0) bestIdx--

    animateSheetPosition(snaps[bestIdx], durationMs)
  }, [animateSheetPosition])

  const hasMoreExcursions = state.excursions.length > catalogInitial

  return (
    <div className="ep">
      <div className="ep__map">
        <RouteBuilderMap
          ref={mapHandleRef}
          draftPointOrders={draftPointOrders}
          isDraftFull={state.draftStops.length >= 6}
          isLoading={state.isLoading || !state.canLoadNearbyPlaces}
          nearbyPoints={state.nearbyPoints}
          onAddPoint={state.handleAddPoint}
          onChangeRadius={state.setRadiusMeters}
          onPopupClose={state.handlePopupClose}
          onRemovePoint={state.handleRemovePointFromDraft}
          onSelectPoint={state.handleSelectPoint}
          onShowDetail={state.handleShowDetail}
          radiusMeters={state.radiusMeters}
          recenterKey={state.recenterKey}
          routeState={state.routeState}
          selectedPointId={state.selectedPointId}
          userPosition={state.userPosition}
        />
      </div>

      {state.notice ? (
        <div className="ep__notice" role="status">{state.notice}</div>
      ) : null}

      {state.geolocationError ? <p className="ep__geo-error">{state.geolocationError}</p> : null}

      <div className="ep-sheet" ref={sheetRef}>
        {/* ── Drag handle bar ── */}
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
          <div className="ep-sheet__bar-row">
            <div className="ep-sheet__handle" />
            <Link
              aria-label="Открыть профиль"
              className="ep-sheet__profile"
              onPointerDown={(e) => e.stopPropagation()}
              to={appRoutes.profile}
            >
              <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M5.5 20c1.1-4 3.4-6 6.5-6s5.4 2 6.5 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            </Link>
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

          {/* Draft preview: visible only when sheet is at peek (partial) */}
          {lastDraftStop && (
            <div
              className={`ep-sheet__draft-preview${isFullyOpen ? ' ep-sheet__draft-preview--hidden' : ''}`}
              ref={draftPreviewRef}
            >
              <div className="ep-sheet__dp-info">
                <span className="ep-sheet__dp-order">{state.draftStops.length}</span>
                <div className="ep-sheet__dp-text">
                  <span className="ep-sheet__dp-cat">
                    {formatPointCategory(lastDraftStop.category)}
                  </span>
                  <span className="ep-sheet__dp-name">{lastDraftStop.title}</span>
                  {lastDraftStop.scheduleLabel && (
                    <span className="ep-sheet__dp-schedule">{lastDraftStop.scheduleLabel}</span>
                  )}
                </div>
              </div>
              <button
                className="ep-sheet__dp-remove"
                onClick={() => state.handleRemoveStop(lastDraftStop.id)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                Убрать
              </button>
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div
          className={state.detailPoint ? 'ep-sheet__body ep-sheet__body--detail' : 'ep-sheet__body'}
          ref={bodyRef}
          style={{ overflowY: isFullyOpen ? undefined : 'hidden' }}
        >
          {state.detailPoint ? (
            <PointDetailPanel point={state.detailPoint} />
          ) : (
          <>
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
          ) : (
            <div className="ep-sheet__empty-hint">
              Выбирайте точки на карте и составляйте свой маршрут
            </div>
          )}

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
            <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="audio" /></span>Аудиоэкскурсии</span>
            <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="routes" /></span>Готовые маршруты</span>
            <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="nearby" /></span>Места рядом</span>
            <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="walking" /></span>Пешие прогулки</span>
          </div>
            <p className="ep-footer__copy">© T-Guide · Открывайте город пешком</p>
          </footer>
          </>
          )}
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

const DraftStopCard = memo(function DraftStopCard({ isExpanded, onRemove, onToggle, stop }: DraftStopCardProps) {
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
})

// ── ExcursionCard ─────────────────────────────────────────────────────────────

interface ExcursionCardProps {
  excursion: Excursion
}

const ExcursionCard = memo(function ExcursionCard({ excursion }: ExcursionCardProps) {
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
})

// ── PointDetailPanel ──────────────────────────────────────────────────────────

interface PointDetailPanelProps {
  point: NearbyPoint
}

function PointDetailPanel({ point }: PointDetailPanelProps) {
  const walkMinutes = Math.max(1, Math.round((point.distanceMeters / 1000) * 12))
  const placeholder = buildPlacePlaceholderImage(point.category)
  const detailDescription = point.description || point.shortDescription

  return (
    <div className="ep-detail">
      <div className="ep-detail__cover-shell">
        <div className="ep-detail__cover">
          <img
            alt={point.title}
            onError={(e) => { (e.target as HTMLImageElement).src = placeholder }}
            src={point.imageUrl || placeholder}
          />
          <span className="ep-detail__cat">{formatPointCategory(point.category)}</span>
        </div>
      </div>

      <div className="ep-detail__body">
        <div className="ep-detail__metrics" role="list" aria-label="Краткие метрики точки">
          <span className="ep-detail__metric-chip" role="listitem">{formatMeters(point.distanceMeters)}</span>
          <span className="ep-detail__metric-chip" role="listitem">~{walkMinutes} мин</span>
          {point.rating > 0 ? (
            <span className="ep-detail__metric-chip ep-detail__metric-chip--accent" role="listitem">
              ★ {point.rating.toFixed(1)}
            </span>
          ) : null}
        </div>

        <div className="ep-detail__heading">
          <h2 className="ep-detail__title">{point.title}</h2>
          {point.scheduleLabel && (
            <span className="ep-detail__schedule">{point.scheduleLabel}</span>
          )}
        </div>

        {detailDescription && (
          <p className="ep-detail__full-desc">{detailDescription}</p>
        )}

        {point.addressLabel && (
          <p className="ep-detail__address">
            {point.addressLabel}
          </p>
        )}
      </div>

      <footer className="ep-footer ep-detail__footer">
        <div className="ep-footer__brand">
          <span className="ep-footer__logo">T-GUIDE</span>
          <p className="ep-footer__tagline">Что дальше</p>
        </div>
        <p className="ep-footer__desc">
          После знакомства с точкой можно вернуться к маршруту, перейти к следующей остановке
          или открыть другие места поблизости в том же районе.
        </p>
        <div className="ep-footer__features">
          <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="back" /></span>Вернуться к маршруту</span>
          <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="routes" /></span>Изучить другие точки</span>
          <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="time" /></span>Проверить время работы</span>
          <span className="ep-footer__feature"><span aria-hidden="true" className="ep-footer__feature-icon"><FooterFeatureIcon name="walking" /></span>Продолжить прогулку</span>
        </div>
        <p className="ep-footer__copy">© T-Guide · Полезные подсказки по точке маршрута</p>
      </footer>
    </div>
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
