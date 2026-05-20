import { useCallback, useEffect, useState } from 'react'

import { usePagedList } from '@/pages/admin/model/usePagedList'
import { AdminModal } from '@/pages/admin/ui/components/AdminModal'
import { AdminPagination } from '@/pages/admin/ui/components/AdminPagination'
import { PointForm } from '@/pages/admin/ui/components/PointForm'
import { PointMediaPanel } from '@/pages/admin/ui/components/PointMediaPanel'
import {
  adminService,
  type AdminPointShortItem,
  type CreatePointParams,
  type PatchPointParams,
} from '@/shared/api/adminService'
import type { ApiCategory, ApiPointDetail, ApiPointMedia } from '@/shared/api/mappers'

export function PointsSection() {
  const [categories, setCategories] = useState<ApiCategory[]>([])
  // Defer the "no categories" warning until we've actually heard back from
  // the backend — otherwise it flashes for ~300ms on every tab switch while
  // the list is loading, which the user perceives as a spurious error.
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  useEffect(() => {
    let active = true
    adminService
      .listCategories()
      .then((list) => {
        if (!active) return
        setCategories(list)
      })
      .finally(() => {
        if (active) setCategoriesLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const pageState = usePagedList<AdminPointShortItem>(
    useCallback(async ({ page, size, search }) => {
      const response = await adminService.listPointsPage({ page, size, search })
      return {
        items: response.points,
        page: response.page,
        size: response.size,
        totalElements: response.totalElements,
        totalPages: response.totalPages,
      }
    }, []),
  )

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<AdminPointShortItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await adminService.deletePoint(deleting.id)
      setDeleting(null)
      pageState.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить точку.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="admin-section">
      <header className="admin-section__head">
        <h2 className="admin-section__title">Точки интереса</h2>
        <button
          className="admin-btn admin-btn--primary"
          disabled={categories.length === 0}
          onClick={() => setCreating(true)}
          type="button"
        >
          + Создать
        </button>
      </header>

      {categoriesLoaded && categories.length === 0 ? (
        <div className="admin-form__status admin-form__status--error">
          Нет категорий. Создайте хотя бы одну во вкладке «Категории» — без неё точку нельзя сохранить.
        </div>
      ) : null}

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
              <th>Категория</th>
              <th style={{ width: 100 }}>Время</th>
              <th style={{ width: 100, textAlign: 'center' }}>Активна</th>
              <th style={{ width: 160 }}>Создана</th>
              <th style={{ width: 180 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {pageState.isLoading ? (
              <tr>
                <td className="admin-table__empty" colSpan={7}>Загружаем…</td>
              </tr>
            ) : pageState.items.length === 0 ? (
              <tr>
                <td className="admin-table__empty" colSpan={7}>
                  Точек пока нет
                </td>
              </tr>
            ) : (
              pageState.items.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.title}</td>
                  <td>{p.categoryName}</td>
                  <td>{p.visitTime ? `${p.visitTime} мин` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{p.active ? '✓' : '—'}</td>
                  <td className="admin-table__mono">{formatDate(p.createdAt)}</td>
                  <td>
                    <div className="admin-table__actions">
                      <button
                        className="admin-btn admin-btn--ghost admin-btn--small"
                        onClick={() => setEditingId(p.id)}
                        type="button"
                      >
                        Изм.
                      </button>
                      <button
                        className="admin-btn admin-btn--danger admin-btn--small"
                        onClick={() => setDeleting(p)}
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
        <AdminModal isOpen onClose={() => setCreating(false)} title="Новая точка" size="lg">
          <PointForm
            categories={categories}
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              const created = await adminService.createPoint(values as CreatePointParams)
              setCreating(false)
              pageState.refresh()
              setEditingId(created.id)
            }}
            submitLabel="Создать"
          />
        </AdminModal>
      ) : null}

      {editingId != null ? (
        <EditPointModal
          categories={categories}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            pageState.refresh()
          }}
          pointId={editingId}
        />
      ) : null}

      {deleting ? (
        <AdminModal isOpen onClose={() => setDeleting(null)} size="sm" title="Удалить точку?">
          <p className="admin-confirm__message">
            Точка <strong>{deleting.title}</strong> и все её медиа-файлы будут удалены.
            Действие необратимо.
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

// ── Edit modal: loads full point detail, allows updating fields + media ──────

interface EditPointModalProps {
  pointId: number
  categories: ApiCategory[]
  onClose: () => void
  onSaved: () => void
}

function EditPointModal({ pointId, categories, onClose, onSaved }: EditPointModalProps) {
  const [point, setPoint] = useState<ApiPointDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Trigger external reloads (e.g. after media upload) by bumping a key
  // instead of calling setState synchronously inside the effect.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true
    adminService
      .getPoint(pointId)
      .then((data) => {
        if (!active) return
        setPoint(data)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить точку.')
      })
    return () => {
      active = false
    }
  }, [pointId, reloadKey])

  // ApiPointDetail.media is ApiPointMedia[] (no id); we cast to admin variant
  // since the admin endpoint actually returns AdminPointMediaItem with `id`.
  const adminMedia = ((point?.media as ApiPointMedia[] | undefined) ?? []) as Array<
    ApiPointMedia & { id: number; createdAt: string }
  >

  return (
    <AdminModal isOpen onClose={onClose} title={`Точка #${pointId}`} size="lg">
      {loadError ? (
        <div className="admin-form__status admin-form__status--error">{loadError}</div>
      ) : !point ? (
        <p className="admin-confirm__message">Загружаем…</p>
      ) : (
        <>
          <PointForm
            categories={categories}
            initial={point}
            onCancel={onClose}
            onSubmit={async (values) => {
              const updated = await adminService.patchPoint(pointId, values as PatchPointParams)
              setPoint(updated)
              onSaved()
            }}
            submitLabel="Сохранить изменения"
          />

          <hr className="admin-divider" />

          <PointMediaPanel
            media={adminMedia}
            onChanged={() => {
              reload()
              onSaved()
            }}
            pointId={pointId}
          />
        </>
      )}
    </AdminModal>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
