import { useEffect, useMemo, useRef, useState } from 'react'

export type AnimatedItemsPhase = 'idle' | 'leaving' | 'entering'

interface UseAnimatedItemsOptions<T> {
  disabled?: boolean
  enterDurationMs?: number
  getKey: (item: T) => string | number
  signature?: string
  swapDelayMs?: number
}

export function useAnimatedItems<T>(
  items: T[],
  {
    disabled = false,
    enterDurationMs = 230,
    getKey,
    signature,
    swapDelayMs = 140,
  }: UseAnimatedItemsOptions<T>,
) {
  const itemSignature = useMemo(
    () => items.map((item) => String(getKey(item))).join('|'),
    [getKey, items],
  )
  const nextSignature = signature ?? itemSignature
  const signatureRef = useRef(nextSignature)
  const latestItemsRef = useRef(items)
  const [renderedItems, setRenderedItems] = useState(items)
  const [phase, setPhase] = useState<AnimatedItemsPhase>('idle')

  useEffect(() => {
    latestItemsRef.current = items
  }, [items])

  useEffect(() => {
    const timers: number[] = []
    const schedule = (callback: () => void, delayMs = 0) => {
      const timer = window.setTimeout(callback, delayMs)
      timers.push(timer)
    }

    if (disabled) {
      signatureRef.current = nextSignature
      schedule(() => {
        setRenderedItems(latestItemsRef.current)
        setPhase('idle')
      })

      return () => {
        timers.forEach((timer) => window.clearTimeout(timer))
      }
    }

    if (nextSignature === signatureRef.current) {
      return undefined
    }

    signatureRef.current = nextSignature
    schedule(() => {
      setPhase('leaving')
    })

    schedule(() => {
      setRenderedItems(latestItemsRef.current)
      setPhase('entering')
    }, swapDelayMs)
    schedule(() => {
      setPhase('idle')
    }, swapDelayMs + enterDurationMs)

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [disabled, enterDurationMs, nextSignature, swapDelayMs])

  useEffect(() => {
    if (disabled || phase !== 'idle' || nextSignature !== signatureRef.current) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setRenderedItems(items)
    })

    return () => window.clearTimeout(timer)
  }, [disabled, items, nextSignature, phase])

  return {
    items: renderedItems,
    phase,
  }
}
