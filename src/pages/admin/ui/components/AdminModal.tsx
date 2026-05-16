import { useEffect, type ReactNode } from 'react'

interface AdminModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function AdminModal({ isOpen, onClose, title, children, size = 'md' }: AdminModalProps) {
  // Close on Escape; reliably lock page scroll on BOTH html and body —
  // some layouts scroll the document element, others scroll body.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)

    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    // Compensate for the scrollbar disappearing so the layout doesn't shift.
    // Math.max guards against weird devtools/zoom states where innerWidth
    // can momentarily be < clientWidth (would otherwise add negative padding
    // and cause horizontal layout glitches).
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth)
    const prevBodyPaddingRight = body.style.paddingRight
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.removeEventListener('keydown', handleKey)
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.paddingRight = prevBodyPaddingRight
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="admin-modal" onClick={onClose}>
      <div
        className={`admin-modal__panel admin-modal__panel--${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="admin-modal__header">
          <h3 className="admin-modal__title">{title}</h3>
          <button
            aria-label="Закрыть"
            className="admin-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="admin-modal__body">{children}</div>
      </div>
    </div>
  )
}
