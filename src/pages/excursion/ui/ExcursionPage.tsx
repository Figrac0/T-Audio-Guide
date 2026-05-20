import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  getAudioGuideDuration,
  getAudioGuideLanguage,
  hasAudioGuideAvailable,
} from '@/entities/excursion/lib/audio-guide'
import {
  completeLastRoute,
  startLastRoute,
  updateLastRouteProgress,
} from '@/entities/excursion/lib/last-routes'
import { useRouteBySlug } from '@/entities/excursion/model/useRouteBySlug'
import {
  toBackendPointId,
  usePointDetailsMap,
} from '@/entities/excursion/model/usePointDetailsMap'
import type { Excursion, GeoPoint, PointCategory, RouteStop } from '@/entities/excursion/model/types'
import { formatMeters, getDistanceMetersBetween } from '@/features/route-map/lib/route-geometry'
import { useUserGeolocation } from '@/features/route-map/model/useUserGeolocation'
import { useAudioGuide } from '@/pages/excursion/model/useAudioGuide'
import { RouteMap } from '@/features/route-map/ui/RouteMap'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { excursionsService } from '@/shared/api/excursionsService'
import { appRoutes } from '@/shared/config/routes'
import { getStoredDiscoveryContext } from '@/shared/lib/discovery-context'
import { useManualPosition } from '@/shared/lib/ManualPositionContext'
import { buildRoutePlaceholderImage } from '@/shared/lib/placeholder-images'
import {
  formatDifficulty,
  formatDistance,
  formatDuration,
  formatLocaleLabel,
  formatStopCount,
  formatTheme,
  getPointCategoryLabel,
} from '@/shared/lib/format'
import { ResilientImage } from '@/shared/ui/ResilientImage'
import './ExcursionPage.css'

// ── Sheet constants ──────────────────────────────────────────────────────────

const CLOSED_HEIGHT = 52
const DRAG_MIN = 10

type SheetState = 'closed' | 'peek' | 'full'

function getSnapTranslate(state: SheetState, sheetHeight: number, peekHeight: number): number {
  if (state === 'full') return DRAG_MIN
  if (state === 'peek') return Math.max(DRAG_MIN, sheetHeight - peekHeight)
  return Math.max(DRAG_MIN, sheetHeight - CLOSED_HEIGHT)
}

// Returns the sheet's current VISUAL translateY (works mid-animation via composited style).
function getSheetTranslateY(el: HTMLElement): number {
  const t = window.getComputedStyle(el).transform
  if (!t || t === 'none') return 0
  const m = t.match(/matrix\(([^)]+)\)/)
  if (!m) return 0
  return parseFloat(m[1].split(',')[5] ?? '0')
}

// Sheet easing — same curve as the Home and Excursions pages so the open/close
// motion feels identical across the app (even ease-out, no abrupt rush).
const SHEET_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

// Park sheet at its current visual position (stopping any in-progress animation),
// force a reflow so the browser commits that state, then start a fresh animation.
// This prevents jumps when a snap is triggered mid-animation or after a fling.
function snapSheet(sheet: HTMLElement, toY: number, durationMs: number): void {
  const fromY = getSheetTranslateY(sheet)
  sheet.style.willChange = 'transform'
  sheet.style.transition = 'none'
  sheet.style.transform = `translateY(${fromY}px)`
  void sheet.offsetHeight // commit park position before starting new animation
  sheet.style.transition = `transform ${durationMs}ms ${SHEET_EASING}`
  sheet.style.transform = `translateY(${toY}px)`
  const clear = () => { sheet.style.willChange = '' }
  sheet.addEventListener('transitionend', clear, { once: true })
  setTimeout(clear, durationMs + 100)
}

type Phase = 'info' | 'navigation' | 'complete'

// ── Root ─────────────────────────────────────────────────────────────────────

