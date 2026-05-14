import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { usePagedList } from '@/pages/admin/model/usePagedList'
import { AdminModal } from '@/pages/admin/ui/components/AdminModal'
import { AdminPagination } from '@/pages/admin/ui/components/AdminPagination'
import {
  adminService,
  type AdminUserDetailResponse,
  type AdminUserShortItem,
} from '@/shared/api/adminService'

export function UsersSection() {
  const pageState = usePagedList<AdminUserShortItem>(
    useCallback(async ({ page, size, search }) => {
      const response = await adminService.listUsersPage({ page, size, search })
      return {
        items: response.users,
        page: response.page,
        size: response.size,
        totalElements: response.totalElements,
        totalPages: response.totalPages,
      }
    }, []),
  )

  const [editingId, setEditingId] = useState<number | null>(null)

  return (
    <section className="admin-section">
      <header className="admin-section__head">
        <h2 className="admin-section__title">Пользователи</h2>
        <span className="admin-section__hint">
          Регистрация публичная — через /sign-in. Здесь можно менять роль, язык
          и активировать/деактивировать аккаунт.
        </span>
      </header>

      <div className="admin-toolbar">
        <input
          className="admin-form__input admin-toolbar__search"
          onChange={(e) => pageState.setSearch(e.target.value)}
          placeholder="Поиск по email/имени…"
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
              <th>Email</th>
              <th style={{ width: 90 }}>Роль</th>
              <th style={{ width: 90 }}>Активен</th>
              <th style={{ width: 160 }}>Создан</th>
              <th style={{ width: 140 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {pageState.isLoading ? (
              <tr>
                <td className="admin-table__empty" colSpan={6}>Загружаем…</td>
              </tr>
            ) : pageState.items.length === 0 ? (
              <tr>
                <td className="admin-table__empty" colSpan={6}>Пользователей не найдено</td>
              </tr>
            ) : (
              pageState.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td className="admin-table__mono">{u.email}</td>
                  <td>
                    <span className={`admin-role admin-role--${u.role.toLowerCase()}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{u.active ? '✓' : '—'}</td>
                  <td className="admin-table__mono">{formatDate(u.createdAt)}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--small"
                      onClick={() => setEditingId(u.id)}
                      type="button"
                    >
                      Изменить
                    </button>
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

      {editingId != null ? (
        <EditUserModal
          onClose={() => setEditingId(null)}
          onSaved={() => {
            pageState.refresh()
          }}
          userId={editingId}
        />
      ) : null}
    </section>
  )
}

interface EditUserModalProps {
  userId: number
  onClose: () => void
  onSaved: () => void
}

function EditUserModal({ userId, onClose, onSaved }: EditUserModalProps) {
  const [user, setUser] = useState<AdminUserDetailResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [lang, setLang] = useState('RU')
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER')
  const [active, setActive] = useState(true)

  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoadError(null)
    adminService
      .getUser(userId)
      .then((u) => {
        setUser(u)
        setEmail(u.email)
        setLang((u.lang ?? 'RU').toUpperCase())
        setRole((u.role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER') as 'USER' | 'ADMIN')
        setActive(u.active)
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить пользователя.'),
      )
  }, [userId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsWorking(true)
    try {
      await adminService.patchUser(userId, {
        email: email.trim(),
        lang,
        role,
        active,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить пользователя.')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <AdminModal isOpen onClose={onClose} title={`Пользователь #${userId}`}>
      {loadError ? (
        <div className="admin-form__status admin-form__status--error">{loadError}</div>
      ) : !user ? (
        <p className="admin-confirm__message">Загружаем…</p>
      ) : (
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form__row">
            <label className="admin-form__label">Имя (read-only)</label>
            <input className="admin-form__input" disabled readOnly value={user.name} />
          </div>

          <div className="admin-form__row">
            <label className="admin-form__label" htmlFor="us-email">Email</label>
            <input
              className="admin-form__input"
              id="us-email"
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </div>

          <div className="admin-form__row admin-form__row--double">
            <div>
              <label className="admin-form__label" htmlFor="us-lang">Язык</label>
              <select
                className="admin-form__select"
                id="us-lang"
                onChange={(e) => setLang(e.target.value)}
                value={lang}
              >
                <option value="RU">RU</option>
                <option value="EN">EN</option>
                <option value="DE">DE</option>
                <option value="FR">FR</option>
                <option value="ES">ES</option>
              </select>
            </div>
            <div>
              <label className="admin-form__label" htmlFor="us-role">Роль</label>
              <select
                className="admin-form__select"
                id="us-role"
                onChange={(e) => setRole(e.target.value as 'USER' | 'ADMIN')}
                value={role}
              >
                <option value="USER">USER — обычный пользователь</option>
                <option value="ADMIN">ADMIN — администратор</option>
              </select>
            </div>
          </div>

          <div className="admin-form__row">
            <label className="admin-form__checkbox">
              <input
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                type="checkbox"
              />
              <span>Аккаунт активен</span>
            </label>
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
              disabled={isWorking || !email.trim()}
              type="submit"
            >
              {isWorking ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
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
