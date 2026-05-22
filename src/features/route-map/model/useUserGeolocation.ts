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

const geolocationOptions = {
  enableHighAccuracy: true,
  maximumAge: 15000,
  timeout: 12000,
}

const POSITION_UPDATE_DEBOUNCE_MS = 800

// Permission-denied message differs between native (app settings) and browser.
const MSG_PERMISSION_DENIED = isNative
  ? 'Доступ к геолокации закрыт — разрешите его в настройках приложения или задайте точку вручную.'
  : 'Доступ к геолокации закрыт — разрешите его в настройках браузера или задайте точку вручную.'

const MSG_POSITION_UNAVAILABLE =
  'Не удалось определить местоположение — задайте точку вручную на карте.'

export function useUserGeolocation(): UseUserGeolocationResult {
  // Capacitor returns a string callback-id; browser returns a number watch-id.
  // We store whichever is active so cleanup always targets the right handle.
  const watchIdRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [userPosition, setUserPosition] = useState<GeoPoint | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const stopWatching = useCallback(() => {
    const id = watchIdRef.current
    if (id !== null) {
      watchIdRef.current = null
      // Fire-and-forget — safe in cleanup and synchronous contexts.
      void Geolocation.clearWatch({ id })
    }
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }, [])

  const handlePositionUpdate = useCallback((lat: number, lng: number) => {
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setUserPosition({ lat, lng })
      setStatus('tracking')
      setError(null)
    }, POSITION_UPDATE_DEBOUNCE_MS)
  }, [])

  const handlePermissionDenied = useCallback(() => {
    setStatus('blocked')
    setError(MSG_PERMISSION_DENIED)
  }, [])

  const handlePositionUnavailable = useCallback(() => {
    setStatus('blocked')
    setError(MSG_POSITION_UNAVAILABLE)
  }, [])

  const startWatching = useCallback(async () => {
    stopWatching()

    try {
      // On native, request permissions before starting the watch. The plugin
      // handles the permission dialog automatically on Android 12+.
      if (isNative) {
        const perm = await Geolocation.requestPermissions()
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          handlePermissionDenied()
          return
        }
      }

      const id = await Geolocation.watchPosition(
        geolocationOptions,
        (position, err) => {
          if (err || !position) {
            const code = (err as { code?: number } | null)?.code ?? 2
            if (code === 1 /* PERMISSION_DENIED */) {
              handlePermissionDenied()
            } else {
              handlePositionUnavailable()
            }
            return
          }
          handlePositionUpdate(position.coords.latitude, position.coords.longitude)
        },
      )

      watchIdRef.current = id
    } catch {
      // Capacitor throws if geolocation is entirely unavailable (e.g. emulator
      // with no location provider). Treat as unsupported.
      setStatus('unsupported')
      setError(MSG_POSITION_UNAVAILABLE)
    }
  }, [handlePermissionDenied, handlePositionUnavailable, handlePositionUpdate, stopWatching])

  const requestLocation = useCallback(() => {
    setStatus('loading')
    setError(null)
    void startWatching()
  }, [startWatching])

  useEffect(() => {
    void startWatching()
    return stopWatching
  }, [startWatching, stopWatching])

  return { error, requestLocation, status, userPosition }
}
