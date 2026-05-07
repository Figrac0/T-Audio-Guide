import { useCallback, useState } from 'react'
import type { GeoPoint } from '@/entities/excursion/model/types'

export type OverrideMode = 'off' | 'waiting' | 'active'

interface UseManualPositionResult {
  mode: OverrideMode
  isOverrideActive: boolean
  manualPosition: GeoPoint | null
  setManualPosition: (position: GeoPoint) => void
  toggleOverride: () => void
}

export function useManualPosition(): UseManualPositionResult {
  const [mode, setMode] = useState<OverrideMode>('off')
  const [manualPositionState, setManualPositionState] = useState<GeoPoint | null>(null)

  const toggleOverride = useCallback(() => {
    setMode((prev) => (prev === 'off' ? 'waiting' : 'off'))
    setManualPositionState(null)
  }, [])

  const setManualPosition = useCallback((position: GeoPoint) => {
    setManualPositionState(position)
    setMode('active')
  }, [])

  return {
    mode,
    isOverrideActive: mode === 'active',
    manualPosition: mode === 'active' ? manualPositionState : null,
    setManualPosition,
    toggleOverride,
  }
}
