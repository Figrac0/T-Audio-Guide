import type {
  Excursion,
  GeoPoint,
  NearbyPoint,
  PointCategory,
  SupportedLocale,
} from '@/entities/excursion/model/types'

export type UserRole = 'guest' | 'user' | 'admin'

// Matches swagger UserResponse: { id, email, name, lang, role }
export interface BackendUserDto {
  id: string | number
  email: string
  name: string
  lang: SupportedLocale
  role: UserRole
}

export interface UserProfileDto {
  id: string
  name: string
  email: string
  // Always present internally; `lang` mirrors `language` for back-compat with
  // older components that read either field.
  lang?: SupportedLocale
  language: SupportedLocale
  role: UserRole
}

export interface AuthTokensDto {
  accessToken: string
  refreshToken: string
}

export interface AuthResponseDto {
  accessToken?: string
  refreshToken?: string
  tokens?: AuthTokensDto
  user?: BackendUserDto
  profile?: UserProfileDto
}

export interface SessionDto {
  isAuthenticated: boolean
  profile: UserProfileDto | null
}

export interface SignInRequestDto {
  login: string
  password: string
}

export interface RequestPasswordResetRequestDto {
  login: string
}

export interface ChangePasswordRequestDto {
  oldPassword: string
  newPassword: string
}

// Backend RegistrationRequest accepts only: email, name, password, lang.
// `phone` is kept here so existing UI forms still compile, but it's never
// sent to the backend (silently dropped at the service layer).
export interface RegisterRequestDto {
  name: string
  phone?: string
  email: string
  password: string
  language: SupportedLocale
}

export interface UpdateProfileRequestDto {
  name: string
  email: string
  language: SupportedLocale
}

export interface SaveRouteRequestDto {
  route: Excursion
}

export interface RemoveSavedRouteRequestDto {
  slug: string
}

export interface CreatePersonalRouteRequestDto {
  route: Excursion
}

export interface ShareRouteRequestDto {
  slug: string
}

export interface ShareRouteDto {
  url: string
}

export interface RouteHistoryItemDto {
  id: string
  route: Excursion
  progressPercent: number
  completedAt: string | null
  startedAt: string
  status: 'active' | 'completed'
}

export interface ProfileOverviewDto {
  profile: UserProfileDto
  savedRoutes: Excursion[]
  personalRoutes: Excursion[]
  routeHistory: RouteHistoryItemDto[]
}

export interface DiscoveryFeedRequest {
  center: GeoPoint
  locale: SupportedLocale
  radiusMeters: number
  // Either a backend category id (preferred — exact match), or a legacy
  // frontend slug for backwards compat with older callers. `'all'` disables
  // category filtering.
  category: PointCategory | 'all' | number
  search?: string
}

export interface DiscoveryFeedDto {
  appliedCategory: PointCategory | 'all' | number
  appliedRadiusMeters: number
  center: GeoPoint
  excursions: Excursion[]
  nearbyPoints: NearbyPoint[]
}

export interface RouteCatalogRequest {
  center: GeoPoint
  locale: SupportedLocale
  radiusMeters: number
  category: PointCategory | 'all' | number
}

export interface RouteDetailsRequest {
  center: GeoPoint
  locale: SupportedLocale
  radiusMeters: number
  category: PointCategory | 'all' | number
  slug: string
}

export interface FrontendApi {
  changePassword(request: ChangePasswordRequestDto): Promise<void>
  createPersonalRoute(request: CreatePersonalRouteRequestDto): Promise<Excursion>
  getDiscoveryFeed(request: DiscoveryFeedRequest): Promise<DiscoveryFeedDto>
  getProfileOverview(): Promise<ProfileOverviewDto>
  getRouteBySlug(request: RouteDetailsRequest): Promise<Excursion | null>
  getRoutesCatalog(request: RouteCatalogRequest): Promise<Excursion[]>
  getSession(): Promise<SessionDto>
  requestPasswordReset(request: RequestPasswordResetRequestDto): Promise<void>
  register(request: RegisterRequestDto): Promise<SessionDto>
  removeSavedRoute(request: RemoveSavedRouteRequestDto): Promise<void>
  saveRoute(request: SaveRouteRequestDto): Promise<Excursion>
  shareRoute(request: ShareRouteRequestDto): Promise<ShareRouteDto>
  signIn(request: SignInRequestDto): Promise<SessionDto>
  signOut(): Promise<SessionDto>
  updateProfile(request: UpdateProfileRequestDto): Promise<UserProfileDto>
}
