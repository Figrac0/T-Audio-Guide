import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { GeoPoint } from '@/entities/excursion/model/types'

export type OverrideMode = 'off' | 'waiting' | 'active'

interface ManualPositionContextType {
  mode: OverrideMode
  isOverrideActive: boolean
  manualPosition: GeoPoint | null
  setManualPosition: (position: GeoPoint) => void
  toggleOverride: () => void
}

const ManualPositionContext = createContext<ManualPositionContextType | undefined>(undefined)

const STORAGE_KEY = 'manual-position'

function loadFromStorage(): { mode: OverrideMode; position: GeoPoint | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { mode: 'off', position: null }
    const { mode, position } = JSON.parse(stored)
    return { mode, position }
  } catch {
    return { mode: 'off', position: null }
  }
}

function saveToStorage(mode: OverrideMode, position: GeoPoint | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, position }))
  } catch {
    // Ignore storage errors
  }
}

export function ManualPositionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<OverrideMode>(() => {
    const { mode: storedMode } = loadFromStorage()
    return storedMode
  })
  const [manualPositionState, setManualPositionState] = useState<GeoPoint | null>(() => {
    const { position } = loadFromStorage()
    return position
  })

  const toggleOverride = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'off' ? 'waiting' : 'off'
      saveToStorage(next, next === 'off' ? null : manualPositionState)
      return next
    })
  }, [manualPositionState])

  const setManualPosition = useCallback((position: GeoPoint) => {
    setManualPositionState(position)
    setMode('active')
    saveToStorage('active', position)
  }, [])

  // Save whenever mode or position changes
  useEffect(() => {
    saveToStorage(mode, mode === 'active' ? manualPositionState : null)
  }, [mode, manualPositionState])

  const value: ManualPositionContextType = {
    mode,
    isOverrideActive: mode === 'active',
    manualPosition: mode === 'active' ? manualPositionState : null,
    setManualPosition,
    toggleOverride,
  }

  return (
    <ManualPositionContext.Provider value={value}>
      {children}
    </ManualPositionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useManualPosition(): ManualPositionContextType {
  const context = useContext(ManualPositionContext)
  if (!context) {
    throw new Error('useManualPosition must be used within ManualPositionProvider')
  }
  return context
}
