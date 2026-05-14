import { useEffect, useMemo, useState } from 'react'

import {
  adminService,
  type AdminPointShortItem,
} from '@/shared/api/adminService'

interface PointsPickerProps {
  selectedIds: number[]
  onChange: (next: number[]) => void
}

export function PointsPicker({ selectedIds, onChange }: PointsPickerProps) {
  const [points, setPoints] = useState<AdminPointShortItem[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(id)
  }, [search])

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)
    adminService
      // Big page — admin won't have thousands here, and we need full list so
      // already-selected points (which may not match `search`) still display
      // in the ordered list.
      .listPointsPage({ page: 0, size: 100, search: debouncedSearch || undefined })
      .then((response) => {
        if (active) setPoints(response.points)
      })
      .catch((err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : 'Не удалось загрузить точки.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [debouncedSearch])

  // Selected points kept in order, with full info if available in current page.
  // For points outside the current page (e.g. after search narrowed the list),
  // we still keep them in the selection — just shown by id.
  const selectedDetails = useMemo(() => {
    const byId = new Map(points.map((p) => [p.id, p]))
    return selectedIds.map((id) => byId.get(id) ?? null)
  }, [points, selectedIds])

  function toggle(id: number) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    )
  }

  function move(index: number, direction: -1 | 1) {
    const next = selectedIds.slice()
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="admin-points-picker-wrap">
      {selectedIds.length > 0 ? (
        <div className="admin-points-picker__selected">
          <h5 className="admin-section__subtitle">
            Маршрут ({selectedIds.length})
          </h5>
          <ol className="admin-points-picker__selected-list">
            {selectedDetails.map((point, index) => {
              const id = selectedIds[index]
              return (
                <li className="admin-points-picker__selected-item" key={id}>
                  <span className="admin-points-picker__order">{index + 1}</span>
                  <span className="admin-points-picker__title">
                    {point?.title ?? `Точка #${id}`}
                  </span>
                  <div className="admin-points-picker__order-controls">
                    <button
                      aria-label="Вверх"
                      className="admin-btn admin-btn--ghost admin-btn--small"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label="Вниз"
                      className="admin-btn admin-btn--ghost admin-btn--small"
                      disabled={index === selectedIds.length - 1}
                      onClick={() => move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      className="admin-btn admin-btn--danger admin-btn--small"
                      onClick={() => toggle(id)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      <div className="admin-points-picker__available">
        <h5 className="admin-section__subtitle">Доступные точки</h5>
        <input
          className="admin-form__input"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию…"
          type="search"
          value={search}
        />
        {error ? (
          <div className="admin-form__status admin-form__status--error">{error}</div>
        ) : null}
        <div className="admin-points-picker">
          {isLoading ? (
            <div className="admin-points-picker__empty">Загружаем…</div>
          ) : points.length === 0 ? (
            <div className="admin-points-picker__empty">
              Точек не найдено
            </div>
          ) : (
            points.map((point) => {
              const orderIndex = selectedIds.indexOf(point.id)
              const isSelected = orderIndex !== -1
              return (
                <button
                  className={`admin-points-picker__item${isSelected ? ' admin-points-picker__item--selected' : ''}`}
                  key={point.id}
                  onClick={() => toggle(point.id)}
                  type="button"
                >
                  <span
                    className="admin-points-picker__order"
                    style={
                      isSelected
                        ? undefined
                        : {
                            background: 'transparent',
                            color: 'var(--color-text-secondary)',
                            border: '1px dashed var(--color-line)',
                          }
                    }
                  >
                    {isSelected ? orderIndex + 1 : '+'}
                  </span>
                  <span className="admin-points-picker__title">{point.title}</span>
                  <span className="admin-points-picker__category">
                    {point.categoryName}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
