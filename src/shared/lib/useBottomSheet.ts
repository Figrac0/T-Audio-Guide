import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

type PointerEventLike = ReactPointerEvent<HTMLElement>

export interface BottomSheetSnapPoint<T extends string> {
  key: T
  translate: number
}

interface UseBottomSheetOptions<T extends string> {
  getSnapPoints: (sheetHeight: number) => BottomSheetSnapPoint<T>[]
  initialSnapKey: T
}

interface DragState {
  active: boolean
  lastPointerY: number
  lastTime: number
  startPointerY: number
  startTranslate: number
  velocity: number
}

interface BodyGestureState {
  active: boolean
  pointerTarget: HTMLElement | null
  startPointerY: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('a, button, input, select, textarea, summary, [role="button"]'))
}

function sortSnapPoints<T extends string>(points: BottomSheetSnapPoint<T>[]) {
  return [...points].sort((a, b) => a.translate - b.translate)
}

function getNearestSnapPoint<T extends string>(
  currentTranslate: number,
  points: BottomSheetSnapPoint<T>[],
) {
  return points.reduce((closest, point) =>
    Math.abs(point.translate - currentTranslate) < Math.abs(closest.translate - currentTranslate)
      ? point
      : closest,
  )
}

function getVelocitySnapPoint<T extends string>(
  currentTranslate: number,
  velocity: number,
  points: BottomSheetSnapPoint<T>[],
) {
  const currentIndex = points.findIndex((point) => point.translate >= currentTranslate - 1)
  const fallback = getNearestSnapPoint(currentTranslate, points)

  if (velocity <= -7) {
    const index = currentIndex <= 0 ? 0 : currentIndex - 1
    return points[index] ?? fallback
  }

  if (velocity >= 7) {
    const index = currentIndex < 0 ? points.length - 1 : Math.min(points.length - 1, currentIndex + 1)
    return points[index] ?? fallback
  }

  return fallback
}

