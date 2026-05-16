import type { ExcursionTheme, PointCategory } from '@/entities/excursion/model/types'

interface IllustrationPalette {
  accent: string
  accentSoft: string
  backgroundFrom: string
  backgroundTo: string
  foreground: string
  glow: string
}

const placePalettes: Record<PointCategory, IllustrationPalette> = {
  museum: {
    accent: '#355070',
    accentSoft: '#89a3b5',
    backgroundFrom: '#eef4f8',
    backgroundTo: '#d7e4eb',
    foreground: '#173042',
    glow: '#c7d9e7',
  },
  food: {
    accent: '#d97706',
    accentSoft: '#f4c27a',
    backgroundFrom: '#fff6ea',
    backgroundTo: '#f8e2be',
    foreground: '#5f3404',
    glow: '#ffe5b8',
  },
  park: {
    accent: '#4f772d',
    accentSoft: '#9ec27d',
    backgroundFrom: '#edf7ec',
    backgroundTo: '#d7e8d1',
    foreground: '#1f3b16',
    glow: '#d9efd2',
  },
  entertainment: {
    accent: '#7c3aed',
    accentSoft: '#c4a5ff',
    backgroundFrom: '#f4efff',
    backgroundTo: '#e6dafe',
    foreground: '#372257',
    glow: '#e3d9ff',
  },
  landmark: {
    accent: '#0f4c81',
    accentSoft: '#7eb2dc',
    backgroundFrom: '#edf5fb',
    backgroundTo: '#d7e4ef',
    foreground: '#102a43',
    glow: '#d0e4f4',
  },
}

const routePalettes: Record<ExcursionTheme, IllustrationPalette> = {
  walk: {
    accent: '#0f766e',
    accentSoft: '#8dd3cd',
    backgroundFrom: '#ecfbf8',
    backgroundTo: '#d6efea',
    foreground: '#173042',
    glow: '#d6f6f1',
  },
  food: {
    accent: '#d97706',
    accentSoft: '#f4c27a',
    backgroundFrom: '#fff7ea',
    backgroundTo: '#f9e4c4',
    foreground: '#5f3404',
    glow: '#ffe5bf',
  },
  nature: {
    accent: '#4f772d',
    accentSoft: '#9ec27d',
    backgroundFrom: '#edf7ec',
    backgroundTo: '#d8ead2',
    foreground: '#1f3b16',
    glow: '#d8efd1',
  },
  fun: {
    accent: '#7c3aed',
    accentSoft: '#c4a5ff',
    backgroundFrom: '#f3efff',
    backgroundTo: '#e6dcff',
    foreground: '#372257',
    glow: '#e8ddff',
  },
  mixed: {
    accent: '#0f4c81',
    accentSoft: '#8ab6d6',
    backgroundFrom: '#eef5fa',
    backgroundTo: '#dae7f0',
    foreground: '#173042',
    glow: '#d8e9f5',
  },
}

export function buildPlacePlaceholderImage(category: PointCategory) {
  const palette = placePalettes[category]
  return buildIllustrationDataUrl(palette, 1200, 720)
}

