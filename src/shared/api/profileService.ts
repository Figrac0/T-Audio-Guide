import { request } from '@/shared/api/http'
import type {
  BackendUserDto,
  UpdateProfileRequestDto,
  UserProfileDto,
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
        lang: payload.language,
        name: payload.name,
      }),
      method: 'PATCH',
    })

    return normalizeProfile(response)
  },
}

function normalizeProfile(profile: BackendUserDto | UserProfileDto): UserProfileDto {
  const language = 'language' in profile ? profile.language : profile.lang

  return {
    email: profile.email,
    id: profile.id,
    lang: language,
    language,
    name: profile.name,
    phone: 'phone' in profile ? profile.phone : undefined,
    role: profile.role,
    username: 'username' in profile ? profile.username : undefined,
  }
}
