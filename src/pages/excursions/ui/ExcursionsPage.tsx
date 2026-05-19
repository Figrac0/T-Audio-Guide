import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Link } from 'react-router-dom'

import type { Excursion, NearbyPoint, RouteStop } from '@/entities/excursion/model/types'
import { usePointDetailsMap } from '@/entities/excursion/model/usePointDetailsMap'
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
  getPointCategoryLabel,
} from '@/shared/lib/format'
import { buildPlacePlaceholderImage, buildRoutePlaceholderImage } from '@/shared/lib/placeholder-images'
import { useAnimatedItems } from '@/shared/lib/useAnimatedItems'
import { useManualPosition } from '@/shared/lib/ManualPositionContext'
import { FooterFeatureIcon } from '@/shared/ui/FooterFeatureIcon'
import { ResilientImage } from '@/shared/ui/ResilientImage'
import { SmartPlaceImage } from '@/shared/ui/SmartPlaceImage'
import { RouteBuilderMap, type RouteBuilderMapHandle } from './RouteBuilderMap'
import './ExcursionsPage.css'

const DRAG_MIN = 10
const CLOSED_HEIGHT = 52        // drag handle bar only — always visible
const INTERMEDIATE_PEEK_HEIGHT = 124 // 52px bar + 72px draft-preview bar
const SHEET_SNAP_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const SHEET_SNAP_DURATION_MS = 480
const SHEET_SNAP_FAST_DURATION_MS = 300
const SHEET_SNAP_MEDIUM_DURATION_MS = 400
const getExcursionKey = (excursion: Excursion) => excursion.slug

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
  const { isOverrideActive, manualPosition, mode: overrideMode, setManualPosition, toggleOverride } = useManualPosition()
  const effectiveUserPosition = isOverrideActive ? manualPosition : null
  const state = useExcursionsPageState(effectiveUserPosition, effectiveUserPosition)
  const [showAll, setShowAll] = useState(false)
  const [dismissedGeoError, setDismissedGeoError] = useState<string | null>(null)
  const finalEffectiveUserPosition = effectiveUserPosition ?? state.userPosition
  const catalogInitial = useCatalogInitial()
  const catalogContentRef = useRef<HTMLDivElement>(null)
  const [catalogContentHeight, setCatalogContentHeight] = useState<number | null>(null)
  const catalogSignature = useMemo(() => {
    if (state.excursions.length) {
      return `items:${state.excursions.map((excursion) => excursion.slug).join('|')}`
    }

    return `status:${state.discoveryError ? 'error' : 'empty'}`
  }, [state.discoveryError, state.excursions])
  const { items: catalogExcursions, phase: catalogPhase } = useAnimatedItems(state.excursions, {
    getKey: getExcursionKey,
    signature: catalogSignature,
  })
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

  useLayoutEffect(() => {
    const node = catalogContentRef.current
    if (!node) return undefined

    const updateHeight = () => {
      setCatalogContentHeight(Math.ceil(node.getBoundingClientRect().height))
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)

    return () => observer.disconnect()
  }, [catalogExcursions, catalogPhase, state.discoveryError])

  const hasDraftStops = state.draftStops.length > 0
  const lastDraftStop = hasDraftStops ? state.draftStops[state.draftStops.length - 1] : null
  const isDraftAtLimit = state.draftStops.length >= 10

  // ── Drag-to-reorder state ───────────────────────────────────────────────────
  const [reorderState, setReorderState] = useState<{ stopId: string; overIdx: number } | null>(null)
  const reorderStateRef = useRef<{ stopId: string; overIdx: number } | null>(null)
  const isReorderingRef = useRef(false)
  const draftStopsRef = useRef(state.draftStops)
  const handleReorderStopRef = useRef(state.handleReorderStop)
  const stopsContainerRef = useRef<HTMLDivElement>(null)
  const nearbyListRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const nearbyScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nearbyScrollRafRef = useRef<number | null>(null)
  const nearbyScrollDirRef = useRef<0 | 1 | -1>(0)
  const nearbyScrollIsHoldRef = useRef(false)

  useEffect(() => { draftStopsRef.current = state.draftStops }, [state.draftStops])
  useEffect(() => { handleReorderStopRef.current = state.handleReorderStop }, [state.handleReorderStop])

  // Bump badge when user tries to add beyond the 10-stop limit
  useEffect(() => {
    if (!state.draftFullBumpKey) return
    const badge = badgeRef.current
    if (!badge) return
    badge.classList.remove('ep-draft__badge--bump')
    void badge.offsetHeight
    badge.classList.add('ep-draft__badge--bump')
  }, [state.draftFullBumpKey])

  useEffect(() => {
    return () => {
      if (nearbyScrollTimerRef.current !== null) clearTimeout(nearbyScrollTimerRef.current)
      if (nearbyScrollRafRef.current !== null) cancelAnimationFrame(nearbyScrollRafRef.current)
    }
  }, [])

  const nearbyScrollDown = useCallback((dir: 1 | -1) => {
    nearbyScrollDirRef.current = dir
    nearbyScrollIsHoldRef.current = false
    nearbyScrollTimerRef.current = setTimeout(() => {
      nearbyScrollIsHoldRef.current = true
      const el = nearbyListRef.current
      if (!el) return
      const tick = () => {
        if (nearbyScrollDirRef.current === 0) return
        el.scrollLeft += nearbyScrollDirRef.current * 5
        nearbyScrollRafRef.current = requestAnimationFrame(tick)
      }
      nearbyScrollRafRef.current = requestAnimationFrame(tick)
    }, 300)
  }, [])

  const nearbyScrollUp = useCallback(() => {
    const dir = nearbyScrollDirRef.current
    nearbyScrollDirRef.current = 0
    if (nearbyScrollTimerRef.current !== null) {
      clearTimeout(nearbyScrollTimerRef.current)
      nearbyScrollTimerRef.current = null
    }
    if (nearbyScrollRafRef.current !== null) {
      cancelAnimationFrame(nearbyScrollRafRef.current)
      nearbyScrollRafRef.current = null
    }
    if (!nearbyScrollIsHoldRef.current && dir !== 0) {
      const el = nearbyListRef.current
      if (el) el.scrollBy({ left: dir * 480, behavior: 'smooth' })
    }
  }, [])

  const displayedStops = useMemo(() => {
    if (!reorderState) return state.draftStops
    const { stopId, overIdx } = reorderState
    const srcIdx = state.draftStops.findIndex(s => s.id === stopId)
    if (srcIdx === -1) return state.draftStops
    const reordered = [...state.draftStops]
    const [moved] = reordered.splice(srcIdx, 1)
    reordered.splice(overIdx, 0, moved)
    return reordered.map((s, i) => ({ ...s, order: i + 1 }))
  }, [reorderState, state.draftStops])

  const handleReorderStart = useCallback((stopIdx: number) => {
    const stop = draftStopsRef.current[stopIdx]
    if (!stop) return
    const initial = { stopId: stop.id, overIdx: stopIdx }
    isReorderingRef.current = true
    reorderStateRef.current = initial
    setReorderState(initial)

    const onMove = (e: PointerEvent) => {
      const container = stopsContainerRef.current
      if (!container) return
      const items = [...container.children] as HTMLElement[]
      let bestIdx = 0, bestDist = Infinity
      for (let i = 0; i < items.length; i++) {
        const { top, height } = items[i].getBoundingClientRect()
        const mid = top + height / 2
        const d = Math.abs(e.clientY - mid)
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      setReorderState(prev => {
        if (!prev || prev.overIdx === bestIdx) return prev
        const next = { ...prev, overIdx: bestIdx }
        reorderStateRef.current = next
        return next
      })
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      const cur = reorderStateRef.current
      isReorderingRef.current = false
      reorderStateRef.current = null
      setReorderState(null)
      if (cur) {
        const fromIdx = draftStopsRef.current.findIndex(s => s.id === cur.stopId)
        if (fromIdx !== -1 && fromIdx !== cur.overIdx) {
          handleReorderStopRef.current(fromIdx, cur.overIdx)
        }
      }
    }

    // Passive listeners — none of these handlers call preventDefault, so
    // marking passive lets the browser scroll/compose without waiting on JS.
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointercancel', onUp, { passive: true })
  }, [])

  // ── Sheet state ─────────────────────────────────────────────────────────────
  const [sheetTranslate, setSheetTranslate] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mapHandleRef = useRef<RouteBuilderMapHandle>(null)
  const hasMeasuredRef = useRef(false)
  const peekTranslateRef = useRef(0)
  const closedTranslateRef = useRef(0)
  const sheetTranslateRef = useRef(0)
  const animationCleanupRef = useRef<number | null>(null)
  const animationVersionRef = useRef(0)
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
    return () => {
      document.body.classList.remove('app-body--routes-page')
      isReorderingRef.current = false
      if (animationCleanupRef.current !== null) {
        window.clearTimeout(animationCleanupRef.current)
      }
    }
  }, [])

  useEffect(() => { hasDraftStopsRef.current = hasDraftStops }, [hasDraftStops])

  useEffect(() => {
    if (!hasDraftStops || state.nearbyPoints.length === 0) return
    // Arrow buttons handle scrolling on desktop; skip drag-scroll there
    if (window.matchMedia('(min-width: 768px)').matches) return
    const el = nearbyListRef.current
    if (!el) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0
    let hasDragged = false

    const onMouseDown = (event: MouseEvent) => {
      isDown = true
      hasDragged = false
      startX = event.pageX - el.offsetLeft
      scrollLeft = el.scrollLeft
      el.style.cursor = 'grabbing'
    }

    const stopDrag = () => {
      isDown = false
      el.style.cursor = ''
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!isDown) return
      const x = event.pageX - el.offsetLeft
      const walk = (x - startX) * 1.4
      if (Math.abs(walk) > 4) {
        hasDragged = true
        event.preventDefault()
      }
      el.scrollLeft = scrollLeft - walk
    }

    const onClickCapture = (event: MouseEvent) => {
      if (!hasDragged) return
      event.stopPropagation()
      event.preventDefault()
      hasDragged = false
    }

    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseleave', stopDrag)
    el.addEventListener('mouseup', stopDrag)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('click', onClickCapture, true)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mouseleave', stopDrag)
      el.removeEventListener('mouseup', stopDrag)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('click', onClickCapture, true)
    }
  }, [hasDraftStops, state.nearbyPoints.length])

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

  const animateSheetPosition = useCallback((nextTranslate: number, durationMs = SHEET_SNAP_DURATION_MS) => {
    const sheet = sheetRef.current
    const mapEl = document.querySelector('.ep__map') as HTMLElement | null
    if (!sheet) return
    if (animationCleanupRef.current !== null) {
      window.clearTimeout(animationCleanupRef.current)
      animationCleanupRef.current = null
    }
    const safe = clampSheetTranslate(nextTranslate, closedTranslateRef.current)
    const fromY = getSheetTranslateY(sheet)
    if (mapEl) mapEl.style.pointerEvents = 'none'
    sheet.style.willChange = 'transform'
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${fromY}px)`
    void sheet.offsetHeight
    sheet.style.transition = `transform ${durationMs}ms ${SHEET_SNAP_EASING}`
    sheet.style.transform = `translateY(${safe}px)`
    sheetTranslateRef.current = safe
    setSheetTranslate(safe)
    const animationVersion = animationVersionRef.current + 1
    animationVersionRef.current = animationVersion
    const clear = () => {
      if (animationVersionRef.current !== animationVersion) return
      sheet.style.willChange = ''
      if (mapEl) mapEl.style.pointerEvents = ''
      if (animationCleanupRef.current !== null) {
        window.clearTimeout(animationCleanupRef.current)
        animationCleanupRef.current = null
      }
    }
    sheet.addEventListener('transitionend', clear, { once: true })
    animationCleanupRef.current = window.setTimeout(clear, durationMs + 100)
  }, [])

  const snapToClosed = useCallback(() => {
    animateSheetPosition(closedTranslateRef.current)
  }, [animateSheetPosition])

  const closeDetailMode = useCallback(() => {
    handleCloseDetailRef.current()
    const hasDraft = hasDraftStopsRef.current
    animateSheetPosition(hasDraft ? peekTranslateRef.current : closedTranslateRef.current)
  }, [animateSheetPosition])

  const handleToggleOverride = useCallback(() => {
    if (overrideMode === 'off') animateSheetPosition(closedTranslateRef.current)
    toggleOverride()
  }, [overrideMode, animateSheetPosition, toggleOverride])

  const handleMapClick = useCallback((coords: { lat: number; lng: number }) => {
    if (overrideMode === 'waiting') {
      setManualPosition(coords)
    }
  }, [overrideMode, setManualPosition])

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

    let resizeRafId: number | null = null
    const onResize = () => {
      if (dragRef.current.active) return
      if (resizeRafId !== null) window.cancelAnimationFrame(resizeRafId)
      resizeRafId = window.requestAnimationFrame(() => {
        resizeRafId = null
        updateSheetBounds(hasDraftStopsRef.current)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(frameId)
      if (resizeRafId !== null) window.cancelAnimationFrame(resizeRafId)
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
      animateSheetPosition(DRAG_MIN, 600)
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
      if (isReorderingRef.current) return
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
    if (isDragging || isReorderingRef.current) return
    if (isDetailModeRef.current) {
      closeDetailMode()
      return
    }
    if (sheetTranslateRef.current <= DRAG_MIN + 2) {
      // Fully open → collapse to closed
      animateSheetPosition(closedTranslateRef.current)
    } else {
      // Closed or peeking → expand to full (slightly slower for a smoother feel)
      mapHandleRef.current?.closePopup()
      animateSheetPosition(DRAG_MIN, 600)
    }
  }, [isDragging, animateSheetPosition, closeDetailMode])

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isReorderingRef.current) return
    const sheet = sheetRef.current
    const mapEl = document.querySelector('.ep__map') as HTMLElement | null
    if (!sheet) return
    mapHandleRef.current?.closePopup()
    if (mapEl) mapEl.style.pointerEvents = 'none'
    event.currentTarget.setPointerCapture(event.pointerId)
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
    const mapEl = document.querySelector('.ep__map') as HTMLElement | null
    if (!sheet) return

    if (mapEl) mapEl.style.pointerEvents = ''
    const preview = draftPreviewRef.current
    if (preview) preview.style.maxHeight = ''

    const current = sheetTranslateRef.current
    const velocity = dragRef.current.velocity
    const fullT = DRAG_MIN
    const closedT = closedTranslateRef.current
    const absV = Math.abs(velocity)
    const durationMs = absV > 12
      ? SHEET_SNAP_FAST_DURATION_MS
      : absV > 6
        ? SHEET_SNAP_MEDIUM_DURATION_MS
        : SHEET_SNAP_DURATION_MS

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

  const hasMoreExcursions = catalogExcursions.length > catalogInitial
  const catalogShellStyle =
    catalogContentHeight === null
      ? undefined
      : ({ '--ep-catalog-min-height': `${catalogContentHeight}px` } as CSSProperties)
  const shouldShowGeoError =
    Boolean(state.geolocationError) &&
    state.geolocationError !== dismissedGeoError &&
    !state.userPosition &&
    !isOverrideActive &&
    !isFullyOpen

  // Search results carry no photos or full description — backfill from
  // /points/{id} so the nearby strip and detail panel show real data.
  const nearbyPointIds = useMemo(
    () => state.nearbyPoints.map((point) => point.id),
    [state.nearbyPoints],
  )
  const pointDetailsMap = usePointDetailsMap(nearbyPointIds)

  const detailPoint = useMemo<NearbyPoint | null>(() => {
    const base = state.detailPoint
    if (!base) return null
    const data = pointDetailsMap.get(base.id)
    if (!data) return base
    return {
      ...base,
      description: data.description || base.description,
      shortDescription: data.shortDescription || base.shortDescription,
      imageUrl: data.imageUrl || base.imageUrl,
      addressLabel: base.addressLabel || data.address || undefined,
      scheduleLabel: base.scheduleLabel || data.workingHours,
      audioGuideUrl: data.audioUrl || base.audioGuideUrl,
      audioTranscript: data.audioTranscript ?? base.audioTranscript ?? null,
    }
  }, [state.detailPoint, pointDetailsMap])

  return (
    <div className="ep">
      <div className="ep__map">
        <RouteBuilderMap
          ref={mapHandleRef}
          draftPointOrders={draftPointOrders}
          initialCenter={state.center}
          isDraftFull={isDraftAtLimit}
          isLoading={state.isLoading || !state.canLoadNearbyPlaces}
          isMapLocked={overrideMode === 'waiting'}
          nearbyPoints={state.nearbyPoints}
          onAddPoint={state.handleAddPoint}
          onChangeRadius={state.setRadiusMeters}
          onMapClick={handleMapClick}
          onPopupClose={state.handlePopupClose}
          onRemovePoint={state.handleRemovePointFromDraft}
          onSelectPoint={state.handleSelectPoint}
          onShowDetail={state.handleShowDetail}
          radiusMeters={state.radiusMeters}
          recenterKey={state.recenterKey}
          routeState={state.routeState}
          selectedPointId={state.selectedPointId}
          userPosition={finalEffectiveUserPosition}
        />
      </div>

      {state.notice ? (
        <div className="ep__notice" role="status">{state.notice}</div>
      ) : null}

      {state.isSavingRoute && (
        <div className="ep__saving-spinner" aria-label="Сохранение маршрута" role="status">
          <div className="ep__spinner-ring" />
        </div>
      )}

      {shouldShowGeoError ? (
        <div className="ep__geo-error" role="status">
          <span className="ep__geo-error-text">{state.geolocationError}</span>
          <button
            aria-label="Скрыть уведомление о геолокации"
            className="ep__geo-error-close"
            onClick={() => setDismissedGeoError(state.geolocationError)}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}

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
            <button
              aria-label={overrideMode !== 'off' ? "Вернуться к реальной геопозиции" : "Установить собственное местоположение"}
              className={`ep-sheet__profile${overrideMode !== 'off' ? ' ep-sheet__profile--active' : ''}`}
              disabled={hasDraftStops}
              onClick={handleToggleOverride}
              onPointerDown={(e) => e.stopPropagation()}
              title={hasDraftStops ? "Недоступно при наличии точек в маршруте" : (isOverrideActive ? "Нажмите ещё раз чтобы вернуться к реальной геопозиции" : "Нажмите, а затем кликните на карту чтобы установить своё местоположение")}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </button>
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
          {detailPoint ? (
            <PointDetailPanel
              isDraftFull={isDraftAtLimit}
              isInDraft={state.isPointInDraft(detailPoint.id)}
              onAddPoint={() => state.handleAddPoint(detailPoint)}
              onClose={closeDetailMode}
              onRemovePoint={() => state.handleRemovePointFromDraft(detailPoint.id)}
              point={detailPoint}
            />
          ) : (
          <>
          {hasDraftStops ? (
            <section className="ep-draft">
              <div className="ep-draft__head">
                <h2 className="ep-draft__title">
                  {state.editingRouteSlug ? 'Редактирование' : 'Мой маршрут'}
                  <span className="ep-draft__badge" ref={badgeRef}>{state.draftStops.length}/10</span>
                </h2>
              </div>

              <div className="ep-draft__stops" ref={stopsContainerRef}>
                {displayedStops.map((stop, idx) => (
                  <DraftStopCard
                    isDragging={reorderState?.stopId === stop.id}
                    isExpanded={state.expandedStopId === stop.id}
                    isLastAtLimit={isDraftAtLimit && idx === displayedStops.length - 1}
                    key={stop.id}
                    onDragStart={() => handleReorderStart(idx)}
                    onRemove={() => state.handleRemoveStop(stop.id)}
                    onToggle={() => state.setExpandedStopId((cur) => (cur === stop.id ? null : stop.id))}
                    stop={stop}
                  />
                ))}
              </div>

              <div className="ep-draft__actions">
                <button className="ep-draft__action-btn" onClick={state.handleClearRoute} type="button">
                  {state.editingRouteSlug ? 'Отменить редактирование' : 'Сбросить маршрут'}
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

          {/* When building a route: horizontal scrollable card strip (same as home "Рядом с вами").
              Click card = add to route; click again = remove. */}
          {hasDraftStops ? (
            <>
              <div className="ep-nearby-wrap">
                <h3 className="ep-nearby-wrap__title">Рядом с вами</h3>
                {state.nearbyPoints.length > 0 ? (
                  <div className="ep-nearby-carousel">
                    <button
                      aria-label="Прокрутить влево"
                      className="ep-nearby-carousel__arrow ep-nearby-carousel__arrow--prev"
                      onPointerCancel={nearbyScrollUp}
                      onPointerDown={() => nearbyScrollDown(-1)}
                      onPointerLeave={nearbyScrollUp}
                      onPointerUp={nearbyScrollUp}
                      type="button"
                    >
                      <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                        <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                      </svg>
                    </button>
                    <div className="ep-nearby-strip" ref={nearbyListRef}>
                      {state.nearbyPoints.map((point) => {
                        const inDraft = state.isPointInDraft(point.id)
                        return (
                          <button
                            className={`ep-nearby-card${inDraft ? ' ep-nearby-card--active' : ''}`}
                            data-point-id={point.id}
                            key={point.id}
                            onClick={() => {
                              if (inDraft) {
                                state.handleRemovePointFromDraft(point.id)
                              } else {
                                state.handleAddPoint(point)
                              }
                            }}
                            type="button"
                          >
                            <div className="ep-nearby-card__img">
                              <SmartPlaceImage
                                alt={point.title}
                                category={point.category}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                src={pointDetailsMap.get(point.id)?.imageUrl || point.imageUrl}
                                title={point.title}
                              />
                              <span className="ep-nearby-card__dist">{formatMeters(point.distanceMeters)}</span>
                              {inDraft && (
                                <span className="ep-nearby-card__badge" aria-hidden="true">
                                  {draftPointOrders.get(point.id)}
                                </span>
                              )}
                            </div>
                            <div className="ep-nearby-card__body">
                              <span className="ep-nearby-card__cat">{getPointCategoryLabel(point)}</span>
                              <p className="ep-nearby-card__name">{point.title}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <button
                      aria-label="Прокрутить вправо"
                      className="ep-nearby-carousel__arrow ep-nearby-carousel__arrow--next"
                      onPointerCancel={nearbyScrollUp}
                      onPointerDown={() => nearbyScrollDown(1)}
                      onPointerLeave={nearbyScrollUp}
                      onPointerUp={nearbyScrollUp}
                      type="button"
                    >
                      <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                      </svg>
                    </button>
                  </div>
                ) : !state.isLoading ? (
                  <section className={`status-card${state.discoveryError ? ' status-card--error' : ''}`}>
                    <h3 className="status-card__title">
                      {state.discoveryError ? 'Ошибка загрузки' : 'Нет точек рядом'}
                    </h3>
                    <p className="status-card__text">
                      {state.discoveryError
                        ? 'Сервис временно недоступен. Попробуйте перезагрузить страницу.'
                        : 'В этом радиусе нет доступных мест. Попробуйте другой фильтр или отдалите карту.'}
                    </p>
                  </section>
                ) : null}
              </div>

              {/* Decorative art — fills the gap between nearby section and footer */}
              <div aria-hidden="true" className="ep-sheet__art" />
            </>
          ) : (
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
              ) : (
                <div
                  className={`ep-catalog-shell ep-catalog-shell--${catalogPhase}`}
                  style={catalogShellStyle}
                >
                  <div className="ep-catalog-shell__content" ref={catalogContentRef}>
                    {catalogExcursions.length === 0 ? (
                      <section className={`status-card${state.discoveryError ? ' status-card--error' : ''}`}>
                        <h3 className="status-card__title">
                          {state.discoveryError ? 'Ошибка загрузки' : 'Нет маршрутов'}
                        </h3>
                        <p className="status-card__text">
                          {state.discoveryError
                            ? 'Сервис временно недоступен. Попробуйте перезагрузить страницу.'
                            : 'Попробуйте другой фильтр'}
                        </p>
                      </section>
                    ) : (
                      <>
                        <div className="ep-catalog__grid">
                          {catalogExcursions.slice(0, catalogInitial).map((excursion) => (
                            <ExcursionCard excursion={excursion} key={excursion.id} />
                          ))}
                        </div>

                        {hasMoreExcursions ? (
                          <>
                            <div className={`ep-catalog__extra${showAll ? ' ep-catalog__extra--open' : ''}`}>
                              <div className="ep-catalog__extra-inner">
                                <div className="ep-catalog__grid">
                                  {catalogExcursions.slice(catalogInitial).map((excursion) => (
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
                                {showAll ? 'Скрыть' : `Показать все (${catalogExcursions.length})`}
                              </button>
                            </div>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

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
  isDragging: boolean
  isExpanded: boolean
  isLastAtLimit: boolean
  onDragStart: () => void
  onRemove: () => void
  onToggle: () => void
  stop: RouteStop
}

const DraftStopCard = memo(function DraftStopCard({
  isDragging,
  isExpanded,
  isLastAtLimit,
  onDragStart,
  onRemove,
  onToggle,
  stop,
}: DraftStopCardProps) {
  const text = stop.description || stop.shortDescription
  const preview = stop.scheduleLabel || null

  return (
    <div className={`ep-stop${isExpanded ? ' ep-stop--open' : ''}${isDragging ? ' ep-stop--dragging' : ''}${isLastAtLimit ? ' ep-stop--at-limit' : ''}`}>
      <div className="ep-stop__head">
        <button
          aria-label="Перетащить для изменения порядка"
          className="ep-stop__drag-handle"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDragStart()
          }}
          type="button"
        >
          <svg aria-hidden="true" fill="currentColor" height="12" viewBox="0 0 10 14" width="10">
            <rect height="2" rx="1" width="10" y="0" />
            <rect height="2" rx="1" width="10" y="5" />
            <rect height="2" rx="1" width="10" y="10" />
          </svg>
        </button>
        <button className="ep-stop__header" onClick={onToggle} type="button">
          <span className="ep-stop__order">{stop.order}</span>
          <div className="ep-stop__info">
            <span className="ep-stop__cat">{formatPointCategory(stop.category)}</span>
            <span className="ep-stop__name">{stop.title}</span>
            {preview ? <span className="ep-stop__preview">{preview}</span> : null}
          </div>
          <span aria-hidden="true" className={`ep-stop__chevron${isExpanded ? ' ep-stop__chevron--open' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </span>
        </button>
      </div>

      <div className={`ep-stop__body${isExpanded ? ' ep-stop__body--open' : ''}`}>
        <div className="ep-stop__body-inner">
          {text ? <p className="ep-stop__desc">{text}</p> : null}
          <div className="ep-stop__meta">
            {stop.rating > 0 ? <span className="ep-stop__chip">★ {stop.rating.toFixed(1)}</span> : null}
            {stop.expectedVisitMinutes > 0 ? <span className="ep-stop__chip">{formatDuration(stop.expectedVisitMinutes)}</span> : null}
            {stop.scheduleLabel ? <span className="ep-stop__chip">{stop.scheduleLabel}</span> : null}
            {stop.distanceMeters ? <span className="ep-stop__chip">{formatMeters(stop.distanceMeters)}</span> : null}
            <span
              aria-label={stop.audio.hasAudioGuide ? 'Есть аудиогид' : 'Нет аудиогида'}
              className={`ep-stop__chip ep-stop__chip--audio${stop.audio.hasAudioGuide ? ' ep-stop__chip--audio-active' : ''}`}
            >
              <svg aria-hidden="true" fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" width="13">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            </span>
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
  const placeholder = buildRoutePlaceholderImage(excursion.theme, excursion.id)

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
        </div>

        <div className="ep-card__stats">
          <span className="ep-card__stat">{formatDistance(excursion.distanceKm)}</span>
          <span className="ep-card__stat">
            {formatStopCount(excursion.stops.length || excursion.pointsCount || 0)}
          </span>
          <span className="ep-card__stat">{formatDuration(excursion.durationMinutes)}</span>
        </div>

        <div className="ep-card__details">
          <span className="ep-card__detail"><strong>Сложность:</strong> {formatDifficulty(excursion.difficulty)}</span>
          <span className="ep-card__detail">
            <strong>Рейтинг:</strong>{' '}
            {excursion.rating && excursion.rating > 0
              ? <><span className="ep-card__star">★</span> {excursion.rating.toFixed(1)}</>
              : <span className="ep-card__detail--muted">нет оценок</span>}
          </span>
          <span className="ep-card__detail"><strong>Для кого:</strong> {excursion.audienceLabel}</span>
          {excursion.startLabel ? (
            <span className="ep-card__detail ep-card__detail--line" title={excursion.startLabel}>
              <strong>Старт:</strong> {excursion.startLabel}
            </span>
          ) : null}
          {excursion.finishLabel ? (
            <span className="ep-card__detail ep-card__detail--line" title={excursion.finishLabel}>
              <strong>Финиш:</strong> {excursion.finishLabel}
            </span>
          ) : null}
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
  isDraftFull: boolean
  isInDraft: boolean
  onAddPoint: () => void
  onClose: () => void
  onRemovePoint: () => void
  point: NearbyPoint
}

function PointDetailPanel({
  isDraftFull,
  isInDraft,
  onAddPoint,
  onClose,
  onRemovePoint,
  point,
}: PointDetailPanelProps) {
  const walkMinutes = Math.max(1, Math.round((point.distanceMeters / 1000) * 12))
  const placeholder = buildPlacePlaceholderImage(point.category)
  const detailDescription = point.description || point.shortDescription
  // Split into paragraphs on blank lines / line breaks so a long description
  // reads as structured prose instead of one dense block.
  const descriptionParagraphs = detailDescription
    ? detailDescription
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : []
  const routeActionDisabled = !isInDraft && isDraftFull
  const routeActionLabel = isInDraft
    ? '− Убрать из маршрута'
    : isDraftFull
      ? 'Маршрут заполнен'
      : '+ Добавить в свой маршрут'
  const routeActionClassName = [
    'rbm-popup__btn',
    isInDraft ? 'rbm-popup__btn--danger' : 'rbm-popup__btn--primary',
    'ep-detail__action-btn',
    'ep-detail__action-btn--route',
  ].join(' ')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null)
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)
  const [transcriptHeight, setTranscriptHeight] = useState(0)
  const hasAudioGuide = Boolean(point.audioGuideUrl)
  const isAudioPlaying = playingAudioUrl === point.audioGuideUrl
  const hasTranscript = Boolean(point.audioTranscript)

  function handleTranscriptToggle() {
    if (!isTranscriptOpen && transcriptRef.current) {
      setTranscriptHeight(transcriptRef.current.scrollHeight)
    }
    setIsTranscriptOpen((v) => !v)
  }

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingAudioUrl(null)
    setIsTranscriptOpen(false)
  }, [point.id])

  function handleToggleAudioGuide() {
    if (!point.audioGuideUrl) return

    if (!audioRef.current) {
      const audio = new Audio(point.audioGuideUrl)
      audio.addEventListener('ended', () => setPlayingAudioUrl(null))
      audio.addEventListener('error', () => setPlayingAudioUrl(null))
      audioRef.current = audio
    }

    if (isAudioPlaying) {
      audioRef.current.pause()
      setPlayingAudioUrl(null)
      return
    }

    void audioRef.current.play()
      .then(() => setPlayingAudioUrl(point.audioGuideUrl))
      .catch(() => setPlayingAudioUrl(null))
  }

  return (
    <div className="ep-detail">
      <div className="ep-detail__main">
      <div className="ep-detail__cover-shell">
        <div className="ep-detail__cover">
          <img
            alt={point.title}
            onError={(e) => { (e.target as HTMLImageElement).src = placeholder }}
            src={point.imageUrl || placeholder}
          />
          <span className="ep-detail__cat">{getPointCategoryLabel(point)}</span>
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

        {descriptionParagraphs.length > 0 && (
          <section className="ep-detail__about" aria-label="Описание точки">
            <span className="ep-detail__about-label">О месте</span>
            {descriptionParagraphs.map((paragraph, index) => (
              <p className="ep-detail__full-desc" key={index}>
                {paragraph}
              </p>
            ))}
          </section>
        )}

        <section
          className={`ep-detail__audio${hasAudioGuide ? ' ep-detail__audio--ready' : ''}`}
          aria-label="Аудиогид точки"
        >
          <button
            className="ep-detail__audio-btn"
            disabled={!hasAudioGuide}
            onClick={handleToggleAudioGuide}
            type="button"
          >
            {isAudioPlaying ? 'Пауза аудиогида' : 'Прослушать аудиогид'}
          </button>
          <p className="ep-detail__audio-note">
            {hasAudioGuide
              ? 'Для этой точки доступно аудиосопровождение.'
              : 'Сейчас для этой точки доступно только текстовое описание.'}
          </p>
          {hasAudioGuide && hasTranscript ? (
            <button
              className="ep-detail__audio-btn"
              onClick={handleTranscriptToggle}
              type="button"
            >
              {isTranscriptOpen ? 'Скрыть' : 'Прочитать'}
            </button>
          ) : null}
          {hasTranscript ? (
            <div
              aria-hidden={!isTranscriptOpen}
              style={{
                maxHeight: isTranscriptOpen ? `${transcriptHeight}px` : '0px',
                overflow: 'hidden',
                transition: 'max-height 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div ref={transcriptRef}>
                <p className="ep-detail__audio-transcript">{point.audioTranscript}</p>
              </div>
            </div>
          ) : null}
        </section>

        <div className="ep-detail__actions" aria-label="Действия с точкой">
          <button
            className={routeActionClassName}
            disabled={routeActionDisabled}
            onClick={() => {
              if (isInDraft) {
                onRemovePoint()
              } else {
                onAddPoint()
                onClose()
              }
            }}
            type="button"
          >
            {routeActionLabel}
          </button>
          <button
            className="rbm-popup__btn rbm-popup__btn--danger ep-detail__action-btn ep-detail__action-btn--close"
            onClick={onClose}
            type="button"
          >
            Закрыть
          </button>
        </div>

        {point.addressLabel && (
          <p className="ep-detail__address">
            {point.addressLabel}
          </p>
        )}
      </div>
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