export function ExcursionPage() {
  const { slug } = useParams<{ slug: string }>()
  const storedContext = useMemo(() => getStoredDiscoveryContext(), [])
  const { isRouteSaved, personalRoutes, savedRoutes, shareRoute, toggleSavedRoute } = useUserRoutes()
  const { error: geolocationError, requestLocation, userPosition } = useUserGeolocation()

  const { error, isLoading, route } = useRouteBySlug({
    activePointCategory: storedContext.activePointCategory,
    center: storedContext.center,
    enabled: Boolean(slug),
    locale: storedContext.locale,
    radiusMeters: storedContext.radiusMeters,
    slug: slug ?? '',
  })

  const locallyStoredRoute =
    [...personalRoutes, ...savedRoutes].find((r) => r.slug === slug) ?? null
  const excursion = (route as Excursion | null) ?? locallyStoredRoute

  // Excursion-detail points are PointShortItem — no full description, no
  // photos. Backfill both from /points/{id} so the walkthrough shows the
  // full description and real uploaded images.
  const stopIds = useMemo(
    () => excursion?.stops.map((stop) => stop.id) ?? [],
    [excursion],
  )
  const stopDetailsMap = usePointDetailsMap(stopIds)
  const enrichedExcursion = useMemo<Excursion | null>(() => {
    if (!excursion) return null
    if (stopDetailsMap.size === 0) return excursion
    return {
      ...excursion,
      stops: excursion.stops.map((stop) => {
        const data = stopDetailsMap.get(toBackendPointId(stop.id))
        if (!data) return stop
        return {
          ...stop,
          description: data.description || stop.description,
          shortDescription: data.shortDescription || stop.shortDescription,
          imageUrl: data.imageUrl || stop.imageUrl,
          scheduleLabel: stop.scheduleLabel || data.workingHours,
          // Excursion-detail points carry no media — backfill the audio guide
          // from /points/{id} so uploaded audio is playable during the walk.
          audio: data.audioUrl
            ? {
                ...stop.audio,
                hasAudioGuide: true,
                audioGuideUrl: data.audioUrl,
                url: data.audioUrl,
                transcriptPreview:
                  data.audioTranscript ?? stop.audio.transcriptPreview,
              }
            : stop.audio,
        }
      }),
    }
  }, [excursion, stopDetailsMap])

  const [phase, setPhase] = useState<Phase>('info')
  const [currentStopIndex, setCurrentStopIndex] = useState(0)

  if (isLoading && !locallyStoredRoute) {
    return (
      <section className="status-card">
        <h1 className="status-card__title">Открываем маршрут</h1>
        <p className="status-card__text">Загружаем точки, карту и сценарий прогулки.</p>
      </section>
    )
  }

  if (error && !locallyStoredRoute) {
    return (
      <section className="status-card">
        <h1 className="status-card__title">Не удалось открыть маршрут</h1>
        <p className="status-card__text">{error}</p>
      </section>
    )
  }

  if (!excursion) {
    return (
      <section className="not-found">
        <p className="eyebrow">Маршрут</p>
        <h1 className="not-found__title">Маршрут не найден</h1>
        <p className="not-found__description">Откройте другой маршрут из каталога.</p>
        <Link className="button button--secondary" to={appRoutes.excursions}>
          Вернуться к каталогу
        </Link>
      </section>
    )
  }

  const displayExcursion = enrichedExcursion ?? excursion
  const isSaved = isRouteSaved(displayExcursion.slug)

  if (phase === 'complete') {
    return (
      <>
        {/* Fixed full-screen art behind nav + card */}
        <div aria-hidden="true" className="ep-complete__global-bg">
          <svg fill="none" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <circle cx="80"  cy="100" r="90"  fill="rgba(31,138,112,0.07)" stroke="rgba(31,138,112,0.13)" strokeWidth="1.5" />
            <circle cx="220" cy="560" r="70"  fill="rgba(246,191,22,0.06)" stroke="rgba(246,191,22,0.14)" strokeWidth="1.5" />
            <circle cx="1120" cy="80"  r="80"  fill="rgba(246,191,22,0.07)" stroke="rgba(246,191,22,0.15)" strokeWidth="1.5" />
            <circle cx="980"  cy="660" r="95"  fill="rgba(31,138,112,0.06)" stroke="rgba(31,138,112,0.12)" strokeWidth="1" />
            <circle cx="600"  cy="60"  r="55"  fill="rgba(31,138,112,0.05)" stroke="rgba(31,138,112,0.10)" strokeWidth="1" />
            <circle cx="600"  cy="740" r="60"  fill="rgba(246,191,22,0.05)" stroke="rgba(246,191,22,0.10)" strokeWidth="1" />
            <circle cx="360"  cy="150" r="40"  fill="rgba(246,191,22,0.05)" stroke="rgba(246,191,22,0.12)" strokeWidth="1" />
            <circle cx="840"  cy="100" r="50"  fill="rgba(31,138,112,0.05)" stroke="rgba(31,138,112,0.11)" strokeWidth="1" />
            <circle cx="150"  cy="700" r="45"  fill="rgba(31,138,112,0.05)" stroke="rgba(31,138,112,0.10)" strokeWidth="1" />
            <circle cx="1060" cy="420" r="65"  fill="rgba(246,191,22,0.05)" stroke="rgba(246,191,22,0.11)" strokeWidth="1" />
            <circle cx="480"  cy="680" r="28"  fill="rgba(31,138,112,0.06)" stroke="rgba(31,138,112,0.13)" strokeWidth="1" />
            <circle cx="740"  cy="720" r="22"  fill="rgba(246,191,22,0.07)" stroke="rgba(246,191,22,0.15)" strokeWidth="1" />
            <circle cx="310"  cy="400" r="24"  fill="rgba(246,191,22,0.05)" stroke="rgba(246,191,22,0.12)" strokeWidth="1" />
            <circle cx="890"  cy="380" r="20"  fill="rgba(31,138,112,0.05)" stroke="rgba(31,138,112,0.11)" strokeWidth="1" />
            <path d="M42 200 L46 188 L50 200 L62 204 L50 208 L46 220 L42 208 L30 204 Z" fill="rgba(246,191,22,0.36)" />
            <path d="M140 430 L143 422 L146 430 L154 433 L146 436 L143 444 L140 436 L132 433 Z" fill="rgba(31,138,112,0.28)" />
            <path d="M60 620 L63 612 L66 620 L74 623 L66 626 L63 634 L60 626 L52 623 Z" fill="rgba(246,191,22,0.32)" />
            <path d="M190 280 L193 273 L196 280 L203 283 L196 286 L193 293 L190 286 L183 283 Z" fill="rgba(31,138,112,0.26)" />
            <path d="M1158 200 L1162 188 L1166 200 L1178 204 L1166 208 L1162 220 L1158 208 L1146 204 Z" fill="rgba(31,138,112,0.34)" />
            <path d="M1050 430 L1053 422 L1056 430 L1064 433 L1056 436 L1053 444 L1050 436 L1042 433 Z" fill="rgba(246,191,22,0.3)" />
            <path d="M1140 620 L1143 612 L1146 620 L1154 623 L1146 626 L1143 634 L1140 626 L1132 623 Z" fill="rgba(31,138,112,0.26)" />
            <path d="M1010 280 L1013 273 L1016 280 L1023 283 L1016 286 L1013 293 L1010 286 L1003 283 Z" fill="rgba(246,191,22,0.32)" />
            <path d="M560 30 L563 22 L566 30 L574 33 L566 36 L563 44 L560 36 L552 33 Z" fill="rgba(246,191,22,0.3)" />
            <path d="M660 760 L663 752 L666 760 L674 763 L666 766 L663 774 L660 766 L652 763 Z" fill="rgba(31,138,112,0.26)" />
            <path d="M400 740 L403 733 L406 740 L413 743 L406 746 L403 753 L400 746 L393 743 Z" fill="rgba(246,191,22,0.28)" />
            <path d="M800 30 L803 22 L806 30 L814 33 L806 36 L803 44 L800 36 L792 33 Z" fill="rgba(31,138,112,0.3)" />
            <circle cx="30"   cy="340" r="4"   fill="rgba(31,138,112,0.28)" />
            <circle cx="108"  cy="180" r="3"   fill="rgba(246,191,22,0.4)" />
            <circle cx="185"  cy="500" r="3.5" fill="rgba(31,138,112,0.24)" />
            <circle cx="250"  cy="640" r="2.5" fill="rgba(246,191,22,0.32)" />
            <circle cx="320"  cy="740" r="3"   fill="rgba(31,138,112,0.22)" />
            <circle cx="440"  cy="120" r="3.5" fill="rgba(246,191,22,0.38)" />
            <circle cx="520"  cy="760" r="3"   fill="rgba(31,138,112,0.24)" />
            <circle cx="600"  cy="180" r="2.5" fill="rgba(246,191,22,0.34)" />
            <circle cx="680"  cy="640" r="4"   fill="rgba(31,138,112,0.26)" />
            <circle cx="760"  cy="100" r="3"   fill="rgba(246,191,22,0.36)" />
            <circle cx="840"  cy="740" r="3.5" fill="rgba(31,138,112,0.22)" />
            <circle cx="920"  cy="160" r="2.5" fill="rgba(246,191,22,0.32)" />
            <circle cx="1000" cy="560" r="3"   fill="rgba(31,138,112,0.26)" />
            <circle cx="1080" cy="200" r="4"   fill="rgba(246,191,22,0.38)" />
            <circle cx="1160" cy="500" r="3"   fill="rgba(31,138,112,0.24)" />
            <circle cx="1180" cy="340" r="2.5" fill="rgba(246,191,22,0.3)" />
            <circle cx="270"  cy="200" r="2"   fill="rgba(31,138,112,0.3)" />
            <circle cx="460"  cy="480" r="2"   fill="rgba(246,191,22,0.28)" />
            <circle cx="740"  cy="440" r="2"   fill="rgba(31,138,112,0.22)" />
            <circle cx="960"  cy="740" r="2.5" fill="rgba(246,191,22,0.3)" />
            <path d="M0 220 Q 150 200 300 225 Q 450 250 600 220 Q 750 190 900 218 Q 1050 246 1200 218" fill="none" stroke="rgba(31,138,112,0.12)" strokeLinecap="round" strokeWidth="2" />
            <path d="M0 580 Q 160 555 320 582 Q 480 609 640 578 Q 800 547 960 576 Q 1120 605 1200 576" fill="none" stroke="rgba(246,191,22,0.14)" strokeLinecap="round" strokeWidth="1.5" />
            <path d="M0 400 Q 200 380 400 405 Q 600 430 800 398 Q 1000 366 1200 398" fill="none" stroke="rgba(31,138,112,0.08)" strokeLinecap="round" strokeWidth="1.5" />
            <path d="M130 760 L138 748 L146 760 L138 772 Z" fill="none" stroke="rgba(31,138,112,0.2)" strokeWidth="1.5" />
            <path d="M490 40 L498 28 L506 40 L498 52 Z" fill="none" stroke="rgba(246,191,22,0.22)" strokeWidth="1.5" />
            <path d="M700 760 L708 748 L716 760 L708 772 Z" fill="none" stroke="rgba(31,138,112,0.2)" strokeWidth="1.5" />
            <path d="M1070 760 L1078 748 L1086 760 L1078 772 Z" fill="none" stroke="rgba(246,191,22,0.2)" strokeWidth="1.5" />
            <path d="M1070 40 L1078 28 L1086 40 L1078 52 Z" fill="none" stroke="rgba(31,138,112,0.22)" strokeWidth="1.5" />
            <path d="M200 40 L208 28 L216 40 L208 52 Z" fill="none" stroke="rgba(246,191,22,0.2)" strokeWidth="1.5" />
          </svg>
        </div>
        <CompleteScreen
          excursion={displayExcursion}
          excursionId={displayExcursion.id}
          isSaved={isSaved}
          onSave={() => toggleSavedRoute(displayExcursion)}
          onShare={() => void shareRoute(displayExcursion)}
        />
      </>
    )
  }

  if (phase === 'navigation') {
    return (
      <NavigationPhase
        currentStopIndex={currentStopIndex}
        excursion={displayExcursion}
        onComplete={() => setPhase('complete')}
        onStopChange={setCurrentStopIndex}
        requestLocation={requestLocation}
        userPosition={userPosition}
      />
    )
  }

  return (
    <InfoPhase
      excursion={displayExcursion}
      geolocationError={geolocationError}
      isSaved={isSaved}
      onSave={() => toggleSavedRoute(displayExcursion)}
      onShare={() => void shareRoute(displayExcursion)}
      onStart={() => {
        startLastRoute(displayExcursion)
        setCurrentStopIndex(0)
        setPhase('navigation')
      }}
    />
  )
}

