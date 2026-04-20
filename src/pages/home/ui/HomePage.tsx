import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import type {
  ExcursionTheme,
  NearbyPoint,
  PointCategory,
  RouteStop,
  SupportedLocale,
} from '@/entities/excursion/model/types'
import { useDiscoveryRoutes } from '@/entities/excursion/model/useDiscoveryRoutes'
import { formatMeters } from '@/features/route-map/lib/route-geometry'
import { useUserGeolocation } from '@/features/route-map/model/useUserGeolocation'
import type {
  DiscoveryCategoryOption,
  DiscoveryRadiusOption,
} from '@/features/route-map/ui/DiscoveryMap'
import { DiscoveryMap } from '@/features/route-map/ui/DiscoveryMap'
import { useAuth } from '@/app/providers/useAuth'
import { useUserRoutes } from '@/features/user-routes/model/useUserRoutes'
import { appRoutes } from '@/shared/config/routes'
import {
  detectSupportedLocale,
  getStoredDiscoveryContext,
  saveDiscoveryContext,
} from '@/shared/lib/discovery-context'
import {
  formatDuration,
  formatPointCategory,
  formatTheme,
} from '@/shared/lib/format'
import { buildGoogleMapsUrl } from '@/shared/lib/maps'
import { SmartPlaceImage } from '@/shared/ui/SmartPlaceImage'
import { ExcursionCatalog } from '@/widgets/excursion-catalog/ui/ExcursionCatalog'
import './HomePage.css'

const PEEK_HEIGHT = 92
const HALF_RATIO = 0.48

type SheetState = 'peek' | 'half' | 'full'

function getTargetTranslate(state: SheetState, sheetHeight: number): number {
  if (state === 'full') return 0
  if (state === 'half') return sheetHeight - Math.round(window.innerHeight * HALF_RATIO)
  return sheetHeight - PEEK_HEIGHT
}

const nearbyCategoryOptions: DiscoveryCategoryOption[] = [
  { id: 'all', label: 'Все' },
  { id: 'museum', label: 'Музеи' },
  { id: 'entertainment', label: 'Развлечения' },
  { id: 'landmark', label: 'История' },
  { id: 'food', label: 'Еда' },
  { id: 'park', label: 'Природа' },
]

const radiusOptions: DiscoveryRadiusOption[] = [
  { value: 1000, label: '1 км' },
  { value: 3000, label: '3 км' },
  { value: 5000, label: '5 км' },
]

const routeThemeOptions: Array<ExcursionTheme | 'all'> = [
  'all',
  'walk',
  'food',
  'nature',
  'fun',
  'mixed',
]

const durationOptions = [30, 45, 60, 90, 120]

