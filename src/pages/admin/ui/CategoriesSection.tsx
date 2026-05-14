import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AdminModal } from '@/pages/admin/ui/components/AdminModal'
import { adminService, type CategoryRequest } from '@/shared/api/adminService'
import type { ApiCategory } from '@/shared/api/mappers'

// Russian → latin transliteration for slug auto-suggest.
const cyrillicMap: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => cyrillicMap[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export function CategoriesSection() {
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState<ApiCategory | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ApiCategory | null>(null)

  // Trigger reload via key bump — setting loading/error state synchronously
  // inside the effect would violate react-hooks/set-state-in-effect.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true
    adminService
      .listCategories()
      .then((data) => {
        if (!active) return
        setCategories(data)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить категории.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  return (
    <section className="admin-section">
      <header className="admin-section__head">
        <h2 className="admin-section__title">Категории</h2>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setEditing('new')}
          type="button"
        >
          + Создать
        </button>
      </header>

      {loadError ? (
        <div className="admin-form__status admin-form__status--error">{loadError}</div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>ID</th>
              <th>Название</th>
              <th>Slug</th>
              <th style={{ width: 160 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="admin-table__empty" colSpan={4}>
                  Загружаем…
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td className="admin-table__empty" colSpan={4}>
                  Пока нет ни одной категории
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.id}</td>
                  <td>{cat.name}</td>
                  <td className="admin-table__mono">{cat.slug}</td>
                  <td>
                    <div className="admin-table__actions">
                      <button
                        className="admin-btn admin-btn--ghost admin-btn--small"
                        onClick={() => setEditing(cat)}
                        type="button"
                      >
                        Изм.
                      </button>
                      <button
                        className="admin-btn admin-btn--danger admin-btn--small"
                        onClick={() => setDeleting(cat)}
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

      {editing ? (
        <CategoryFormModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteCategoryDialog
          category={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            reload()
          }}
        />
      ) : null}
    </section>
  )
}

interface CategoryFormModalProps {
  category: ApiCategory | null
  onClose: () => void
  onSaved: () => void
}

function CategoryFormModal({ category, onClose, onSaved }: CategoryFormModalProps) {
  const isEdit = category !== null
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleNameChange(value: string) {
    setName(value)
    if (!isEdit && (slug === '' || slug === slugify(name))) {
      setSlug(slugify(value))
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsWorking(true)
    try {
      const payload: CategoryRequest = { name: name.trim(), slug: slug.trim() }
      if (isEdit && category) {
        await adminService.patchCategory(category.id, payload)
      } else {
        await adminService.createCategory(payload)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить категорию.')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <AdminModal
      isOpen
      onClose={onClose}
      title={isEdit ? `Редактировать категорию #${category!.id}` : 'Новая категория'}
    >
      <form className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-form__row">
          <label className="admin-form__label" htmlFor="cf-name">Название</label>
          <input
            autoFocus
            className="admin-form__input"
            id="cf-name"
            maxLength={50}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Музей"
            required
            value={name}
          />
        </div>
        <div className="admin-form__row">
          <label className="admin-form__label" htmlFor="cf-slug">
            Slug (a-z, 0-9, дефис)
          </label>
          <input
            className="admin-form__input"
            id="cf-slug"
            maxLength={50}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            placeholder="museum"
            required
            value={slug}
          />
        </div>
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
            disabled={isWorking || !name.trim() || !slug.trim()}
            type="submit"
          >
            {isWorking ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>
    </AdminModal>
  )
}

interface DeleteCategoryDialogProps {
  category: ApiCategory
  onClose: () => void
  onDeleted: () => void
}

function DeleteCategoryDialog({ category, onClose, onDeleted }: DeleteCategoryDialogProps) {
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    setIsWorking(true)
    try {
      await adminService.deleteCategory(category.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить категорию.')
      setIsWorking(false)
    }
  }

  return (
    <AdminModal isOpen onClose={onClose} title="Удалить категорию?" size="sm">
      <p className="admin-confirm__message">
        Категория <strong>{category.name}</strong> ({category.slug}) будет удалена.
        Если к ней привязаны точки, бэкенд вернёт ошибку.
      </p>
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
          className="admin-btn admin-btn--danger"
          disabled={isWorking}
          onClick={handleConfirm}
          type="button"
        >
          {isWorking ? 'Удаляем…' : 'Удалить'}
        </button>
      </div>
    </AdminModal>
  )
}
