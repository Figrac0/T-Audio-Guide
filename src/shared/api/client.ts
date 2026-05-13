import { authService } from '@/shared/api/authService'
import { getCategoryIdsForSlug } from '@/shared/api/categoriesStore'
import type {
  DiscoveryFeedDto,
  FrontendApi,
  ProfileOverviewDto,
  RouteCatalogRequest,
  RouteDetailsRequest,
  ShareRouteDto,
} from '@/shared/api/contracts'
import { excursionsService } from '@/shared/api/excursionsService'
import { request } from '@/shared/api/http'
import {
  mapExcursionFromDetail,
  mapExcursionFromShort,
  mapNearbyPointFromShort,
} from '@/shared/api/mappers'
import { mockApi } from '@/shared/api/mock/mockApi'
import { pointsService } from '@/shared/api/pointsService'
import { profileService } from '@/shared/api/profileService'

// Mock vs real backend selection.
// - Explicit override: VITE_USE_MOCK_API='true' → mock, ='false' → real backend.
// - Implicit default (no override): mock only if VITE_API_URL is missing.
const explicitMockFlag = import.meta.env.VITE_USE_MOCK_API
const useMockApi =
  explicitMockFlag === 'true' ||
  (explicitMockFlag !== 'false' && !import.meta.env.VITE_API_URL)

if (typeof window !== 'undefined') {
  // Surface which API is in effect — helps when the dev server kept stale
  // env values from before a `.env` file existed.
  console.info(
    `[t-guide] API mode: ${useMockApi ? 'MOCK (in-memory)' : 'REAL backend'}` +
      (useMockApi ? '' : ` → ${import.meta.env.VITE_API_URL}`),
  )
}

// Extract numeric backend id from slug "excursion-{id}". Slugs are produced by
// mapExcursionFromShort and are the only way the UI references excursions.
function excursionIdFromSlug(slug: string): number | null {
  const match = slug.match(/^excursion-(\d+)$/)
  return match ? Number(match[1]) : null
}

