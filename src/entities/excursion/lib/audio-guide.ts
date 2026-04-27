import type { AudioStory, SupportedLocale } from '@/entities/excursion/model/types'

export function getAudioGuideUrl(audio: AudioStory): string | null {
  return audio.audioGuideUrl ?? audio.url ?? null
}

export function getAudioGuideDuration(audio: AudioStory): number {
  return audio.audioDuration ?? audio.durationSeconds
}

export function getAudioGuideLanguage(audio: AudioStory): SupportedLocale {
  return audio.audioLanguage ?? audio.language
}

export function hasAudioGuideAvailable(audio: AudioStory): boolean {
  return audio.hasAudioGuide && Boolean(getAudioGuideUrl(audio))
}
