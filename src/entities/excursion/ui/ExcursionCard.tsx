import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/app/providers/useAuth'
import type { Excursion } from '@/entities/excursion/model/types'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { appRoutes } from '@/shared/config/routes'
import { buildRoutePlaceholderImage } from '@/shared/lib/placeholder-images'
import {
  formatDistance,
  formatDuration,
  formatDifficulty,
  formatStopCount,
  formatTheme,
} from '@/shared/lib/format'
import { ResilientImage } from '@/shared/ui/ResilientImage'
import './ExcursionCard.css'

interface ExcursionCardProps {
  excursion: Excursion
}

export function ExcursionCard({ excursion }: ExcursionCardProps) {
  const { session } = useAuth()
  const {
    isRouteSaved,
    shareRoute,
    toggleSavedRoute,
  } = useUserRoutes()
  const isAuthenticated = Boolean(session?.isAuthenticated && session.profile)
  const routeUrl = appRoutes.excursion(excursion.slug)
  const isSaved = isRouteSaved(excursion.slug)
  const routePlaceholder = buildRoutePlaceholderImage(excursion.theme, excursion.id)
  const coverFallbacks = [routePlaceholder]
  const coverSrc =
    excursion.coverImageUrl && !excursion.coverImageUrl.startsWith('/illustrations/')
      ? excursion.coverImageUrl
      : routePlaceholder
  const isFallbackCover = coverSrc === routePlaceholder

  return (
    <article className="card">
      <Link
        aria-label={`Открыть маршрут ${excursion.title}`}
        className="card__cover-link"
        to={routeUrl}
      >
        <div
          className={`card__cover card__cover--gradient${isFallbackCover ? ' card__cover--fallback' : ''}`}
          style={{ '--route-accent': excursion.routeColor } as CSSProperties}
        >
          <ResilientImage
            alt={excursion.title}
            fallbackSrcs={coverFallbacks}
            loading="lazy"
            placeholderSrc={routePlaceholder}
            referrerPolicy="no-referrer"
            src={coverSrc}
          />
          <span className="card__theme-badge">{formatTheme(excursion.theme)}</span>
        </div>
      </Link>

      <div className="card__content">
        <div className="card__title-row">
          <Link className="card__title-link" to={routeUrl}>
            <h3 className="card__title">{excursion.title}</h3>
          </Link>
        </div>

        <p className="card__tagline">{excursion.tagline || excursion.description}</p>

        <div className="card__stop-preview">
          <span className="chip chip--accent">{excursion.audienceLabel}</span>
          <span className="chip">{excursion.district}</span>
        </div>

        <div className="card__stats">
          <div className="card__stats-row">
            <span className="card__stat-badge">{formatDistance(excursion.distanceKm)}</span>
            <span className="card__stat-badge">
              {formatStopCount(excursion.stops.length || excursion.pointsCount || 0)}
            </span>
            <span className="card__stat-badge card__stat-badge--difficulty">
              {formatDifficulty(excursion.difficulty)}
            </span>
          </div>
          <div className="card__stat-duration">{formatDuration(excursion.durationMinutes)}</div>
        </div>

        {(excursion.startLabel || excursion.finishLabel) ? (
          <div className="card__route-points">
            {excursion.startLabel ? (
              <span className="card__route-point" title={excursion.startLabel}>
                <strong>Старт:</strong> {excursion.startLabel}
              </span>
            ) : null}
            {excursion.finishLabel ? (
              <span className="card__route-point" title={excursion.finishLabel}>
                <strong>Финиш:</strong> {excursion.finishLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="card__actions">
          <Link className="button button--primary" to={routeUrl}>
            Открыть
          </Link>
          {isAuthenticated ? (
            <button
              aria-pressed={isSaved}
              className={`card__icon-button${isSaved ? ' card__icon-button--active' : ''}`}
              onClick={() => toggleSavedRoute(excursion)}
              type="button"
            >
              <span aria-hidden="true">{isSaved ? '♥' : '♡'}</span>
              <span>{isSaved ? 'Сохранено' : 'Сохранить'}</span>
            </button>
          ) : null}
          <button
            className="card__icon-button"
            onClick={() => void shareRoute(excursion)}
            type="button"
          >
            <span aria-hidden="true">↗</span>
            <span>Поделиться</span>
          </button>
        </div>
      </div>
    </article>
  )
}
