interface AdminPaginationProps {
  page: number
  totalPages: number
  totalElements: number
  size: number
  onPageChange: (page: number) => void
}

export function AdminPagination({
  page,
  totalPages,
  totalElements,
  size,
  onPageChange,
}: AdminPaginationProps) {
  if (totalPages <= 1) {
    return (
      <div className="admin-pagination">
        <span className="admin-pagination__info">
          {totalElements > 0
            ? `Всего: ${totalElements}`
            : 'Пусто'}
        </span>
      </div>
    )
  }

  const canPrev = page > 0
  const canNext = page < totalPages - 1
  const startItem = page * size + 1
  const endItem = Math.min((page + 1) * size, totalElements)

  return (
    <div className="admin-pagination">
      <span className="admin-pagination__info">
        {startItem}–{endItem} из {totalElements}
      </span>
      <div className="admin-pagination__controls">
        <button
          className="admin-btn admin-btn--ghost admin-btn--small"
          disabled={!canPrev}
          onClick={() => onPageChange(0)}
          type="button"
        >
          ‹‹
        </button>
        <button
          className="admin-btn admin-btn--ghost admin-btn--small"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          ‹
        </button>
        <span className="admin-pagination__page">
          {page + 1} / {totalPages}
        </span>
        <button
          className="admin-btn admin-btn--ghost admin-btn--small"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          ›
        </button>
        <button
          className="admin-btn admin-btn--ghost admin-btn--small"
          disabled={!canNext}
          onClick={() => onPageChange(totalPages - 1)}
          type="button"
        >
          ››
        </button>
      </div>
    </div>
  )
}
