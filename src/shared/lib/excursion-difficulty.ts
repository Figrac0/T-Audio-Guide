import type { ExcursionDifficulty } from '@/entities/excursion/model/types'

export function getDifficultyByDistance(distanceKm: number): ExcursionDifficulty {
  if (distanceKm < 2) return 'easy'
  if (distanceKm < 4) return 'medium'
  return 'hard'
}
