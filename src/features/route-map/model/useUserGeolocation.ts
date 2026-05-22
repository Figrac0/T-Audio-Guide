import { useCallback, useEffect, useRef, useState } from 'react'
import { Geolocation } from '@capacitor/geolocation'

import type { GeoPoint } from '@/entities/excursion/model/types'
import { isNative } from '@/shared/lib/platform'

export type GeolocationStatus =
  | 'idle'
  | 'tracking'
  | 'blocked'
  | 'unsupported'
  | 'loading'

interface UseUserGeolocationResult {
  error: string | null
  requestLocation: () => void
  status: GeolocationStatus
  userPosition: GeoPoint | null
}

// Capacitor native Android sends string error codes (GeolocationErrors.kt),
// not W3C integer codes. Both formats must be handled.
const NATIVE_PERMISSION_DENIED = 'OS-PLUG-GLOC-0003'
const NATIVE_LOCATION_DISABLED = 'OS-PLUG-GLOC-0007'
const NATIVE_TIMEOUT          = 'OS-PLUG-GLOC-0010'

// Watch options: 30 s timeout lets GPS warm up; maximumAge allows a recent
// cached fix to satisfy the request immediately.
const watchOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 30_000,
}

// Quick coarse fix (network/cell) used for a fast first position while GPS warms up.
const coarseOptions = {
  enableHighAccuracy: false,
  maximumAge: 60_000,
  timeout: 8_000,
}

const POSITION_UPDATE_DEBOUNCE_MS = 600

const MSG_PERMISSION_DENIED = isNative
  ? 'Доступ к геолокации закрыт — разрешите его в настройках приложения или задайте точку вручную.'
  : 'Доступ к геолокации закрыт — разрешите его в настройках браузера или задайте точку вручную.'

const MSG_POSITION_UNAVAILABLE =
  'Не удалось определить местоположение — задайте точку вручную на карте.'

export function useUserGeolocation(): UseUserGeolocationResult {
  const watchIdRef       = useRef<string | null>(null)
  const debounceRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [userPosition, setUserPosition] = useState<GeoPoint | null>(null)
  const [status,       setStatus]       = useState<GeolocationStatus>('loading')
  const [error,        setError]        = useState<string | null>(null)

  const stopWatching = useCallback(() => {
    const id = watchIdRef.current
    if (id !== null) {
      watchIdRef.current = null
      void Geolocation.clearWatch({ id })
    }
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  const applyPosition = useCallback((lat: number, lng: number) => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setUserPosition({ lat, lng })
      setStatus('tracking')
      setError(null)
    }, POSITION_UPDATE_DEBOUNCE_MS)
  }, [])

  const handlePermissionDenied    = useCallback(() => { setStatus('blocked');     setError(MSG_PERMISSION_DENIED)    }, [])
  const handlePositionUnavailable = useCallback(() => { setStatus('blocked');     setError(MSG_POSITION_UNAVAILABLE) }, [])

  const classifyError = useCallback((err: unknown): 'permission' | 'timeout' | 'unavailable' => {
    const code = (err as { code?: unknown } | null)?.code
    if (code === 1 || code === NATIVE_PERMISSION_DENIED || code === NATIVE_LOCATION_DISABLED) return 'permission'
    if (code === 3 || code === NATIVE_TIMEOUT) return 'timeout'
    return 'unavailable'
  }, [])

  const startWatching = useCallback(async () => {
    stopWatching()

    try {
      // ── 1. Request OS permission (native only) ─────────────────────────────
      if (isNative) {
        const perm = await Geolocation.requestPermissions()
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          handlePermissionDenied()
          return
        }
      }

      // ── 2. Fast coarse fix (network / cell tower) ──────────────────────────
      // Gives the user an immediate position while GPS acquires a precise fix.
      // Errors here are silently ignored — the watch below will eventually succeed.
      try {
        const quick = await Geolocation.getCurrentPosition(coarseOptions)
        applyPosition(quick.coords.latitude, quick.coords.longitude)
      } catch {
        // coarse location unavailable — not fatal, GPS watch continues below
      }

      // ── 3. Continuous high-accuracy GPS watch ──────────────────────────────
      const id = await Geolocation.watchPosition(watchOptions, (position, err) => {
        if (err || !position) {
          const kind = classifyError(err)
          if (kind === 'permission') {
            handlePermissionDenied()
          } else if (kind === 'timeout') {
            // GPS is still warming up — the watch remains active, do not
            // show an error; user already has the coarse position if available.
          } else {
            // Only show "unavailable" if we have no position at all yet.
            setUserPosition(prev => {
              if (prev === null) handlePositionUnavailable()
              return prev
            })
          }
          return
        }
        applyPosition(position.coords.latitude, position.coords.longitude)
      })

      watchIdRef.current = id
    } catch {
      // requestPermissions or watchPosition threw — location entirely unavailable.
      setStatus('unsupported')
      setError(MSG_POSITION_UNAVAILABLE)
    }
  }, [applyPosition, classifyError, handlePermissionDenied, handlePositionUnavailable, stopWatching])

  const requestLocation = useCallback(() => {
    setStatus('loading')
    setError(null)
    void startWatching()
  }, [startWatching])

  useEffect(() => {
    // Geolocation is an external system — calling setState inside the effect
    // through an async subscription is the correct React pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startWatching()
    return stopWatching
  }, [startWatching, stopWatching])

  return { error, requestLocation, status, userPosition }
}