export function useBottomSheet<T extends string>({
  getSnapPoints,
  initialSnapKey,
}: UseBottomSheetOptions<T>) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const snapPointsRef = useRef<BottomSheetSnapPoint<T>[]>([])
  const activeSnapKeyRef = useRef<T>(initialSnapKey)
  const translateRef = useRef(0)
  const hasMeasuredRef = useRef(false)
  const dragRef = useRef<DragState>({
    active: false,
    lastPointerY: 0,
    lastTime: 0,
    startPointerY: 0,
    startTranslate: 0,
    velocity: 0,
  })
  const bodyGestureRef = useRef<BodyGestureState>({
    active: false,
    pointerTarget: null,
    startPointerY: 0,
  })

  const [activeSnapKey, setActiveSnapKey] = useState<T>(initialSnapKey)
  const [isDragging, setIsDragging] = useState(false)
  const [translate, setTranslate] = useState(0)

  const applyImmediate = useCallback((nextTranslate: number) => {
    const sheet = sheetRef.current
    const snapPoints = snapPointsRef.current
    if (!sheet || snapPoints.length === 0) return
    const min = snapPoints[0].translate
    const max = snapPoints[snapPoints.length - 1].translate
    const safe = clamp(nextTranslate, min, max)
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${safe}px)`
    translateRef.current = safe
    setTranslate(safe)
  }, [])

  const animateTo = useCallback((nextSnap: BottomSheetSnapPoint<T>, duration = 0.32) => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transition = `transform ${duration}s cubic-bezier(0.32, 0, 0.16, 1)`
    sheet.style.transform = `translateY(${nextSnap.translate}px)`
    sheet.style.willChange = ''
    translateRef.current = nextSnap.translate
    activeSnapKeyRef.current = nextSnap.key
    setTranslate(nextSnap.translate)
    setActiveSnapKey(nextSnap.key)
  }, [])

  const syncToKey = useCallback(
    (key: T, duration?: number) => {
      const snap = snapPointsRef.current.find((point) => point.key === key)
      if (!snap) return
      if (duration === undefined) {
        applyImmediate(snap.translate)
        activeSnapKeyRef.current = snap.key
        setActiveSnapKey(snap.key)
        return
      }
      animateTo(snap, duration)
    },
    [animateTo, applyImmediate],
  )

  const updateMeasurements = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return

    const nextSnapPoints = sortSnapPoints(getSnapPoints(sheet.offsetHeight))
    if (nextSnapPoints.length === 0) return

    snapPointsRef.current = nextSnapPoints
    const currentSnap = nextSnapPoints.find((point) => point.key === activeSnapKeyRef.current)

    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true
      const initialSnap = currentSnap ?? nextSnapPoints[nextSnapPoints.length - 1]
      applyImmediate(initialSnap.translate)
      activeSnapKeyRef.current = initialSnap.key
      queueMicrotask(() => setActiveSnapKey(initialSnap.key))
      return
    }

    const fallbackSnap = currentSnap ?? getNearestSnapPoint(translateRef.current, nextSnapPoints)
    applyImmediate(fallbackSnap.translate)
    if (fallbackSnap.key !== activeSnapKeyRef.current) {
      activeSnapKeyRef.current = fallbackSnap.key
      queueMicrotask(() => setActiveSnapKey(fallbackSnap.key))
    }
  }, [applyImmediate, getSnapPoints])

  useLayoutEffect(() => {
    updateMeasurements()
    const frameId = window.requestAnimationFrame(updateMeasurements)
    const handleResize = () => {
      if (!dragRef.current.active) {
        updateMeasurements()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [updateMeasurements])

  useEffect(() => {
    updateMeasurements()
  }, [updateMeasurements])

  const finishDrag = useCallback(() => {
    if (!dragRef.current.active) return

    dragRef.current.active = false
    setIsDragging(false)

    const snapPoints = snapPointsRef.current
    const sheet = sheetRef.current
    if (!sheet || snapPoints.length === 0) return

    const targetSnap = getVelocitySnapPoint(
      translateRef.current,
      dragRef.current.velocity,
      snapPoints,
    )
    animateTo(targetSnap, 0.28)
  }, [animateTo])

  const startDrag = useCallback((event: PointerEventLike) => {
    const sheet = sheetRef.current
    if (!sheet) return

    dragRef.current = {
      active: true,
      lastPointerY: event.clientY,
      lastTime: Date.now(),
      startPointerY: event.clientY,
      startTranslate: translateRef.current,
      velocity: 0,
    }

    sheet.style.transition = 'none'
    sheet.style.willChange = 'transform'
    setIsDragging(true)
  }, [])

  const moveDrag = useCallback((event: PointerEventLike) => {
    if (!dragRef.current.active) return

    const snapPoints = snapPointsRef.current
    const sheet = sheetRef.current
    if (!sheet || snapPoints.length === 0) return

    const min = snapPoints[0].translate
    const max = snapPoints[snapPoints.length - 1].translate
    const raw = dragRef.current.startTranslate + (event.clientY - dragRef.current.startPointerY)
    const nextTranslate = clamp(raw, min, max)
    const now = Date.now()
    const dt = Math.max(1, now - dragRef.current.lastTime)

    dragRef.current.velocity = ((event.clientY - dragRef.current.lastPointerY) / dt) * 16
    dragRef.current.lastPointerY = event.clientY
    dragRef.current.lastTime = now

    sheet.style.transform = `translateY(${nextTranslate}px)`
    translateRef.current = nextTranslate
    setTranslate(nextTranslate)
  }, [])

  const handleHandlePointerDown = useCallback((event: PointerEventLike) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    startDrag(event)
  }, [startDrag])

  const handleHandlePointerMove = useCallback((event: PointerEventLike) => {
    moveDrag(event)
  }, [moveDrag])

  const handleHandlePointerUp = useCallback(() => {
    finishDrag()
  }, [finishDrag])

  const handleBodyPointerDown = useCallback((event: PointerEventLike) => {
    if (isInteractiveTarget(event.target)) {
      bodyGestureRef.current = {
        active: false,
        pointerTarget: null,
        startPointerY: 0,
      }
      return
    }

    bodyGestureRef.current = {
      active: true,
      pointerTarget: event.currentTarget,
      startPointerY: event.clientY,
    }
  }, [])

  const handleBodyPointerMove = useCallback((event: PointerEventLike) => {
    if (dragRef.current.active) {
      event.preventDefault()
      moveDrag(event)
      return
    }

    const body = bodyRef.current
    const gesture = bodyGestureRef.current
    if (!body || !gesture.active) return

    const deltaY = event.clientY - gesture.startPointerY
    if (deltaY <= 8 || body.scrollTop > 0) return

    gesture.pointerTarget?.setPointerCapture?.(event.pointerId)
    startDrag(event)
    event.preventDefault()
  }, [moveDrag, startDrag])

  const handleBodyPointerUp = useCallback(() => {
    bodyGestureRef.current = {
      active: false,
      pointerTarget: null,
      startPointerY: 0,
    }
    finishDrag()
  }, [finishDrag])

  const handleBodyPointerCancel = useCallback(() => {
    bodyGestureRef.current = {
      active: false,
      pointerTarget: null,
      startPointerY: 0,
    }
    finishDrag()
  }, [finishDrag])

  const toggle = useCallback(() => {
    const snapPoints = snapPointsRef.current
    if (snapPoints.length === 0) return
    const collapsed = snapPoints[snapPoints.length - 1]
    const defaultOpen = snapPoints.length > 1 ? snapPoints[snapPoints.length - 2] : collapsed
    const currentKey = activeSnapKeyRef.current

    if (currentKey === collapsed.key) {
      animateTo(defaultOpen)
      return
    }

    animateTo(collapsed)
  }, [animateTo])

  return {
    activeSnapKey,
    bodyRef,
    handleBodyPointerCancel,
    handleBodyPointerDown,
    handleBodyPointerMove,
    handleBodyPointerUp,
    handleHandlePointerDown,
    handleHandlePointerMove,
    handleHandlePointerUp,
    isDragging,
    sheetRef,
    snapTo: syncToKey,
    toggle,
    translate,
    updateMeasurements,
  }
}
