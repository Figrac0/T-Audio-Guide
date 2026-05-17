import type { CSSProperties } from 'react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Excursion } from '@/entities/excursion/model/types'
import { ExcursionCard } from '@/entities/excursion/ui/ExcursionCard'
import { useAnimatedItems } from '@/shared/lib/useAnimatedItems'
import './ExcursionCatalog.css'

interface ExcursionCatalogProps {
  excursions: Excursion[]
  emptyTitle?: string
  emptyDescription?: string
  isError?: boolean
}

const getExcursionKey = (excursion: Excursion) => excursion.slug

export function ExcursionCatalog({
  excursions,
  emptyTitle = 'Маршруты пока не найдены',
  emptyDescription = 'Попробуйте сменить категорию или время прогулки.',
  isError = false,
}: ExcursionCatalogProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const viewSignature = useMemo(() => {
    if (excursions.length) {
      return `items:${excursions.map((excursion) => excursion.slug).join('|')}`
    }

    return `status:${isError ? 'error' : 'empty'}:${emptyTitle}:${emptyDescription}`
  }, [emptyDescription, emptyTitle, excursions, isError])
  const { items: animatedExcursions, phase } = useAnimatedItems(excursions, {
    getKey: getExcursionKey,
    signature: viewSignature,
  })

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return undefined

    const updateHeight = () => {
      setContentHeight(Math.ceil(node.getBoundingClientRect().height))
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)

    return () => observer.disconnect()
  }, [animatedExcursions, emptyDescription, emptyTitle, isError, phase])

  const shellStyle =
    contentHeight === null
      ? undefined
      : ({ '--catalog-min-height': `${contentHeight}px` } as CSSProperties)

  const content = animatedExcursions.length ? (
    <div className="catalog">
      {animatedExcursions.map((excursion) => (
        <ExcursionCard excursion={excursion} key={excursion.slug} />
      ))}
    </div>
  ) : isError ? (
    <section className="status-card status-card--error">
      <h3 className="status-card__title">Не удалось загрузить маршруты</h3>
      <p className="status-card__text">Сервис временно недоступен. Попробуйте перезагрузить страницу.</p>
    </section>
  ) : (
    <section className="status-card">
      <h3 className="status-card__title">{emptyTitle}</h3>
      <p className="status-card__text">{emptyDescription}</p>
    </section>
  )

  return (
    <div className={`catalog-shell catalog-shell--${phase}`} style={shellStyle}>
      <div className="catalog-shell__content" ref={contentRef}>
        {content}
      </div>
    </div>
  )
}
