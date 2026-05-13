import type { SupportedLocale } from '@/entities/excursion/model/types'
import { request } from '@/shared/api/http'
import type {
  BackendUserDto,
  UpdateProfileRequestDto,
  UserProfileDto,
  UserRole,
} from '@/shared/api/contracts'

export const profileService = {
  /** GET /profile → UserResponse */
  async getProfile() {
    const response = await request<BackendUserDto | UserProfileDto>('/profile')
    return normalizeProfile(response)
  },

  /**
   * PATCH /profile → UserResponse
   *
   * Swagger PatchUserRequest only accepts { email, name, lang }. Lang is
   * upper-cased for the backend (the wire format is "RU"/"EN").
   */
  async updateProfile(payload: UpdateProfileRequestDto) {
    const response = await request<BackendUserDto | UserProfileDto>('/profile', {
      body: JSON.stringify({
        email: payload.email,
        lang: payload.language.toUpperCase(),
        name: payload.name,
      }),
      method: 'PATCH',
    })

    return normalizeProfile(response)
  },
}

function normalizeProfile(profile: BackendUserDto | UserProfileDto): UserProfileDto {
  // Backend sends lang as "RU" (uppercase) and role as "USER" (uppercase);
  // normalize both to internal lowercase form.
  const rawLang =
    ('language' in profile && profile.language) ||
    ('lang' in profile && profile.lang) ||
    'ru'
  const language = (
    typeof rawLang === 'string' ? rawLang.toLowerCase() : 'ru'
  ) as SupportedLocale

  return {
    email: profile.email,
    id: String(profile.id),
    lang: language,
    language,
    name: profile.name,
    role: (
      typeof profile.role === 'string' ? profile.role.toLowerCase() : 'user'
    ) as UserRole,
  }
}
