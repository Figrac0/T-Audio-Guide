import { authService } from '@/shared/api/authService'
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

const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false' || !import.meta.env.VITE_API_URL

const httpApi: FrontendApi = {
  changePassword(payload) {
    return authService.changePassword(payload)
  },

  async createPersonalRoute(payload) {
    const { route } = payload
    if (!route.stops.length) return route

    const validPoints = route.stops
      .map((stop) => ({ pointId: parseInt(stop.id, 10), order: stop.order }))
      .filter((p) => !isNaN(p.pointId))

    if (!validPoints.length) return route

    try {
      const created = await excursionsService.createExcursion({
        title: route.title,
        description: route.description,
        points: validPoints,
      })
      return mapExcursionFromDetail(created)
    } catch {
      return route
    }
  },

  async getDiscoveryFeed(payload): Promise<DiscoveryFeedDto> {
    // swagger: radiusKilometers is integer [1, 15]
    const radiusKm = Math.max(1, Math.min(15, Math.round(payload.radiusMeters / 1000)))
    const categorySlug = payload.category !== 'all' ? payload.category : undefined

    const location = { latitude: payload.center.lat, longitude: payload.center.lng }

    const [rawPoints, rawExcursions] = await Promise.all([
      pointsService
        .searchPoints({
          location,
          radiusKilometers: radiusKm,
          categorySlugs: categorySlug ? [categorySlug] : [],
        })
        .catch(() => []),
      excursionsService
        .searchExcursions({
          location,
          radiusKilometers: radiusKm,
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

  removeSavedRoute(payload) {
    return request<void>(`/profile/routes/saved/${payload.slug}`, {
      method: 'DELETE',
    })
  },

  async saveRoute(payload) {
    return request('/profile/routes/saved', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
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