const httpApi: FrontendApi = {
  changePassword(payload) {
    return authService.changePassword(payload)
  },

  async createPersonalRoute(payload) {
    const { route } = payload
    if (!route.stops.length) throw new Error('Маршрут должен содержать хотя бы одну точку')

    // Backend ExcursionPointOrderItem uses 1-based order (per swagger example:
    // { pointId: 1, order: 1 }). Frontend RouteStop.order is also 1-based, so
    // pass through. Fall back to index+1 if order is missing.
    const validPoints = route.stops
      .map((stop, index) => ({
        pointId: parseInt(stop.id, 10),
        order: stop.order ?? index + 1,
      }))
      .filter((p) => !isNaN(p.pointId))

    if (!validPoints.length) throw new Error('Все точки маршрута должны быть корректны')

    // POST /excursions per swagger CreateCustomExcursionRequest accepts points
    // in the body and returns full ExcursionDetailResponse with points
    // populated — single round-trip.
    const created = await excursionsService.createExcursion({
      title: route.title,
      description: route.description,
      shortDescription: route.tagline || undefined,
      visibility: 'PUBLIC',
      points: validPoints,
    })

    return mapExcursionFromDetail(created)
  },

  async getDiscoveryFeed(payload): Promise<DiscoveryFeedDto> {
    // swagger: radiusKilometers is integer [1, 15]
    const radiusKm = Math.max(1, Math.min(15, Math.round(payload.radiusMeters / 1000)))

    // Resolve frontend category slug ('museum', 'food', ...) to backend
    // numeric category IDs. A single slug can map to multiple backend
    // categories (e.g. 'museum' covers "Музей" and "Галерея"). Empty array
    // means "no filter" — backend returns all categories in radius.
    const categoryIds =
      payload.category !== 'all' ? await getCategoryIdsForSlug(payload.category) : []

    const location = { latitude: payload.center.lat, longitude: payload.center.lng }

    const [rawPoints, rawExcursions] = await Promise.all([
      pointsService
        .searchPoints({
          location,
          radiusKilometers: radiusKm,
          categoryIds,
        })
        .catch(() => []),
      excursionsService
        .searchExcursions({
          location,
          radiusKilometers: radiusKm,
          categoryIds,
        })
        .catch(() => []),
    ])

    let nearbyPoints = rawPoints.map((p) =>
      mapNearbyPointFromShort(p, payload.center.lat, payload.center.lng),
    )

    const search = payload.search?.trim().toLocaleLowerCase() ?? ''
    if (search) {
      nearbyPoints = nearbyPoints.filter((p) => {
        const haystack = [p.title, p.shortDescription, p.description, p.addressLabel]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
        return haystack.includes(search)
      })
    }

    return {
      appliedCategory: payload.category,
      appliedRadiusMeters: payload.radiusMeters,
      center: payload.center,
      excursions: rawExcursions.map(mapExcursionFromShort),
      nearbyPoints,
    }
  },

  async getProfileOverview(): Promise<ProfileOverviewDto> {
    const [profile, myResult, favResult] = await Promise.all([
      profileService.getProfile(),
      excursionsService.getMyExcursions().catch(() => ({ excursions: [] })),
      excursionsService.getFavoriteExcursions().catch(() => ({ excursions: [] })),
    ])

    return {
      profile,
      personalRoutes: (myResult.excursions ?? []).map(mapExcursionFromShort),
      savedRoutes: (favResult.excursions ?? []).map(mapExcursionFromShort),
      routeHistory: [],
    }
  },

  async getRouteBySlug(payload: RouteDetailsRequest) {
    const match = payload.slug.match(/^excursion-(\d+)$/)
    if (!match) return null

    try {
      const exc = await excursionsService.getExcursionById(Number(match[1]))
      return mapExcursionFromDetail(exc, payload.locale)
    } catch {
      return null
    }
  },

  async getRoutesCatalog(payload: RouteCatalogRequest) {
    const radiusKm = Math.max(1, Math.min(15, Math.round(payload.radiusMeters / 1000)))
    const rawExcursions = await excursionsService.searchExcursions({
      location: { latitude: payload.center.lat, longitude: payload.center.lng },
      radiusKilometers: radiusKm,
    })
    return rawExcursions.map(mapExcursionFromShort)
  },

  getSession() {
    return profileService
      .getProfile()
      .then((profile) => ({ isAuthenticated: true, profile }))
      .catch(() => ({ isAuthenticated: false, profile: null }))
  },

  requestPasswordReset(payload) {
    return request<void>('/auth/reset-password', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },

  register(payload) {
    return authService.register(payload)
  },

  async removeSavedRoute(payload) {
    // Backend models "saved" as favorites: POST /excursions/{id}/unfavorite.
    const id = excursionIdFromSlug(payload.slug)
    if (id == null) {
      // Slug doesn't reference a known backend excursion (e.g. local-only
      // draft). Nothing to call — silently succeed.
      return
    }
    await excursionsService.removeFavorite(id)
  },

  async saveRoute(payload) {
    // Backend models "saved" as favorites: POST /excursions/{id}/favorite.
    const id = excursionIdFromSlug(payload.route.slug)
    if (id == null) {
      throw new Error('Невозможно сохранить локальный маршрут — нет идентификатора экскурсии.')
    }
    await excursionsService.addFavorite(id)
    return payload.route
  },

  shareRoute(payload): Promise<ShareRouteDto> {
    return Promise.resolve({
      url: `${window.location.origin}/excursions/${payload.slug}`,
    })
  },

  signIn(payload) {
    return authService.login(payload)
  },

  signOut() {
    return authService.logout()
  },

  updateProfile(payload) {
    return profileService.updateProfile(payload)
  },
}

export const appApi: FrontendApi = useMockApi ? mockApi : httpApi
