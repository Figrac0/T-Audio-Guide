import type { Excursion } from '@/entities/excursion/model/types'
import { ExcursionCard } from '@/entities/excursion/ui/ExcursionCard'
import './ExcursionCatalog.css'

interface ExcursionCatalogProps {
  excursions: Excursion[]
  emptyTitle?: string
  emptyDescription?: string
  isError?: boolean
}

export function ExcursionCatalog({
  excursions,
  emptyTitle = 'Маршруты пока не найдены',
  emptyDescription = 'Попробуйте сменить категорию или время прогулки.',
  isError = false,
}: ExcursionCatalogProps) {
  if (!excursions.length) {
    if (isError) {
      return (
        <section className="status-card status-card--error">
          <h3 className="status-card__title">Не удалось загрузить маршруты</h3>
          <p className="status-card__text">Сервис временно недоступен. Попробуйте перезагрузить страницу.</p>
        </section>
      )
    }
    return (
      <section className="status-card">
        <h3 className="status-card__title">{emptyTitle}</h3>
        <p className="status-card__text">{emptyDescription}</p>
      </section>
    )
  }

  return (
    <div className="catalog">
      {excursions.map((excursion) => (
        <ExcursionCard excursion={excursion} key={excursion.slug} />
      ))}
    </div>
  )
}
