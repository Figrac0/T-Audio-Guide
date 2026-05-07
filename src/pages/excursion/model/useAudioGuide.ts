import { useCallback, useEffect, useRef, useState } from 'react'
import type { RouteStop } from '@/entities/excursion/model/types'
import { getAudioGuideUrl, hasAudioGuideAvailable } from '@/entities/excursion/lib/audio-guide'

export function useAudioGuide(currentStop: RouteStop, currentStopIndex: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingStopIndex, setPlayingStopIndex] = useState<number | null>(null)

  const audioUrl = getAudioGuideUrl(currentStop.audio)
  const isAudioAvailable = hasAudioGuideAvailable(currentStop.audio)
  const isAudioPlaying = playingStopIndex === currentStopIndex

  // Pause and release audio when the active stop changes
  useEffect(() => {
    return () => {
      const prev = audioRef.current
      audioRef.current = null
      if (prev) { prev.pause(); prev.src = '' }
    }
  }, [currentStopIndex])

  // Release audio on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) { audio.pause(); audioRef.current = null }
    }
  }, [])

  const toggleAudio = useCallback(() => {
    if (!isAudioAvailable || !audioUrl) return
    if (!audioRef.current) {
      const audio = new Audio(audioUrl)
      audio.addEventListener('ended', () => setPlayingStopIndex(null))
      audio.addEventListener('error', () => setPlayingStopIndex(null))
      audioRef.current = audio
    }
    if (isAudioPlaying) {
      audioRef.current.pause()
      setPlayingStopIndex(null)
    } else {
      void audioRef.current.play()
        .then(() => setPlayingStopIndex(currentStopIndex))
        .catch(() => setPlayingStopIndex(null))
    }
  }, [isAudioAvailable, audioUrl, currentStopIndex, isAudioPlaying])

  return {
    isAudioPlaying,
    isAudioAvailable,
    toggleAudio,
  }
}