export function HomePage() {
  const { session } = useAuth()
  const {
    addPointToDraft,
    clearDraftRoute,
    draftStops,
    isPointInDraft,
    removeDraftStop,
    saveDraftRoute,
  } = useUserRoutes()

  const storedContext = useMemo(() => getStoredDiscoveryContext(), [])
  const detectedLocale = useMemo(() => {
    if (typeof window === 'undefined') return storedContext.locale
    return detectSupportedLocale(
      navigator.languages?.[0] ?? navigator.language ?? storedContext.browserLocale,
    )
  }, [storedContext.browserLocale, storedContext.locale])

  const [audioLocale] = useState<SupportedLocale>(storedContext.locale ?? detectedLocale)
  const [activePointCategory, setActivePointCategory] = useState<PointCategory | 'all'>(
    storedContext.activePointCategory ?? 'all',
  )
  const [radiusMeters, setRadiusMeters] = useState<number>(storedContext.radiusMeters ?? 1000)
  const [activeRouteTheme, setActiveRouteTheme] = useState<ExcursionTheme | 'all'>('all')
  const [maxRouteDuration, setMaxRouteDuration] = useState<number | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string>('')
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [savedDraftPreviewStops, setSavedDraftPreviewStops] = useState<RouteStop[]>([])
  const [draftRouteNotice, setDraftRouteNoticeValue] = useState<string | null>(null)
  const [draftRouteNoticeKey, setDraftRouteNoticeKey] = useState(0)
  const [draftRouteNoticeTone, setDraftRouteNoticeTone] = useState<'success' | 'warning'>('success')

  const nearbyListRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollNearbyListRef = useRef(false)
  const isAuthenticated = Boolean(session?.isAuthenticated && session.profile)

  const {
    error: geolocationError,
    requestLocation,
    status: geolocationStatus,
    userPosition,
  } = useUserGeolocation()

  const currentCenter = userPosition ?? storedContext.center
  const canLoadNearbyPlaces =
    Boolean(userPosition) || geolocationStatus === 'blocked' || geolocationStatus === 'unsupported'

  const {
    error: discoveryError,
    excursions,
    isLoading,
    nearbyPoints,
  } = useDiscoveryRoutes({
    activePointCategory,
    center: currentCenter,
    enabled: canLoadNearbyPlaces,
    locale: audioLocale,
    radiusMeters,
    search: searchQuery,
  })

  useEffect(() => {
    saveDiscoveryContext({
      activePointCategory,
      center: currentCenter,
      locale: audioLocale,
      browserLocale:
        typeof window === 'undefined'
          ? storedContext.browserLocale
          : navigator.languages?.[0] ?? navigator.language ?? storedContext.browserLocale,
      radiusMeters,
      updatedAt: new Date().toISOString(),
    })
  }, [activePointCategory, audioLocale, currentCenter, radiusMeters, storedContext.browserLocale])

  const effectiveSelectedPointId =
    nearbyPoints.find((p) => p.id === selectedPointId)?.id ?? nearbyPoints[0]?.id ?? ''

  const selectedPoint =
    nearbyPoints.find((p) => p.id === effectiveSelectedPointId) ?? nearbyPoints[0] ?? null

  const effectiveRouteTargetId =
    routeTargetId && nearbyPoints.some((p) => p.id === routeTargetId) ? routeTargetId : null

  const selectedPointMapsUrl = selectedPoint
    ? buildGoogleMapsUrl(selectedPoint.coordinates, userPosition)
    : '#'
  const selectedPointInDraft = selectedPoint ? isPointInDraft(selectedPoint.id) : false
  const canAddSelectedPoint = Boolean(
    selectedPoint && !selectedPointInDraft && draftStops.length < 6,
  )

  const visibleRoutes = useMemo(
    () =>
      excursions.filter((e) => {
        const matchesTheme = activeRouteTheme === 'all' || e.theme === activeRouteTheme
        const matchesDuration = maxRouteDuration === null || e.durationMinutes <= maxRouteDuration
        return matchesTheme && matchesDuration
      }),
    [activeRouteTheme, excursions, maxRouteDuration],
  )

  useEffect(() => {
    if (!shouldScrollNearbyListRef.current) return
    const list = nearbyListRef.current
    if (!list || !effectiveSelectedPointId) return
    const card = list.querySelector<HTMLElement>(`[data-point-id="${effectiveSelectedPointId}"]`)
    if (card) scrollIntoHorizontalView(list, card)
    shouldScrollNearbyListRef.current = false
  }, [effectiveSelectedPointId])

  useEffect(() => {
    if (!draftRouteNotice) return
    const id = window.setTimeout(() => setDraftRouteNoticeValue(null), 3200)
    return () => window.clearTimeout(id)
  }, [draftRouteNotice, draftRouteNoticeKey])

  const setDraftRouteNotice = useCallback((message: string | null) => {
    if (!message) { setDraftRouteNoticeValue(null); return }
    setDraftRouteNoticeTone(message.toLowerCase().includes('уже') ? 'warning' : 'success')
    setDraftRouteNoticeKey((n) => n + 1)
    setDraftRouteNoticeValue(message)
  }, [])

  const handleBuildRoute = useCallback(
    (pointId: string) => {
      setSelectedPointId(pointId)
      setRouteTargetId(pointId)
      if (!userPosition) requestLocation()
    },
    [requestLocation, userPosition],
  )

  const handleAddPointToRoute = useCallback(
    (point: NearbyPoint) => {
      addPointToDraft(point)
      setDraftRouteNotice(null)
      setSavedDraftPreviewStops([])
      setSelectedPointId(point.id)
      setRouteTargetId(point.id)
      if (!userPosition) requestLocation()
    },
    [addPointToDraft, requestLocation, setDraftRouteNotice, userPosition],
  )

  const handleClearDraftRoute = useCallback(() => {
    clearDraftRoute()
    setDraftRouteNotice(null)
    setSavedDraftPreviewStops([])
    setRouteTargetId(null)
  }, [clearDraftRoute, setDraftRouteNotice])

  const handleSaveDraftRoute = useCallback(() => {
    const result = saveDraftRoute()
    if (result.status === 'duplicate') {
      setDraftRouteNotice('Такой маршрут уже сохранен.')
      return
    }
    if (result.status !== 'saved' || !result.route) return
    setDraftRouteNotice('Маршрут сохранен в профиле.')
    setSavedDraftPreviewStops(result.route.stops)
    clearDraftRoute()
    setRouteTargetId(null)
  }, [clearDraftRoute, saveDraftRoute, setDraftRouteNotice])

  const handleNearbyCardClick = useCallback((pointId: string) => {
    shouldScrollNearbyListRef.current = true
    setSelectedPointId(pointId)
  }, [])

  const handleMapPointSelect = useCallback((pointId: string) => {
    shouldScrollNearbyListRef.current = true
    setSelectedPointId(pointId)
  }, [])

  const cycleSelectedPoint = useCallback(
    (direction: 1 | -1) => {
      if (!nearbyPoints.length) return
      const currentIndex = nearbyPoints.findIndex((p) => p.id === effectiveSelectedPointId)
      const safeIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (safeIndex + direction + nearbyPoints.length) % nearbyPoints.length
      shouldScrollNearbyListRef.current = true
      setSelectedPointId(nearbyPoints[nextIndex].id)
    },
    [effectiveSelectedPointId, nearbyPoints],
  )

  // Bottom sheet
  const [sheetState, setSheetState] = useState<SheetState>('peek')
  const sheetStateRef = useRef<SheetState>('peek')
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    active: false,
    startPointerY: 0,
    startTranslate: 0,
    lastPointerY: 0,
    lastTime: 0,
    velocity: 0,
  })

  useEffect(() => {
    sheetStateRef.current = sheetState
  }, [sheetState])

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const applyInitial = () => {
      if (sheet.offsetHeight > 0) {
        sheet.style.transition = 'none'
        sheet.style.transform = `translateY(${sheet.offsetHeight - PEEK_HEIGHT}px)`
      }
    }

    applyInitial()

    const onResize = () => {
      if (dragRef.current.active) return
      const target = getTargetTranslate(sheetStateRef.current, sheet.offsetHeight)
      sheet.style.transition = 'none'
      sheet.style.transform = `translateY(${target}px)`
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet || sheet.offsetHeight === 0) return
    const target = getTargetTranslate(sheetState, sheet.offsetHeight)
    sheet.style.transition = 'transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${target}px)`
  }, [sheetState])

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current
    if (!sheet) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const current = match
      ? parseFloat(match[1])
      : getTargetTranslate(sheetState, sheet.offsetHeight)
    dragRef.current = {
      active: true,
      startPointerY: e.clientY,
      startTranslate: current,
      lastPointerY: e.clientY,
      lastTime: Date.now(),
      velocity: 0,
    }
    sheet.style.transition = 'none'
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return
    const sheet = sheetRef.current
    if (!sheet) return
    const dy = e.clientY - dragRef.current.startPointerY
    const newTranslate = Math.max(0, dragRef.current.startTranslate + dy)
    const now = Date.now()
    const dt = Math.max(1, now - dragRef.current.lastTime)
    dragRef.current.velocity = ((e.clientY - dragRef.current.lastPointerY) / dt) * 16
    dragRef.current.lastPointerY = e.clientY
    dragRef.current.lastTime = now
    sheet.style.transform = `translateY(${newTranslate}px)`
  }

  function handleDragEnd() {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const sheet = sheetRef.current
    if (!sheet) return
    const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
    const currentTranslate = match ? parseFloat(match[1]) : 0
    const sheetHeight = sheet.offsetHeight
    const velocity = dragRef.current.velocity
    const peekT = getTargetTranslate('peek', sheetHeight)
    const halfT = getTargetTranslate('half', sheetHeight)
    let nextState: SheetState

    if (velocity > 6) {
      nextState = sheetState === 'full' ? 'half' : 'peek'
    } else if (velocity < -6) {
      nextState = sheetState === 'peek' ? 'half' : 'full'
    } else {
      const midPeekHalf = (peekT + halfT) / 2
      const midHalfFull = halfT / 2
      if (currentTranslate >= midPeekHalf) nextState = 'peek'
      else if (currentTranslate >= midHalfFull) nextState = 'half'
      else nextState = 'full'
    }

    setSheetState(nextState)
    const target = getTargetTranslate(nextState, sheetHeight)
    sheet.style.transition = 'transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)'
    sheet.style.transform = `translateY(${target}px)`
  }

  return (
    <div className="home-page">
      <div className="home-page__map">
        <DiscoveryMap
          activeCategory={activePointCategory}
          canSaveDraftRoute={isAuthenticated}
          categoryOptions={nearbyCategoryOptions}
          draftStops={draftStops}
          draftRouteNotice={draftRouteNotice}
          draftRouteNoticeKey={draftRouteNoticeKey}
          draftRouteNoticeTone={draftRouteNoticeTone}
          emptyMessage={searchQuery.trim() ? 'Ничего не найдено' : 'В этом радиусе нет доступных точек.'}
          fixedRouteStops={savedDraftPreviewStops}
          fullscreen
          geolocationError={geolocationError}
          isLoading={isLoading || !canLoadNearbyPlaces}
          loadError={discoveryError}
          nearbyPoints={nearbyPoints}
          onAddPointToDraft={handleAddPointToRoute}
          onBuildRoute={handleBuildRoute}
          onChangeRadius={setRadiusMeters}
          onClearDraftRoute={handleClearDraftRoute}
          onLocateUser={requestLocation}
          onSaveDraftRoute={handleSaveDraftRoute}
          onSearchQueryChange={setSearchQuery}
          onSelectCategory={setActivePointCategory}
          onSelectNextPoint={() => cycleSelectedPoint(1)}
          onSelectPoint={handleMapPointSelect}
          onSelectPreviousPoint={() => cycleSelectedPoint(-1)}
          radiusMeters={radiusMeters}
          radiusOptions={radiusOptions}
          routeTargetId={effectiveRouteTargetId}
          searchQuery={searchQuery}
          selectedPointId={effectiveSelectedPointId}
          userPosition={userPosition}
        />
      </div>

      <button
        aria-label="Найти моё местоположение"
        className="home-page__locate"
        onClick={requestLocation}
        type="button"
      >
        <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </button>

      <div className="home-sheet" ref={sheetRef}>
        <div
          className="home-sheet__drag"
          onPointerCancel={handleDragEnd}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          role="button"
          tabIndex={0}
          aria-label="Потяните вверх чтобы открыть панель"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSheetState((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'))
            }
          }}
        >
          <div className="home-sheet__handle" />
          <div className="home-sheet__peek-row">
            {isLoading ? (
              <span className="home-sheet__peek-hint">Загрузка мест...</span>
            ) : nearbyPoints.length > 0 ? (
              <>
                <span className="home-sheet__peek-stat">
                  {nearbyPoints.length} мест · {radiusMeters / 1000} км
                </span>
                {selectedPoint && (
                  <span className="home-sheet__peek-point">{selectedPoint.title}</span>
                )}
              </>
            ) : (
              <span className="home-sheet__peek-hint">Разрешите геолокацию чтобы найти места</span>
            )}
            <span className="home-sheet__peek-arrow" aria-hidden="true">↑</span>
          </div>
        </div>

        <div className="home-sheet__body">
          <div className="home-sheet__search-wrap">
            <label className="home-sheet__search-label" htmlFor="home-search">
              <svg fill="none" height="16" viewBox="0 0 24 24" width="16" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              </svg>
              <input
                autoComplete="off"
                className="home-sheet__search"
                id="home-search"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск мест..."
                type="search"
                value={searchQuery}
              />
            </label>
          </div>

          <div className="home-sheet__filter-group">
            <p className="home-sheet__filter-label">Категории</p>
            <div className="home-sheet__cats">
              {nearbyCategoryOptions.map((opt) => (
                <button
                  className={`home-sheet__cat${activePointCategory === opt.id ? ' home-sheet__cat--active' : ''}`}
                  key={opt.id}
                  onClick={() => setActivePointCategory(opt.id as PointCategory | 'all')}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="home-sheet__filter-group">
            <p className="home-sheet__filter-label">Радиус поиска</p>
            <div className="home-sheet__cats">
              {radiusOptions.map((r) => (
                <button
                  className={`home-sheet__cat${radiusMeters === r.value ? ' home-sheet__cat--active' : ''}`}
                  key={r.value}
                  onClick={() => setRadiusMeters(r.value)}
                  type="button"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {selectedPoint && (
            <div className="home-sheet__place">
              <div className="home-sheet__place-media">
                <SmartPlaceImage
                  alt={selectedPoint.title}
                  category={selectedPoint.category}
                  coordinates={selectedPoint.coordinates}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={selectedPoint.imageUrl}
                  title={selectedPoint.title}
                />
              </div>
              <div className="home-sheet__place-info">
                <div className="home-sheet__place-meta">
                  <span className="home-sheet__place-cat">
                    {formatPointCategory(selectedPoint.category)}
                  </span>
                  <span className="home-sheet__place-dist">
                    {formatMeters(selectedPoint.distanceMeters)}
                  </span>
                </div>
                <h3 className="home-sheet__place-title">{selectedPoint.title}</h3>
                {selectedPoint.scheduleLabel && (
                  <p className="home-sheet__place-schedule">{selectedPoint.scheduleLabel}</p>
                )}
                <div className="home-sheet__place-actions">
                  <button
                    className="button button--primary"
                    onClick={() => handleBuildRoute(selectedPoint.id)}
                    type="button"
                  >
                    Маршрут
                  </button>
                  <button
                    className="button button--secondary"
                    disabled={!canAddSelectedPoint}
                    onClick={() => handleAddPointToRoute(selectedPoint)}
                    type="button"
                  >
                    {selectedPointInDraft ? 'В маршруте ✓' : '+ Добавить'}
                  </button>
                  <a
                    className="button button--ghost"
                    href={selectedPointMapsUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Google Maps
                  </a>
                </div>
              </div>
            </div>
          )}

          {nearbyPoints.length > 0 && (
            <div className="home-sheet__section">
              <h3 className="home-sheet__section-title">Рядом с вами</h3>
              <div className="home-sheet__cards" ref={nearbyListRef}>
                {nearbyPoints.map((point) => (
                  <button
                    className={[
                      'home-card',
                      point.id === effectiveSelectedPointId ? 'home-card--active' : '',
                      isPointInDraft(point.id) ? 'home-card--draft' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-point-id={point.id}
                    key={point.id}
                    onClick={() => handleNearbyCardClick(point.id)}
                    type="button"
                  >
                    <div className="home-card__media">
                      <SmartPlaceImage
                        alt={point.title}
                        category={point.category}
                        coordinates={point.coordinates}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={point.imageUrl}
                        title={point.title}
                      />
                    </div>
                    <div className="home-card__body">
                      <div className="home-card__head">
                        <span className="home-card__cat">{formatPointCategory(point.category)}</span>
                        <span className="home-card__dist">{formatMeters(point.distanceMeters)}</span>
                      </div>
                      <p className="home-card__title">{point.title}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {draftStops.length > 0 && (
            <div className="home-sheet__section home-sheet__builder">
              <div className="home-sheet__builder-head">
                <h3 className="home-sheet__section-title">Мой маршрут</h3>
                <span className="chip chip--accent">{draftStops.length}/6</span>
              </div>
              <div className="home-sheet__builder-stops">
                {draftStops.map((stop) => (
                  <button
                    className="home-sheet__builder-stop"
                    key={stop.id}
                    onClick={() => removeDraftStop(stop.id)}
                    type="button"
                  >
                    <span>
                      {stop.order}. {stop.title}
                    </span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
              <div className="home-sheet__builder-actions">
                {isAuthenticated ? (
                  <button
                    className="button button--primary button--wide"
                    disabled={draftStops.length < 2}
                    onClick={handleSaveDraftRoute}
                    type="button"
                  >
                    Сохранить маршрут
                  </button>
                ) : (
                  <Link className="button button--primary button--wide" to={appRoutes.signIn}>
                    Войти чтобы сохранить
                  </Link>
                )}
                <button
                  className="button button--secondary"
                  onClick={handleClearDraftRoute}
                  type="button"
                >
                  Очистить
                </button>
              </div>
              {draftRouteNotice && (
                <div
                  className={`home-sheet__notice home-sheet__notice--${draftRouteNoticeTone}`}
                  key={draftRouteNoticeKey}
                  role="status"
                >
                  {draftRouteNotice}
                </div>
              )}
            </div>
          )}

          <div className="home-sheet__section">
            <div className="home-sheet__section-head">
              <h3 className="home-sheet__section-title">Готовые экскурсии</h3>
              <Link className="home-sheet__section-link" to={appRoutes.excursions}>
                Все →
              </Link>
            </div>

            <div className="home-sheet__filter-group">
              <div className="home-sheet__cats">
                {routeThemeOptions.map((theme) => (
                  <button
                    className={`home-sheet__cat${activeRouteTheme === theme ? ' home-sheet__cat--active' : ''}`}
                    key={theme}
                    onClick={() => setActiveRouteTheme(theme)}
                    type="button"
                  >
                    {theme === 'all' ? 'Все' : formatTheme(theme)}
                  </button>
                ))}
              </div>
            </div>

            <div className="home-sheet__filter-group">
              <div className="home-sheet__cats">
                <button
                  className={`home-sheet__cat${maxRouteDuration === null ? ' home-sheet__cat--active' : ''}`}
                  onClick={() => setMaxRouteDuration(null)}
                  type="button"
                >
                  Любое время
                </button>
                {durationOptions.map((d) => (
                  <button
                    className={`home-sheet__cat${maxRouteDuration === d ? ' home-sheet__cat--active' : ''}`}
                    key={d}
                    onClick={() => setMaxRouteDuration(d)}
                    type="button"
                  >
                    До {formatDuration(d)}
                  </button>
                ))}
              </div>
            </div>

            <ExcursionCatalog
              emptyDescription="Попробуйте другой фильтр"
              emptyTitle="Нет маршрутов"
              excursions={visibleRoutes.slice(0, 4)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function scrollIntoHorizontalView(container: HTMLElement, target: HTMLElement) {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  if (targetRect.left >= containerRect.left && targetRect.right <= containerRect.right) return
  const relativeLeft = targetRect.left - containerRect.left + container.scrollLeft
  const nextScrollLeft = relativeLeft - container.clientWidth / 2 + targetRect.width / 2
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
  container.scrollTo({ behavior: 'smooth', left: Math.min(Math.max(0, nextScrollLeft), maxScrollLeft) })
}