// ── Stop category fallback ───────────────────────────────────────────────────

function getStopFallbackStyle(category: PointCategory): React.CSSProperties {
  const map: Record<PointCategory, React.CSSProperties> = {
    museum: {
      background:
        'radial-gradient(circle at 72% 28%, rgba(196,181,232,0.54) 0%, transparent 44%), radial-gradient(circle at 22% 70%, rgba(100,72,160,0.42) 0%, transparent 38%), linear-gradient(135deg, #2c1d54 0%, #5a3c96 45%, #9a78d4 80%, #c8b8f0 100%)',
    },
    food: {
      background:
        'radial-gradient(circle at 74% 22%, rgba(240,195,120,0.54) 0%, transparent 44%), radial-gradient(circle at 22% 72%, rgba(160,72,24,0.42) 0%, transparent 38%), linear-gradient(135deg, #5c2408 0%, #a03c14 45%, #d46c38 80%, #f0b870 100%)',
    },
    park: {
      background:
        'radial-gradient(circle at 66% 22%, rgba(108,184,112,0.54) 0%, transparent 44%), radial-gradient(circle at 22% 74%, rgba(20,88,52,0.42) 0%, transparent 40%), linear-gradient(135deg, #0b2e1c 0%, #165c38 45%, #2e9058 80%, #72bc7a 100%)',
    },
    entertainment: {
      background:
        'radial-gradient(circle at 72% 24%, rgba(228,130,220,0.54) 0%, transparent 42%), radial-gradient(circle at 24% 72%, rgba(120,28,168,0.42) 0%, transparent 38%), linear-gradient(135deg, #420960 0%, #8024b8 45%, #c050e0 80%, #e896d8 100%)',
    },
    landmark: {
      background:
        'radial-gradient(circle at 70% 22%, rgba(110,196,220,0.54) 0%, transparent 44%), radial-gradient(circle at 24% 72%, rgba(28,88,148,0.42) 0%, transparent 40%), linear-gradient(135deg, #112840 0%, #1e5480 45%, #3a8cb8 80%, #6ec4dc 100%)',
    },
  }
  return map[category] ?? { background: 'linear-gradient(135deg, #2a3a5a 0%, #4a6a8a 100%)' }
}

