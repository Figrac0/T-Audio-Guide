import { useEffect } from 'react'

import type { NearbyPoint } from '@/entities/excursion/model/types'
import { formatMeters } from '@/features/route-map/lib/route-geometry'
import { formatPointCategory } from '@/shared/lib/format'
import { SmartPlaceImage } from '@/shared/ui/SmartPlaceImage'
import './PointModal.css'

interface PointModalProps {
  isInDraft: boolean
  isDraftFull: boolean
  point: NearbyPoint
  onAddToDraft: (point: NearbyPoint) => void
  onClose: () => void
}

export function PointModal({
  isInDraft,
  isDraftFull,
  point,
  onAddToDraft,
  onClose,
}: PointModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const addDisabled = isInDraft || isDraftFull
  const addLabel = isInDraft
    ? 'Уже в маршруте ✓'
    : isDraftFull
      ? 'Маршрут заполнен (макс. 6)'
      : 'Добавить в маршрут'

  return (
    <div
      className="point-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="point-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Закрыть"
          className="point-modal__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>

        <div className="point-modal__cover">
          <SmartPlaceImage
            alt={point.title}
            category={point.category}
            loading="eager"
            src={point.imageUrl}
          />
        </div>

        <div className="point-modal__body">
          <div className="point-modal__meta">
            <span className="point-modal__category">
              {formatPointCategory(point.category)}
            </span>
            {point.distanceMeters > 0 && (
              <span className="point-modal__distance">
                {formatMeters(point.distanceMeters)}
              </span>
            )}
          </div>

          <h2 className="point-modal__title">{point.title}</h2>
          <p className="point-modal__desc">{point.shortDescription}</p>

          {point.scheduleLabel && (
            <p className="point-modal__schedule">{point.scheduleLabel}</p>
          )}

          <button
            className={`button point-modal__action${isInDraft ? '' : ' button--primary'}`}
            disabled={addDisabled}
            onClick={() => {
              if (!addDisabled) {
                onAddToDraft(point)
                onClose()
              }
            }}
            type="button"
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
