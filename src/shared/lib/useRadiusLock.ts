import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'app:radiusLocked'

let _locked = (() => {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
})()

const _listeners = new Set<(locked: boolean) => void>()

function _setGlobal(locked: boolean) {
  _locked = locked
  try { localStorage.setItem(STORAGE_KEY, locked ? '1' : '0') } catch {}
  _listeners.forEach((fn) => fn(locked))
}

export function useRadiusLock() {
  const [isLocked, setIsLocked] = useState(_locked)

  useEffect(() => {
    _listeners.add(setIsLocked)
    return () => { _listeners.delete(setIsLocked) }
  }, [])

  const toggle = useCallback(() => _setGlobal(!_locked), [])

  return { isLocked, toggle }
}