function buildIllustrationDataUrl(
  palette: IllustrationPalette,
  width: number,
  height: number,
) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.backgroundFrom}"/>
          <stop offset="100%" stop-color="${palette.backgroundTo}"/>
        </linearGradient>
        <linearGradient id="wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.accentSoft}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="44" fill="url(#bg)"/>
      <circle cx="${width * 0.13}" cy="${height * 0.17}" r="${height * 0.16}" fill="${palette.glow}"/>
      <circle cx="${width * 0.82}" cy="${height * 0.14}" r="${height * 0.09}" fill="${palette.accentSoft}" fill-opacity="0.42"/>
      <path d="M0 ${height * 0.66} C ${width * 0.14} ${height * 0.5}, ${width * 0.3} ${height * 0.82}, ${width * 0.48} ${height * 0.66} C ${width * 0.62} ${height * 0.54}, ${width * 0.75} ${height * 0.88}, ${width} ${height * 0.61} V ${height} H 0 Z" fill="url(#wave)"/>
      <path d="M${width * 0.08} ${height * 0.56} C ${width * 0.22} ${height * 0.46}, ${width * 0.34} ${height * 0.62}, ${width * 0.46} ${height * 0.48} S ${width * 0.72} ${height * 0.46}, ${width * 0.92} ${height * 0.32}" stroke="${palette.foreground}" stroke-opacity="0.32" stroke-width="14" stroke-linecap="round"/>
      <path d="M${width * 0.1} ${height * 0.78} H${width * 0.9}" stroke="${palette.foreground}" stroke-opacity="0.12" stroke-width="12" stroke-linecap="round"/>
      <path d="M${width * 0.18} ${height * 0.24} C ${width * 0.34} ${height * 0.1}, ${width * 0.48} ${height * 0.28}, ${width * 0.62} ${height * 0.17} S ${width * 0.86} ${height * 0.18}, ${width * 0.94} ${height * 0.08}" stroke="${palette.accent}" stroke-opacity="0.16" stroke-width="10" stroke-linecap="round"/>
      <path d="M${width * 0.16} ${height * 0.86} C ${width * 0.36} ${height * 0.78}, ${width * 0.58} ${height * 0.92}, ${width * 0.84} ${height * 0.76}" stroke="${palette.backgroundFrom}" stroke-opacity="0.28" stroke-width="12" stroke-linecap="round"/>
      <rect x="${width * 0.14}" y="${height * 0.36}" width="${width * 0.12}" height="${height * 0.31}" rx="28" fill="${palette.foreground}" fill-opacity="0.8"/>
      <rect x="${width * 0.36}" y="${height * 0.39}" width="${width * 0.2}" height="${height * 0.26}" rx="18" fill="${palette.accent}" fill-opacity="0.82"/>
      <path d="M${width * 0.64} ${height * 0.65} V${height * 0.33} L${width * 0.76} ${height * 0.16} L${width * 0.88} ${height * 0.33} V${height * 0.65} Z" fill="${palette.accentSoft}" fill-opacity="0.95"/>
      <g fill="${palette.backgroundFrom}" fill-opacity="0.92">
        <rect x="${width * 0.4}" y="${height * 0.45}" width="${width * 0.045}" height="${height * 0.055}" rx="8"/>
        <rect x="${width * 0.49}" y="${height * 0.45}" width="${width * 0.045}" height="${height * 0.055}" rx="8"/>
        <rect x="${width * 0.4}" y="${height * 0.55}" width="${width * 0.045}" height="${height * 0.055}" rx="8"/>
        <rect x="${width * 0.49}" y="${height * 0.55}" width="${width * 0.045}" height="${height * 0.055}" rx="8"/>
      </g>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

// ── Route fallback illustrations ─────────────────────────────────────────────
// Routes get their own family of abstract covers — distinct from the place
// illustration above. There are six designs; an excursion picks one by its id
// (so the same route is always rendered the same way) and is tinted with the
// palette of its theme. Each design is deliberately abstract and "intriguing"
// rather than literal.

const ROUTE_W = 1400
const ROUTE_H = 840

function routeBackdrop(p: IllustrationPalette): string {
  return (
    `<defs><linearGradient id="rbg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${p.backgroundFrom}"/>` +
    `<stop offset="1" stop-color="${p.backgroundTo}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${ROUTE_W}" height="${ROUTE_H}" rx="44" fill="url(#rbg)"/>`
  )
}

// 0 — winding trail with stop nodes
function routeWindingTrail(p: IllustrationPalette): string {
  const trail = 'M150 702 C 384 540 472 742 704 600 C 904 478 986 360 1284 282'
  return (
    routeBackdrop(p) +
    `<circle cx="240" cy="180" r="184" fill="${p.glow}" opacity="0.6"/>` +
    `<circle cx="1212" cy="690" r="208" fill="${p.glow}" opacity="0.5"/>` +
    `<circle cx="1184" cy="150" r="72" fill="${p.accentSoft}" opacity="0.45"/>` +
    `<path d="${trail}" fill="none" stroke="${p.accent}" stroke-opacity="0.16" stroke-width="56" stroke-linecap="round"/>` +
    `<path d="${trail}" fill="none" stroke="${p.accent}" stroke-width="20" stroke-linecap="round" stroke-dasharray="3 44"/>` +
    `<circle cx="150" cy="702" r="40" fill="${p.accent}"/><circle cx="150" cy="702" r="17" fill="${p.backgroundFrom}"/>` +
    `<circle cx="704" cy="600" r="32" fill="${p.accent}" opacity="0.92"/><circle cx="704" cy="600" r="13" fill="${p.backgroundFrom}"/>` +
    `<circle cx="1284" cy="282" r="44" fill="${p.accent}"/><circle cx="1284" cy="282" r="19" fill="${p.backgroundFrom}"/>`
  )
}

// 1 — layered hills with a rising sun
function routeLayeredHills(p: IllustrationPalette): string {
  return (
    routeBackdrop(p) +
    `<circle cx="1052" cy="262" r="206" fill="${p.glow}" opacity="0.5"/>` +
    `<circle cx="1052" cy="262" r="118" fill="${p.accentSoft}" opacity="0.72"/>` +
    `<path d="M0 532 Q 352 392 724 516 T 1400 470 V840 H0 Z" fill="${p.accentSoft}" opacity="0.5"/>` +
    `<path d="M0 648 Q 388 506 784 630 T 1400 582 V840 H0 Z" fill="${p.accent}" opacity="0.58"/>` +
    `<path d="M0 748 Q 360 662 742 732 T 1400 702 V840 H0 Z" fill="${p.foreground}" opacity="0.78"/>` +
    `<path d="M250 248 q 26 -26 52 0" stroke="${p.foreground}" stroke-opacity="0.3" stroke-width="7" fill="none" stroke-linecap="round"/>` +
    `<path d="M338 206 q 26 -26 52 0" stroke="${p.foreground}" stroke-opacity="0.24" stroke-width="7" fill="none" stroke-linecap="round"/>`
  )
}

// 2 — compass rose / radial route star
function routeCompassRose(p: IllustrationPalette): string {
  const rays = [
    [830, 430, 1030, 430],
    [792, 522, 933, 663],
    [700, 560, 700, 760],
    [608, 522, 467, 663],
    [570, 430, 370, 430],
    [608, 338, 467, 197],
    [700, 300, 700, 100],
    [792, 338, 933, 197],
  ]
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    .join('')
  return (
    routeBackdrop(p) +
    `<circle cx="240" cy="190" r="120" fill="${p.glow}" opacity="0.55"/>` +
    `<circle cx="1180" cy="660" r="150" fill="${p.glow}" opacity="0.5"/>` +
    `<g fill="none" stroke="${p.accent}" stroke-opacity="0.14">` +
    `<circle cx="700" cy="430" r="300" stroke-width="6"/>` +
    `<circle cx="700" cy="430" r="208" stroke-width="6"/>` +
    `<circle cx="700" cy="430" r="118" stroke-width="6"/></g>` +
    `<g stroke="${p.accentSoft}" stroke-width="13" stroke-linecap="round" stroke-opacity="0.6">${rays}</g>` +
    `<circle cx="700" cy="430" r="60" fill="${p.accent}"/>` +
    `<circle cx="700" cy="430" r="26" fill="${p.backgroundFrom}"/>`
  )
}

// 3 — flowing river ribbons
function routeRibbons(p: IllustrationPalette): string {
  return (
    routeBackdrop(p) +
    `<circle cx="1170" cy="176" r="158" fill="${p.glow}" opacity="0.55"/>` +
    `<circle cx="220" cy="690" r="180" fill="${p.glow}" opacity="0.45"/>` +
    `<path d="M-60 278 C 320 158 624 402 1460 222" fill="none" stroke="${p.accentSoft}" stroke-width="78" stroke-linecap="round" opacity="0.5"/>` +
    `<path d="M-60 470 C 360 360 704 622 1460 420" fill="none" stroke="${p.accent}" stroke-width="98" stroke-linecap="round" opacity="0.6"/>` +
    `<path d="M-60 652 C 320 560 684 784 1460 602" fill="none" stroke="${p.foreground}" stroke-width="56" stroke-linecap="round" opacity="0.32"/>` +
    `<path d="M-60 762 C 384 692 724 862 1460 722" fill="none" stroke="${p.accentSoft}" stroke-width="38" stroke-linecap="round" opacity="0.42"/>`
  )
}

// 4 — abstract city skyline
function routeSkyline(p: IllustrationPalette): string {
  return (
    routeBackdrop(p) +
    `<circle cx="1132" cy="206" r="158" fill="${p.glow}" opacity="0.42"/>` +
    `<circle cx="1132" cy="206" r="96" fill="${p.accentSoft}" opacity="0.6"/>` +
    `<rect x="0" y="648" width="1400" height="192" fill="${p.foreground}" opacity="0.1"/>` +
    `<rect x="168" y="404" width="150" height="248" rx="22" fill="${p.accent}" opacity="0.85"/>` +
    `<rect x="350" y="320" width="182" height="332" rx="24" fill="${p.foreground}" opacity="0.8"/>` +
    `<rect x="566" y="452" width="140" height="200" rx="20" fill="${p.accentSoft}" opacity="0.9"/>` +
    `<rect x="740" y="270" width="172" height="382" rx="26" fill="${p.accent}" opacity="0.78"/>` +
    `<rect x="946" y="420" width="150" height="232" rx="22" fill="${p.foreground}" opacity="0.7"/>` +
    `<rect x="1128" y="500" width="128" height="152" rx="18" fill="${p.accentSoft}" opacity="0.85"/>` +
    `<g fill="${p.backgroundFrom}" opacity="0.85">` +
    `<rect x="392" y="368" width="28" height="34" rx="7"/>` +
    `<rect x="446" y="368" width="28" height="34" rx="7"/>` +
    `<rect x="392" y="430" width="28" height="34" rx="7"/>` +
    `<rect x="446" y="430" width="28" height="34" rx="7"/>` +
    `<rect x="784" y="320" width="28" height="34" rx="7"/>` +
    `<rect x="840" y="320" width="28" height="34" rx="7"/>` +
    `<rect x="784" y="382" width="28" height="34" rx="7"/>` +
    `<rect x="840" y="382" width="28" height="34" rx="7"/></g>`
  )
}

// 5 — constellation of connected stops
function routeConstellation(p: IllustrationPalette): string {
  const nodes: Array<[number, number, number, number]> = [
    [224, 566, 46, 22],
    [470, 360, 40, 19],
    [704, 566, 44, 21],
    [922, 300, 40, 19],
    [1132, 520, 42, 20],
    [1268, 300, 46, 23],
  ]
  const dots = nodes
    .map(
      ([cx, cy, halo, core]) =>
        `<circle cx="${cx}" cy="${cy}" r="${halo}" fill="${p.accentSoft}" opacity="0.32"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${core}" fill="${p.accent}"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${Math.round(core * 0.38)}" fill="${p.backgroundFrom}"/>`,
    )
    .join('')
  return (
    routeBackdrop(p) +
    `<circle cx="262" cy="638" r="178" fill="${p.glow}" opacity="0.48"/>` +
    `<circle cx="1148" cy="222" r="158" fill="${p.glow}" opacity="0.48"/>` +
    `<path d="M224 566 L470 360 L704 566 L922 300 L1132 520 L1268 300" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.5" stroke-dasharray="2 24"/>` +
    `<g>${dots}</g>`
  )
}

const routeDesigns: Array<(p: IllustrationPalette) => string> = [
  routeWindingTrail,
  routeLayeredHills,
  routeCompassRose,
  routeRibbons,
  routeSkyline,
  routeConstellation,
]

const routeThemeOrder: ExcursionTheme[] = ['walk', 'food', 'nature', 'fun', 'mixed']

/**
 * Abstract fallback cover for a route. `seed` (typically the excursion id)
 * picks one of six designs deterministically; `theme` chooses the palette.
 * Without a seed the design is derived from the theme so each theme still
 * looks distinct.
 */
export function buildRoutePlaceholderImage(theme: ExcursionTheme, seed?: number) {
  const palette = routePalettes[theme]
  const designIndex =
    seed != null && Number.isFinite(seed)
      ? Math.abs(Math.trunc(seed)) % routeDesigns.length
      : (routeThemeOrder.indexOf(theme) + 1) % routeDesigns.length
  const inner = routeDesigns[designIndex](palette)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ROUTE_W} ${ROUTE_H}" ` +
    `width="${ROUTE_W}" height="${ROUTE_H}" fill="none">${inner}</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
