import { authService } from '@/shared/api/authService'
import type {
  ChangePasswordRequestDto,
  CreatePersonalRouteRequestDto,
  DiscoveryFeedDto,
  DiscoveryFeedRequest,
  FrontendApi,
  RequestPasswordResetRequestDto,
  RegisterRequestDto,
  RemoveSavedRouteRequestDto,
  RouteCatalogRequest,
  RouteDetailsRequest,
  SaveRouteRequestDto,
  ShareRouteDto,
  ShareRouteRequestDto,
  SignInRequestDto,
} from '@/shared/api/contracts'
import { request } from '@/shared/api/http'
import { mockApi } from '@/shared/api/mock/mockApi'
import { profileService } from '@/shared/api/profileService'

const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false' || !import.meta.env.VITE_API_URL

const httpApi: FrontendApi = {
  changePassword(payload: ChangePasswordRequestDto) {
    return authService.changePassword(payload)
  },
  createPersonalRoute(payload: CreatePersonalRouteRequestDto) {
    return request('/profile/routes/personal', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  getDiscoveryFeed(payload: DiscoveryFeedRequest) {
    return request<DiscoveryFeedDto>('/discovery/feed', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  getProfileOverview() {
    return profileService.getProfile().then((profile) => ({
      personalRoutes: [],
      profile,
      routeHistory: [],
      savedRoutes: [],
    }))
  },
  getRouteBySlug({ slug, ...payload }: RouteDetailsRequest) {
    return request(`/routes/${slug}`, {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  getRoutesCatalog(payload: RouteCatalogRequest) {
    return request('/routes/catalog', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  getSession() {
    return profileService
      .getProfile()
      .then((profile) => ({
        isAuthenticated: true,
        profile,
      }))
      .catch(() => ({
        isAuthenticated: false,
        profile: null,
      }))
  },
  requestPasswordReset(payload: RequestPasswordResetRequestDto) {
    return request<void>('/auth/reset-password', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  register(payload: RegisterRequestDto) {
    return authService.register(payload)
  },
  removeSavedRoute(payload: RemoveSavedRouteRequestDto) {
    return request<void>(`/profile/routes/saved/${payload.slug}`, {
      method: 'DELETE',
    })
  },
  saveRoute(payload: SaveRouteRequestDto) {
    return request('/profile/routes/saved', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },
  shareRoute(payload: ShareRouteRequestDto) {
    return request<ShareRouteDto>(`/routes/${payload.slug}/share`, {
      method: 'POST',
    })
  },
  signIn(payload: SignInRequestDto) {
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
