import type { SupportedLocale } from '@/entities/excursion/model/types'
import { request } from '@/shared/api/http'
import type {
  BackendUserDto,
  UpdateProfileRequestDto,
  UserProfileDto,
  UserRole,
} from '@/shared/api/contracts'

export const profileService = {
  async getProfile() {
    const response = await request<BackendUserDto | UserProfileDto>('/profile')
    return normalizeProfile(response)
  },

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
  // Backend sends lang as "RU" (uppercase) and role as "USER" (uppercase)
  const rawLang = 'language' in profile ? profile.language : profile.lang
  const language = (rawLang?.toLowerCase() ?? 'ru') as SupportedLocale

  return {
    email: profile.email,
    id: String(profile.id),  // backend sends int64 (number)
    lang: language,
    language,
    name: profile.name,
    phone: 'phone' in profile ? profile.phone : undefined,
    role: (profile.role?.toLowerCase() ?? 'user') as UserRole,
    username: 'username' in profile ? profile.username : undefined,
  }
}
