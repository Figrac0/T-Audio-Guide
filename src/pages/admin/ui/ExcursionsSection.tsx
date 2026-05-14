import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { usePagedList } from '@/pages/admin/model/usePagedList'
import { AdminModal } from '@/pages/admin/ui/components/AdminModal'
import { AdminPagination } from '@/pages/admin/ui/components/AdminPagination'
import { PointsPicker } from '@/pages/admin/ui/components/PointsPicker'
import {
  adminService,
  type AdminExcursionShortItem,
} from '@/shared/api/adminService'
import type { ApiExcursionDetail } from '@/shared/api/mappers'

export function ExcursionsSection() {
  const pageState = usePagedList<AdminExcursionShortItem>(
    useCallback(async ({ page, size, search }) => {
      const response = await adminService.listExcursionsPage({ page, size, search })
      return {
        items: response.excursions,
        page: response.page,
        size: response.size,
        totalElements: response.totalElements,
        totalPages: response.totalPages,
      }
    }, []),
  )

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<AdminExcursionShortItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await adminService.deleteExcursion(deleting.id)
      setDeleting(null)
      pageState.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить экскурсию.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="admin-section">
      <header className="admin-section__head">
        <h2 className="admin-section__title">Экскурсии</h2>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setCreating(true)}
          type="button"
        >
          + Создать
        </button>
      </header>

      <div className="admin-toolbar">
        <input
          className="admin-form__input admin-toolbar__search"
          onChange={(e) => pageState.setSearch(e.target.value)}
          placeholder="Поиск по названию…"
          value={pageState.search}
        />
      </div>

      {pageState.error ? (
        <div className="admin-form__status admin-form__status--error">{pageState.error}</div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>ID</th>
              <th>Название</th>
              <th style={{ width: 100 }}>Тип</th>
              <th style={{ width: 90 }}>Видимость</th>
              <th style={{ width: 80 }}>Точек</th>
              <th style={{ width: 100 }}>Длит.</th>
              <th style={{ width: 90 }}>Рейтинг</th>
              <th style={{ width: 160 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {pageState.isLoading ? (
              <tr>
                <td className="admin-table__empty" colSpan={8}>Загружаем…</td>
              </tr>
            ) : pageState.items.length === 0 ? (
              <tr>
                <td className="admin-table__empty" colSpan={8}>
                  Экскурсий пока нет
                </td>
              </tr>
            ) : (
              pageState.items.map((ex) => (
                <tr key={ex.id}>
                  <td>{ex.id}</td>
                  <td>{ex.title}</td>
                  <td className="admin-table__mono">{ex.routeType}</td>
                  <td className="admin-table__mono">{ex.visibility}</td>
                  <td>{ex.pointsCount ?? '—'}</td>
                  <td>{ex.durationMin ? `${ex.durationMin} мин` : '—'}</td>
                  <td>
                    {ex.rating != null
                      ? `${ex.rating.toFixed(1)} (${ex.reviewsCount ?? 0})`
                      : '—'}
                  </td>
                  <td>
                    <div className="admin-table__actions">
                      <button
                        className="admin-btn admin-btn--ghost admin-btn--small"
                        onClick={() => setEditingId(ex.id)}
                        type="button"
                      >
                        Изм.
                      </button>
                      <button
                        className="admin-btn admin-btn--danger admin-btn--small"
                        onClick={() => setDeleting(ex)}
                        type="button"
                      >
                        Уд.
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        onPageChange={pageState.setPage}
        page={pageState.page}
        size={pageState.size}
        totalElements={pageState.totalElements}
        totalPages={pageState.totalPages}
      />

      {creating ? (
        <CreateExcursionModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            pageState.refresh()
          }}
        />
      ) : null}

      {editingId != null ? (
        <EditExcursionModal
          excursionId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => pageState.refresh()}
        />
      ) : null}

      {deleting ? (
        <AdminModal isOpen onClose={() => setDeleting(null)} size="sm" title="Удалить экскурсию?">
          <p className="admin-confirm__message">
            Экскурсия <strong>{deleting.title}</strong> будет удалена вместе со связанными
            данными (точки маршрута, избранное, отзывы пользователей).
          </p>
          {deleteError ? (
            <div className="admin-form__status admin-form__status--error">{deleteError}</div>
          ) : null}
          <div className="admin-confirm__actions">
            <button
              className="admin-btn admin-btn--ghost"
              disabled={isDeleting}
              onClick={() => setDeleting(null)}
              type="button"
            >
              Отмена
            </button>
            <button
              className="admin-btn admin-btn--danger"
              disabled={isDeleting}
              onClick={handleDelete}
              type="button"
            >
              {isDeleting ? 'Удаляем…' : 'Удалить'}
            </button>
          </div>
        </AdminModal>
      ) : null}
    </section>
  )
}

// ── Create modal ────────────────────────────────────────────────────────────

interface CreateExcursionModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateExcursionModal({ onClose, onCreated }: CreateExcursionModalProps) {
  const [title, setTitle] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [selectedPointIds, setSelectedPointIds] = useState<number[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (selectedPointIds.length < 1) {
      setError('Выберите хотя бы одну точку.')
      return
    }
    setIsWorking(true)
    try {
      await adminService.createPrebuiltExcursion({
        title: title.trim(),
        description: description.trim() || undefined,
        shortDescription: shortDescription.trim() || undefined,
        visibility,
        points: selectedPointIds.map((pointId, index) => ({ pointId, order: index + 1 })),
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать экскурсию.')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <AdminModal isOpen onClose={onClose} title="Новая экскурсия" size="lg">
      <form className="admin-form" onSubmit={handleSubmit}>
        <ExcursionFields
          description={description}
          onDescriptionChange={setDescription}
          onShortDescriptionChange={setShortDescription}
          onTitleChange={setTitle}
          onVisibilityChange={setVisibility}
          shortDescription={shortDescription}
          title={title}
          visibility={visibility}
        />
        <hr className="admin-divider" />
        <PointsPicker
          onChange={setSelectedPointIds}
          selectedIds={selectedPointIds}
        />
        {error ? (
          <div className="admin-form__status admin-form__status--error">{error}</div>
        ) : null}
        <div className="admin-confirm__actions">
          <button
            className="admin-btn admin-btn--ghost"
            disabled={isWorking}
            onClick={onClose}
            type="button"
          >
            Отмена
          </button>
          <button
            className="admin-btn admin-btn--primary"
            disabled={isWorking || !title.trim() || selectedPointIds.length === 0}
            type="submit"
          >
            {isWorking ? 'Создаём…' : `Создать (${selectedPointIds.length} точек)`}
          </button>
        </div>
      </form>
    </AdminModal>
  )
}

// ── Edit modal ──────────────────────────────────────────────────────────────

interface EditExcursionModalProps {
  excursionId: number
  onClose: () => void
  onSaved: () => void
}

function EditExcursionModal({ excursionId, onClose, onSaved }: EditExcursionModalProps) {
  const [excursion, setExcursion] = useState<ApiExcursionDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    adminService
      .getExcursion(excursionId)
      .then((data) => {
        if (!active) return
        setExcursion(data)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить экскурсию.')
      })
    return () => {
      active = false
    }
  }, [excursionId])

  return (
    <AdminModal isOpen onClose={onClose} title={`Экскурсия #${excursionId}`} size="lg">
      {loadError ? (
        <div className="admin-form__status admin-form__status--error">{loadError}</div>
      ) : !excursion ? (
        <p className="admin-confirm__message">Загружаем…</p>
      ) : (
        <EditExcursionForms
          excursion={excursion}
          onMetadataSaved={(updated) => {
            setExcursion(updated)
            onSaved()
          }}
          onPointsSaved={(updated) => {
            setExcursion(updated)
            onSaved()
          }}
        />
      )}
    </AdminModal>
  )
}

interface EditExcursionFormsProps {
  excursion: ApiExcursionDetail
  onMetadataSaved: (updated: ApiExcursionDetail) => void
  onPointsSaved: (updated: ApiExcursionDetail) => void
}

function EditExcursionForms({
  excursion,
  onMetadataSaved,
  onPointsSaved,
}: EditExcursionFormsProps) {
  const [title, setTitle] = useState(excursion.title)
  const [shortDescription, setShortDescription] = useState(excursion.shortDescription ?? '')
  const [description, setDescription] = useState(excursion.description ?? '')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(
    (excursion.visibility as 'PUBLIC' | 'PRIVATE') ?? 'PUBLIC',
  )
  const [metaWorking, setMetaWorking] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)

  // Extract current point IDs in order from the detail response.
  const existingPointIds = (() => {
    const raw = excursion.points
    if (!raw) return []
    const items = Array.isArray(raw) ? raw : (raw as { points?: Array<{ id: number }> }).points
    if (!Array.isArray(items)) return []
    return items.map((p) => p.id)
  })()
  const [selectedPointIds, setSelectedPointIds] = useState<number[]>(existingPointIds)
  const [pointsWorking, setPointsWorking] = useState(false)
  const [pointsError, setPointsError] = useState<string | null>(null)

  async function handleSaveMetadata(event: FormEvent) {
    event.preventDefault()
    setMetaError(null)
    setMetaWorking(true)
    try {
      const updated = await adminService.patchExcursion(excursion.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        shortDescription: shortDescription.trim() || undefined,
        visibility,
      })
      onMetadataSaved(updated)
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Не удалось сохранить.')
    } finally {
      setMetaWorking(false)
    }
  }

  async function handleSavePoints() {
    setPointsError(null)
    if (selectedPointIds.length < 1) {
      setPointsError('Маршрут должен содержать хотя бы одну точку.')
      return
    }
    setPointsWorking(true)
    try {
      const updated = await adminService.setExcursionPoints(
        excursion.id,
        selectedPointIds.map((pointId, index) => ({ pointId, order: index + 1 })),
      )
      onPointsSaved(updated)
    } catch (err) {
      setPointsError(err instanceof Error ? err.message : 'Не удалось сохранить маршрут.')
    } finally {
      setPointsWorking(false)
    }
  }

  return (
    <>
      <form className="admin-form" onSubmit={handleSaveMetadata}>
        <ExcursionFields
          description={description}
          onDescriptionChange={setDescription}
          onShortDescriptionChange={setShortDescription}
          onTitleChange={setTitle}
          onVisibilityChange={setVisibility}
          shortDescription={shortDescription}
          title={title}
          visibility={visibility}
        />
        {metaError ? (
          <div className="admin-form__status admin-form__status--error">{metaError}</div>
        ) : null}
        <button
          className="admin-btn admin-btn--primary"
          disabled={metaWorking || !title.trim()}
          type="submit"
        >
          {metaWorking ? 'Сохраняем…' : 'Сохранить метаданные'}
        </button>
      </form>

      <hr className="admin-divider" />

      <h4 className="admin-section__subtitle">Маршрут (PUT /admin/excursions/{excursion.id}/points)</h4>
      <PointsPicker onChange={setSelectedPointIds} selectedIds={selectedPointIds} />
      {pointsError ? (
        <div className="admin-form__status admin-form__status--error">{pointsError}</div>
      ) : null}
      <button
        className="admin-btn admin-btn--primary"
        disabled={pointsWorking || selectedPointIds.length === 0}
        onClick={handleSavePoints}
        type="button"
      >
        {pointsWorking ? 'Сохраняем…' : 'Сохранить маршрут'}
      </button>
    </>
  )
}

interface ExcursionFieldsProps {
  title: string
  shortDescription: string
  description: string
  visibility: 'PUBLIC' | 'PRIVATE'
  onTitleChange: (v: string) => void
  onShortDescriptionChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onVisibilityChange: (v: 'PUBLIC' | 'PRIVATE') => void
}

function ExcursionFields({
  title,
  shortDescription,
  description,
  visibility,
  onTitleChange,
  onShortDescriptionChange,
  onDescriptionChange,
  onVisibilityChange,
}: ExcursionFieldsProps) {
  return (
    <>
      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="ex-title">Название</label>
        <input
          className="admin-form__input"
          id="ex-title"
          maxLength={255}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Сердце Москвы"
          required
          value={title}
        />
      </div>
      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="ex-short">Краткое описание</label>
        <input
          className="admin-form__input"
          id="ex-short"
          maxLength={255}
          onChange={(e) => onShortDescriptionChange(e.target.value)}
          placeholder="Прогулка по центру"
          value={shortDescription}
        />
      </div>
      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="ex-desc">Полное описание</label>
        <textarea
          className="admin-form__textarea"
          id="ex-desc"
          maxLength={5000}
          onChange={(e) => onDescriptionChange(e.target.value)}
          value={description}
        />
      </div>
      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="ex-vis">Видимость</label>
        <select
          className="admin-form__select"
          id="ex-vis"
          onChange={(e) => onVisibilityChange(e.target.value as 'PUBLIC' | 'PRIVATE')}
          value={visibility}
        >
          <option value="PUBLIC">PUBLIC — публичная</option>
          <option value="PRIVATE">PRIVATE — приватная</option>
        </select>
      </div>
    </>
  )
}
