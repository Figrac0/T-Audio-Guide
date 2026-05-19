const FILE_MAP: Record<string, string> = {
  museum:        'museum',
  food:          'food',
  entertainment: 'entertainment',
  park:          'nature',
  landmark:      'history',
}

const imgHtml = (file: string, size = 18) =>
  `<img src="/icons/${file}.svg" class="poi-cat-icon" width="${size}" height="${size}" alt="" draggable="false">`

const allSvg =
  `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">` +
  `<circle fill="currentColor" cx="5.5" cy="5.5" r="2.2"/>` +
  `<circle fill="currentColor" cx="14.5" cy="5.5" r="2.2"/>` +
  `<circle fill="currentColor" cx="5.5" cy="14.5" r="2.2"/>` +
  `<circle fill="currentColor" cx="14.5" cy="14.5" r="2.2"/>` +
  `</svg>`

export const CATEGORY_SVG: Record<string, string> = {
  all:           allSvg,
  museum:        imgHtml('museum'),
  food:          imgHtml('food'),
  entertainment: imgHtml('entertainment'),
  park:          imgHtml('nature'),
  landmark:      imgHtml('history'),
}

export function getCategorySvg(category: string): string {
  return CATEGORY_SVG[category] ?? CATEGORY_SVG.landmark
}

export { FILE_MAP }