// ── Phase 1 — Info screen ────────────────────────────────────────────────────

interface InfoPhaseProps {
  excursion: Excursion
  geolocationError: string | null
  isSaved: boolean
  onSave: () => void
  onShare: () => void
  onStart: () => void
}

function InfoPhase({ excursion, geolocationError, isSaved, onSave, onShare, onStart }: InfoPhaseProps) {
  const routePlaceholder = useMemo(
    () => buildRoutePlaceholderImage(excursion.theme, excursion.id),
    [excursion.theme, excursion.id],
  )
  // Split the full description into paragraphs for the "О маршруте" panel.
  const aboutParagraphs = excursion.description
    ? excursion.description
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : []

  return (
    <div className="ep-info">

      {/* ── Back ── */}
      <Link className="ep-info__back" to={appRoutes.excursions}>
        <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
          <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
        К маршрутам
      </Link>

      {/* ── Hero ── */}
      <div className="ep-info__hero">

        {/* Title/tagline first in DOM → appears above image on mobile */}
        <div className="ep-info__hero-body">
          <div className="ep-info__hero-top">
            <h1 className="ep-info__title">{excursion.title}</h1>
            <span className="ep-info__difficulty">Сложность: {formatDifficulty(excursion.difficulty)}</span>
          </div>
          <p className="ep-info__tagline">{excursion.tagline}</p>
        </div>

        {/* Cover image */}
        <div className="ep-info__cover-frame" data-theme={excursion.theme}>
          <div className="ep-info__cover">
            <ResilientImage
              alt={excursion.title}
              fallbackSrcs={[routePlaceholder]}
              loading="lazy"
              placeholderSrc={routePlaceholder}
              referrerPolicy="no-referrer"
              src={excursion.coverImageUrl}
            />
            <div className="ep-info__cover-theme">{formatTheme(excursion.theme)}</div>
          </div>
        </div>

        <div className="ep-info__stats" aria-label="Ключевые параметры маршрута">
          <div className="ep-info__stat">
            <span className="ep-info__stat-icon" aria-hidden="true">⏱</span>
            <span className="ep-info__stat-value">{formatDuration(excursion.durationMinutes)}</span>
            <span className="ep-info__stat-label">Время</span>
          </div>
          <div className="ep-info__stat">
            <span className="ep-info__stat-icon" aria-hidden="true">📍</span>
            <span className="ep-info__stat-value">{formatStopCount(excursion.stops.length)}</span>
            <span className="ep-info__stat-label">Точки</span>
          </div>
          <div className="ep-info__stat">
            <span className="ep-info__stat-icon" aria-hidden="true">🚶</span>
            <span className="ep-info__stat-value">{formatDistance(excursion.distanceKm)}</span>
            <span className="ep-info__stat-label">Длина</span>
          </div>
          <div className="ep-info__stat">
            <span className="ep-info__stat-icon" aria-hidden="true">👥</span>
            <span className="ep-info__stat-value">{excursion.audienceLabel}</span>
            <span className="ep-info__stat-label">Формат</span>
          </div>
        </div>
        {aboutParagraphs.length > 0 && (
          <section className="ep-info__about" aria-label="Описание маршрута">
            <span className="ep-info__about-label">О маршруте</span>
            {aboutParagraphs.map((paragraph, index) => (
              <p className="ep-info__desc" key={index}>
                {paragraph}
              </p>
            ))}
          </section>
        )}

        {geolocationError ? <p className="ep-info__geo-error">{geolocationError}</p> : null}
      </div>

      {/* ── Stops list ── */}
      <div className="ep-info__stops">
        <div className="ep-info__stops-head">
          <h2 className="ep-info__stops-title">Точки маршрута</h2>
          <span className="ep-info__stops-badge">{excursion.stops.length}</span>
        </div>
        <div className="ep-info__stops-grid">
          {excursion.stops.map((stop, i) => (
            <StopCard index={i} key={stop.id} stop={stop} />
          ))}
        </div>
      </div>

      {/* ── Bottom: save / share ── */}
      <div className="ep-info__bottom">
        <button
          aria-pressed={isSaved}
          className={`button ${isSaved ? 'button--primary' : 'button--secondary'} ep-info__side-btn`}
          onClick={onSave}
          type="button"
        >
          {isSaved ? (
            <>
              <svg aria-hidden="true" fill="currentColor" height="15" viewBox="0 0 24 24" width="15">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Сохранено
            </>
          ) : (
            <>
              <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              Сохранить
            </>
          )}
        </button>
        <button className="button button--ghost ep-info__side-btn" onClick={onShare} type="button">
          <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
            <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
            <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
            <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2" />
          </svg>
          Поделиться
        </button>
      </div>

      {/* ── Sticky CTA ── */}
      <div className="ep-info__cta">
        <button className="ep-info__start-btn" onClick={onStart} type="button">
          Начать маршрут
          <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Stop card ─────────────────────────────────────────────────────────────────

function StopCard({ stop, index }: { stop: RouteStop; index: number }) {
  const hasAudio = hasAudioGuideAvailable(stop.audio)

  return (
    <article className="ep-stop-card">
      <div className="ep-stop-card__cover">
        {stop.imageUrl ? (
          <img alt={stop.title} loading="lazy" referrerPolicy="no-referrer" src={stop.imageUrl} />
        ) : (
          <div
            aria-hidden="true"
            className="ep-stop-card__cover-placeholder"
            style={getStopFallbackStyle(stop.category)}
          />
        )}
        <span aria-label={`Точка ${index + 1}`} className="ep-stop-card__num">{index + 1}</span>
        <span className="ep-stop-card__cat">{getPointCategoryLabel(stop)}</span>
      </div>

      <div className="ep-stop-card__body">
        <h3 className="ep-stop-card__title">{stop.title}</h3>

        {(stop.rating > 0 || stop.expectedVisitMinutes > 0 || stop.scheduleLabel) ? (
          <div className="ep-stop-card__meta">
            {stop.rating > 0 ? (
              <span className="ep-stop-card__rating">★ {stop.rating.toFixed(1)}</span>
            ) : null}
            {stop.expectedVisitMinutes > 0 ? (
              <span className="ep-stop-card__time">~{stop.expectedVisitMinutes} мин</span>
            ) : null}
            {stop.scheduleLabel ? (
              <span className="ep-stop-card__schedule">{stop.scheduleLabel}</span>
            ) : null}
          </div>
        ) : null}

        <p className="ep-stop-card__desc">{stop.description || stop.shortDescription}</p>

        <div className="ep-stop-card__audio">
          <span aria-hidden="true" className="ep-stop-card__audio-icon">🎧</span>
          <span className="ep-stop-card__audio-text">
            {hasAudio
              ? 'Для этой точки доступно аудиосопровождение'
              : 'Сейчас для этой точки доступно только текстовое описание'}
          </span>
        </div>
      </div>
    </article>
  )
}

// ── Phase 2 — Navigation ─────────────────────────────────────────────────────

interface NavigationPhaseProps {
  currentStopIndex: number
  excursion: Excursion
  onComplete: () => void
  onStopChange: (index: number) => void
  requestLocation: () => void
  userPosition: GeoPoint | null | undefined
}

function NavigationPhase({
  currentStopIndex, excursion, onComplete, onStopChange, requestLocation, userPosition,
}: NavigationPhaseProps) {
  const { isOverrideActive, manualPosition, mode: overrideMode, setManualPosition, toggleOverride } = useManualPosition()
  const effectiveUserPosition = isOverrideActive ? manualPosition : userPosition

  const currentStop = excursion.stops[currentStopIndex] ?? excursion.stops[0]
  const isLastStop = currentStopIndex >= excursion.stops.length - 1
  const currentAudio = currentStop.audio
  // Split the description into paragraphs so it reads as structured prose,
  // matching the point-detail panel on the Excursions page.
  const navDescription = currentStop.description || currentStop.shortDescription
  const navDescriptionParagraphs = navDescription
    ? navDescription
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : []

  const [sheetState, setSheetState] = useState<SheetState>('closed')
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)
  const [transcriptHeight, setTranscriptHeight] = useState(0)
  const [prevStopIndex, setPrevStopIndex] = useState(currentStopIndex)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const { isAudioPlaying, isAudioAvailable, toggleAudio, loadedDurationSeconds } = useAudioGuide(currentStop, currentStopIndex)

  if (prevStopIndex !== currentStopIndex) {
    setPrevStopIndex(currentStopIndex)
    setIsTranscriptOpen(false)
    setTranscriptHeight(0)
  }
  const sheetStateRef = useRef<SheetState>('closed')
  const sheetRef = useRef<HTMLDivElement>(null)
  const navRowRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const peekHeightRef = useRef(CLOSED_HEIGHT + 50)
  const skipSnapRef = useRef(false)
  const dragRef = useRef({ active: false, startPointerY: 0, startTranslate: 0, lastPointerY: 0, lastTime: 0, velocity: 0 })

  useEffect(() => {
    document.body.classList.add('app-body--excursion-nav')
    return () => { document.body.classList.remove('app-body--excursion-nav') }
  }, [])

  useEffect(() => { sheetStateRef.current = sheetState }, [sheetState])

  const snapToClosed = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    skipSnapRef.current = true
    setSheetState('closed')
    snapSheet(sheet, sheet.offsetHeight - CLOSED_HEIGHT, 480)
  }, [])

  const snapToPeek = useCallback(() => {
    const sheet = sheetRef.current
    const mapEl = document.querySelector('.ep-nav__map') as HTMLElement | null
    if (!sheet) return
    if (mapEl) mapEl.style.pointerEvents = 'none'
    const peekT = getSnapTranslate('peek', sheet.offsetHeight, peekHeightRef.current)
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    skipSnapRef.current = true
    setSheetState('peek')
    snapSheet(sheet, peekT, 480)
    setTimeout(() => {
      if (mapEl) mapEl.style.pointerEvents = ''
    }, 520)
  }, [])

  useEffect(() => {
    window.addEventListener('app-menu-open', snapToClosed)
    return () => window.removeEventListener('app-menu-open', snapToClosed)
  }, [snapToClosed])

  useEffect(() => {
    if (sheetState !== 'closed') window.dispatchEvent(new CustomEvent('app-sheet-open'))
  }, [sheetState])

  useEffect(() => {
    if (skipSnapRef.current) { skipSnapRef.current = false; return }
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return
    const target = getSnapTranslate(sheetState, sheet.offsetHeight, peekHeightRef.current)
    if (sheetState === 'peek' && bodyRef.current) bodyRef.current.scrollTop = 0
    snapSheet(sheet, target, 480)
  }, [sheetState])

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const applyInitial = () => {
      if (sheet.offsetHeight > 0) {
        sheet.style.transition = 'none'
        sheet.style.transform = `translateY(${sheet.offsetHeight - CLOSED_HEIGHT}px)`
      }
    }
    applyInitial()
    const onResize = () => {
      if (dragRef.current.active) return
      const target = getSnapTranslate(sheetStateRef.current, sheet.offsetHeight, peekHeightRef.current)
      sheet.style.transition = 'none'
      sheet.style.transform = `translateY(${target}px)`
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const el = navRowRef.current
    if (!el) return
    const update = () => {
      const navHeight = el.offsetHeight || 52
      peekHeightRef.current = CLOSED_HEIGHT + Math.max(navHeight, 40)
    }
    // Update after paint to ensure element is rendered
    requestAnimationFrame(() => {
      update()
    })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return
    let reachedTopAt = -1
    const onTouchStart = (e: TouchEvent) => { reachedTopAt = bodyEl.scrollTop === 0 ? e.touches[0].clientY : -1 }
    const onTouchMove = (e: TouchEvent) => {
      if (sheetStateRef.current !== 'full') return
      const y = e.touches[0].clientY
      if (bodyEl.scrollTop === 0 && reachedTopAt < 0) reachedTopAt = y
      if (reachedTopAt < 0 || bodyEl.scrollTop > 0) return
      if (y - reachedTopAt > 52) {
        reachedTopAt = Infinity
        const sheet = sheetRef.current
        if (!sheet) return
        skipSnapRef.current = true
        setSheetState('closed')
        snapSheet(sheet, sheet.offsetHeight - CLOSED_HEIGHT, 480)
      }
    }
    const onTouchEnd = () => { reachedTopAt = -1 }
    bodyEl.addEventListener('touchstart', onTouchStart, { passive: true })
    bodyEl.addEventListener('touchmove', onTouchMove, { passive: true })
    bodyEl.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      bodyEl.removeEventListener('touchstart', onTouchStart)
      bodyEl.removeEventListener('touchmove', onTouchMove)
      bodyEl.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current
    if (!sheet) return
    const mapEl = document.querySelector('.ep-nav__map')
    if (mapEl) (mapEl as HTMLElement).style.pointerEvents = 'none'
    e.currentTarget.setPointerCapture(e.pointerId)
    const currentT = getSheetTranslateY(sheet)
    dragRef.current = { active: true, startPointerY: e.clientY, startTranslate: currentT, lastPointerY: e.clientY, lastTime: Date.now(), velocity: 0 }
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${currentT}px)`
    sheet.style.willChange = 'transform'
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return
    const sheet = sheetRef.current
    if (!sheet) return
    e.preventDefault()
    const raw = dragRef.current.startTranslate + (e.clientY - dragRef.current.startPointerY)
    const newT = Math.min(sheet.offsetHeight - CLOSED_HEIGHT, Math.max(DRAG_MIN, raw))
    const now = Date.now()
    dragRef.current.velocity = ((e.clientY - dragRef.current.lastPointerY) / Math.max(1, now - dragRef.current.lastTime)) * 16
    dragRef.current.lastPointerY = e.clientY
    dragRef.current.lastTime = now
    sheet.style.transform = `translateY(${newT}px)`
  }

  function handleDragEnd() {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const sheet = sheetRef.current
    if (!sheet) return
    const mapEl = document.querySelector('.ep-nav__map')
    if (mapEl) (mapEl as HTMLElement).style.pointerEvents = ''
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const currentT = match ? parseFloat(match[1]) : 0
    const sheetHeight = sheet.offsetHeight
    const velocity = dragRef.current.velocity
    const peekT = getSnapTranslate('peek', sheetHeight, peekHeightRef.current)
    const snaps: [SheetState, number][] = [
      ['full', DRAG_MIN],
      ['peek', peekT],
      ['closed', sheetHeight - CLOSED_HEIGHT],
    ]
    let bestIdx = 0, bestDist = Infinity
    for (let i = 0; i < snaps.length; i++) {
      const d = Math.abs(currentT - snaps[i][1])
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    // Improve snap logic: when swiping from full, prefer peek if moving slowly
    if (sheetStateRef.current === 'full') {
      const peekDist = Math.abs(currentT - peekT)
      const closedDist = Math.abs(currentT - snaps[2][1])
      if (velocity < 8 && peekDist < closedDist * 0.6) bestIdx = 1
      else if (velocity >= 8 && velocity < -5) bestIdx = 1
      else if (velocity >= 8) bestIdx = 2
    } else if (velocity > 5 && bestIdx < snaps.length - 1) {
      bestIdx++
    } else if (velocity < -5 && bestIdx > 0) {
      bestIdx--
    }
    const [nextState, targetT] = snaps[bestIdx]
    skipSnapRef.current = true
    setSheetState(nextState)
    if (nextState === 'peek' && bodyRef.current) bodyRef.current.scrollTop = 0

    const absV = Math.abs(velocity)
    // Higher fling velocities use shorter durations so the sheet feels
    // responsive to flicks; slow drags get the full smooth animation.
    const durationMs = absV > 12 ? 300 : absV > 6 ? 400 : 480
    void sheet.offsetHeight
    sheet.style.transition = `transform ${durationMs}ms ${SHEET_EASING}`
    sheet.style.transform = `translateY(${targetT}px)`

    const clear = () => { sheet.style.willChange = '' }
    sheet.addEventListener('transitionend', clear, { once: true })
    setTimeout(clear, 580)
  }


  // Disable map pointer events when header menu opens (prevents jittering during layout shift)
  useEffect(() => {
    const handleMenuOpen = () => {
      const mapEl = document.querySelector('.ep-nav__map') as HTMLElement | null
      if (mapEl) mapEl.style.pointerEvents = 'none'
      setTimeout(() => {
        if (mapEl) mapEl.style.pointerEvents = ''
      }, 350)
    }
    window.addEventListener('app-menu-open', handleMenuOpen)
    return () => window.removeEventListener('app-menu-open', handleMenuOpen)
  }, [])


  const handlePrevStop = () => { onStopChange(Math.max(0, currentStopIndex - 1)); snapToPeek() }
  const handleNextStop = () => {
    if (isLastStop) {
      completeLastRoute(excursion)
      onComplete()
      return
    }

    updateLastRouteProgress(excursion, currentStopIndex + 1)
    onStopChange(currentStopIndex + 1)
    snapToPeek()
  }

  const distanceToStop = useMemo(
    () => effectiveUserPosition ? getDistanceMetersBetween(effectiveUserPosition, currentStop.coordinates) : null,
    [effectiveUserPosition, currentStop.coordinates],
  )
  const walkMinutesToStop = distanceToStop !== null
    ? Math.max(1, Math.round((distanceToStop / 1000) * 12))
    : null
  const guideRouteUserPosition = effectiveUserPosition

  const handleManualPositionToggle = useCallback(() => { toggleOverride() }, [toggleOverride])

  const handleNavMapClick = useCallback((coords: { lat: number; lng: number }) => {
    if (overrideMode === 'waiting') {
      setManualPosition(coords)
    }
  }, [overrideMode, setManualPosition])

  // Stable references for RouteMap props — passing inline `[currentStop]` /
  // `() => setSheetState('full')` would create new array/function references
  // on every render, causing the entire LeafletRouteMap overlay (markers,
  // route polyline, user marker) to rebuild on every parent re-render during
  // navigation. With audio-guide state changes that's many wasted rebuilds.
  const navStops = useMemo(() => [currentStop], [currentStop])
  const handleNavMarkerSelect = useCallback(() => setSheetState('full'), [])

  return (
    <div className="ep-nav">
      <div className="ep-nav__map">
        <RouteMap
          isMapLocked={overrideMode === 'waiting'}
          onLocateUser={requestLocation}
          onMapClick={handleNavMapClick}
          onSelect={handleNavMarkerSelect}
          routeColor={excursion.routeColor}
          selectedStopId={currentStop.id}
          stops={navStops}
          userPosition={guideRouteUserPosition}
        />
      </div>

      <div className="ep-nav__sheet" data-sheet-state={sheetState} ref={sheetRef}>
        {/* Drag handle — always visible */}
        <div
          aria-label="Потяните вверх чтобы открыть панель"
          className="ep-nav__drag"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSheetState((s) => s === 'closed' ? 'peek' : s === 'peek' ? 'full' : 'closed')
            }
          }}
          onPointerCancel={handleDragEnd}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          role="button"
          tabIndex={0}
        >
          <button
            aria-label={isAudioPlaying ? 'Остановить аудиогид' : 'Запустить аудиогид'}
            className={`ep-nav__audio-btn${isAudioPlaying ? ' ep-nav__audio-btn--playing' : ''}`}
            disabled={!isAudioAvailable}
            onClick={toggleAudio}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            {isAudioPlaying ? (
              <svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 24 24" width="16">
                <rect height="14" rx="1.5" width="4" x="6" y="5" />
                <rect height="14" rx="1.5" width="4" x="14" y="5" />
              </svg>
            ) : (
              <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              </svg>
            )}
          </button>
          <div className="ep-nav__handle" />
          <button
            aria-label="Найти моё местоположение"
            className="ep-nav__locate"
            onClick={requestLocation}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
              <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="ep-nav__body"
          ref={bodyRef}
          style={{ overflowY: sheetState === 'full' ? undefined : 'hidden' }}
        >
          {/* Nav row — compact one-line strip, hidden when sheet is fully open */}
          <div className="ep-nav__nav-row" ref={navRowRef}>
            <span className="ep-nav__progress-count">{currentStopIndex + 1}/{excursion.stops.length}</span>
            <p className="ep-nav__progress-title">
              {currentStop.title}
              {distanceToStop !== null ? <span className="ep-nav__progress-dist"> · {formatMeters(distanceToStop)}</span> : null}
            </p>
            <button
              aria-label={overrideMode !== 'off' ? 'Вернуться к реальной геопозиции' : 'Установить позицию вручную'}
              className={`ep-nav__manual-pos${overrideMode === 'active' ? ' ep-nav__manual-pos--active' : overrideMode === 'waiting' ? ' ep-nav__manual-pos--waiting' : ''}`}
              onClick={handleManualPositionToggle}
              onPointerDown={(e) => e.stopPropagation()}
              title={overrideMode === 'waiting' ? 'Кликните на карту чтобы установить позицию' : overrideMode === 'active' ? 'Нажмите чтобы вернуться к GPS' : 'Установить позицию вручную'}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Stop details — visible in full */}
          <div className="ep-nav__stop">
            <div className="ep-nav__stop-img">
              <div className={`ep-nav__stop-img-inner${!currentStop.imageUrl ? ' ep-nav__stop-img-inner--fallback' : ''}`}>
                {currentStop.imageUrl ? (
                  <img alt={currentStop.title} loading="lazy" referrerPolicy="no-referrer" src={currentStop.imageUrl} />
                ) : (
                  <div
                    aria-hidden="true"
                    className="ep-nav__stop-img-fallback"
                    style={getStopFallbackStyle(currentStop.category)}
                  />
                )}
                <span className="ep-nav__stop-cat">{getPointCategoryLabel(currentStop)}</span>
              </div>
            </div>

            <div className="ep-nav__stop-header">
              <h2 className="ep-nav__stop-title">{currentStop.title}</h2>
              <div className="ep-nav__stop-stats">
                {distanceToStop !== null ? (
                  <span className="ep-nav__stop-chip">
                    ~{walkMinutesToStop} мин · {formatMeters(distanceToStop)}
                  </span>
                ) : null}
                {currentStop.expectedVisitMinutes > 0 ? (
                  <span className="ep-nav__stop-chip">
                    ~{currentStop.expectedVisitMinutes} мин на осмотр
                  </span>
                ) : null}
                {currentStop.scheduleLabel ? (
                  <span className="ep-nav__stop-chip ep-nav__stop-chip--schedule">
                    {currentStop.scheduleLabel}
                  </span>
                ) : null}
                {currentStop.rating > 0 ? (
                  <span className="ep-nav__stop-chip">
                    ★ {currentStop.rating.toFixed(1)}
                  </span>
                ) : null}
              </div>
            </div>

            {navDescriptionParagraphs.length > 0 && (
              <section className="ep-nav__about" aria-label="Описание точки">
                <span className="ep-nav__about-label">О месте</span>
                {navDescriptionParagraphs.map((paragraph, index) => (
                  <p className="ep-nav__stop-desc" key={index}>
                    {paragraph}
                  </p>
                ))}
              </section>
            )}

            <div className="ep-nav__audio">
              <div className="ep-nav__audio-head">
                <span className="ep-nav__audio-icon" aria-hidden="true">🎧</span>
                <h3 className="ep-nav__audio-title">Аудиогид</h3>
                <div className="ep-nav__audio-chips">
                  <span className="ep-nav__audio-chip">
                    {!isAudioAvailable
                      ? '0 мин'
                      : loadedDurationSeconds != null
                        ? formatDuration(Math.max(1, Math.round(loadedDurationSeconds / 60)))
                        : getAudioGuideDuration(currentAudio) > 0
                          ? formatDuration(Math.ceil(getAudioGuideDuration(currentAudio) / 60))
                          : '…'}
                  </span>
                  <span className="ep-nav__audio-chip">
                    {formatLocaleLabel(getAudioGuideLanguage(currentAudio))}
                  </span>
                </div>
              </div>
              <div className="ep-nav__audio-actions">
                <button
                  className="ep-nav__audio-play-btn"
                  disabled={!isAudioAvailable}
                  onClick={toggleAudio}
                  type="button"
                >
                  {isAudioPlaying ? (
                    <>
                      <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
                        <rect height="12" rx="1.5" width="4" x="6" y="6" />
                        <rect height="12" rx="1.5" width="4" x="14" y="6" />
                      </svg>
                      Пауза
                    </>
                  ) : (
                    <>
                      <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                      Прослушать
                    </>
                  )}
                </button>
                {isAudioAvailable && currentAudio.transcriptPreview ? (
                  <button
                    className="ep-nav__audio-play-btn"
                    onClick={() => {
                      if (!isTranscriptOpen && transcriptRef.current) {
                        setTranscriptHeight(transcriptRef.current.scrollHeight)
                      }
                      setIsTranscriptOpen((v) => !v)
                    }}
                    type="button"
                  >
                    {isTranscriptOpen ? 'Скрыть' : 'Прочитать'}
                  </button>
                ) : null}
                <div
                  aria-hidden={!isTranscriptOpen}
                  style={{
                    maxHeight: isTranscriptOpen ? `${transcriptHeight}px` : '0px',
                    overflow: 'hidden',
                    transition: 'max-height 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <div ref={transcriptRef}>
                    <p className="ep-nav__audio-transcript">{currentAudio.transcriptPreview}</p>
                  </div>
                </div>
                {!isAudioAvailable ? (
                  <p className="ep-nav__audio-placeholder">Сейчас для этой точки доступно только текстовое описание.</p>
                ) : null}
              </div>
            </div>

            <div className="ep-nav__stop-actions">
              <div className="ep-nav__stop-nav">
                {currentStopIndex > 0 ? (
                  <button
                    className="ep-nav__stop-nav-btn ep-nav__stop-nav-btn--prev"
                    onClick={handlePrevStop}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                    </svg>
                    <span className="ep-nav__stop-nav-label">Предыдущая: {excursion.stops[currentStopIndex - 1]?.title}</span>
                  </button>
                ) : null}
                {isLastStop ? (
                  <button
                    className="ep-nav__stop-nav-btn ep-nav__stop-nav-btn--complete"
                    onClick={handleNextStop}
                    type="button"
                  >
                    <span className="ep-nav__stop-nav-label">Завершить</span>
                    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    className="ep-nav__stop-nav-btn ep-nav__stop-nav-btn--next"
                    onClick={handleNextStop}
                    type="button"
                  >
                    <span className="ep-nav__stop-nav-label">Следующая: {excursion.stops[currentStopIndex + 1]?.title}</span>
                    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Phase 3 — Complete ───────────────────────────────────────────────────────

interface CompleteScreenProps {
  excursion: Excursion
  excursionId: number
  isSaved: boolean
  onSave: () => void
  onShare: () => void
}

function CompleteScreen({ excursion, excursionId, isSaved, onSave, onShare }: CompleteScreenProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewSent, setReviewSent] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmitReview() {
    if (!rating || isSubmitting) return
    setIsSubmitting(true)
    setReviewError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await excursionsService.submitReview(excursionId, {
        rating,
        reviewText: reviewText.trim() || undefined,
        visitDate: today,
      })
      setReviewSent(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // 409 = уже оставлял отзыв
      setReviewError(msg.includes('409') || msg.toLowerCase().includes('уже') ? 'Вы уже оставляли отзыв на этот маршрут.' : 'Не удалось отправить отзыв. Попробуйте позже.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="ep-complete">
      <div className="ep-complete__confetti" aria-hidden="true">🎉</div>

      <div className="ep-complete__card">
        <div className="ep-complete__head">
          <h1 className="ep-complete__title">Маршрут завершён!</h1>
          <p className="ep-complete__route">{excursion.title}</p>
        </div>

        <div className="ep-complete__stats">
          <div className="ep-complete__stat">
            <span className="ep-complete__stat-value">{formatStopCount(excursion.stops.length)}</span>
            <span className="ep-complete__stat-label">пройдено</span>
          </div>
          <div className="ep-complete__stat-sep" aria-hidden="true" />
          <div className="ep-complete__stat">
            <span className="ep-complete__stat-value">{formatDistance(excursion.distanceKm)}</span>
            <span className="ep-complete__stat-label">пройдено</span>
          </div>
          <div className="ep-complete__stat-sep" aria-hidden="true" />
          <div className="ep-complete__stat">
            <span className="ep-complete__stat-value">~{formatDuration(excursion.durationMinutes)}</span>
            <span className="ep-complete__stat-label">времени</span>
          </div>
        </div>

        <div className="ep-complete__review">
          {reviewSent ? (
            <p className="ep-complete__review-sent">Спасибо за отзыв ✓</p>
          ) : (
            <>
              <p className="ep-complete__review-prompt">Как вам маршрут?</p>
              <div aria-label="Оцените маршрут" className="ep-complete__stars" role="group">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    aria-label={`${star} из 5`}
                    aria-pressed={rating === star}
                    className={`ep-complete__star${star <= (hoverRating || rating) ? ' ep-complete__star--on' : ''}`}
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    type="button"
                  >
                    ★
                  </button>
                ))}
              </div>
              {rating > 0 ? (
                <>
                  <textarea
                    className="ep-complete__review-textarea"
                    maxLength={400}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Расскажите подробнее (необязательно)"
                    rows={3}
                    value={reviewText}
                  />
                  {reviewError ? (
                    <p className="ep-complete__review-error">{reviewError}</p>
                  ) : null}
                  <button
                    className="button button--secondary"
                    disabled={isSubmitting}
                    onClick={() => void handleSubmitReview()}
                    type="button"
                  >
                    {isSubmitting ? 'Отправляем…' : 'Отправить отзыв'}
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="ep-complete__actions">
          <button
            aria-pressed={isSaved}
            className={`button ${isSaved ? 'button--primary' : 'button--secondary'}`}
            onClick={onSave}
            type="button"
          >
            {isSaved ? 'Сохранено' : 'Сохранить маршрут'}
          </button>
          <button className="button button--ghost" onClick={onShare} type="button">Поделиться</button>
          <Link className="button button--ghost" to={appRoutes.excursions}>Все маршруты</Link>
        </div>
      </div>
    </div>
  )
}
