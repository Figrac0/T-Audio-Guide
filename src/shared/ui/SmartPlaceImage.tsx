import { useMemo } from 'react'
import type { ImgHTMLAttributes } from 'react'

import type { PointCategory } from '@/entities/excursion/model/types'
import { buildPlacePlaceholderImage } from '@/shared/lib/placeholder-images'
import { ResilientImage } from '@/shared/ui/ResilientImage'

interface SmartPlaceImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  category: PointCategory
  fallbackSrcs?: string[]
  src?: string | null
}

export function SmartPlaceImage({
  category,
  fallbackSrcs = [],
  src,
  ...props
}: SmartPlaceImageProps) {
  const placeholderImage = useMemo(
    () => buildPlacePlaceholderImage(category),
    [category],
  )
  const allFallbacks = useMemo(
    () =>
      [...fallbackSrcs, '/illustrations/landmark-card.svg'].filter(
        (value, index, source): value is string =>
          typeof value === 'string' && value.length > 0 && source.indexOf(value) === index,
      ),
    [fallbackSrcs],
  )

  return (
    <ResilientImage
      {...props}
      fallbackSrcs={allFallbacks}
      placeholderSrc={placeholderImage}
      src={src ?? undefined}
    />
  )
}
