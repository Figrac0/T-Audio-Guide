import { AdminModal } from '@/pages/admin/ui/components/AdminModal'

interface AdminConfirmProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isWorking?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function AdminConfirm({
  isOpen,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  destructive = false,
  isWorking = false,
  onConfirm,
  onClose,
}: AdminConfirmProps) {
  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="admin-confirm__message">{message}</p>
      <div className="admin-confirm__actions">
        <button
          className="admin-btn admin-btn--ghost"
          disabled={isWorking}
          onClick={onClose}
          type="button"
        >
          {cancelLabel}
        </button>
        <button
          className={`admin-btn ${destructive ? 'admin-btn--danger' : 'admin-btn--primary'}`}
          disabled={isWorking}
          onClick={onConfirm}
          type="button"
        >
          {isWorking ? 'Выполняется…' : confirmLabel}
        </button>
      </div>
    </AdminModal>
  )
}
