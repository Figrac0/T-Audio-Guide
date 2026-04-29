import {
  clearAuthTokens,
  request,
  writeAuthTokens,
} from '@/shared/api/http'
import type {
  AuthResponseDto,
  ChangePasswordRequestDto,
  RegisterRequestDto,
  SessionDto,
  SignInRequestDto,
  UserProfileDto,
} from '@/shared/api/contracts'

export const authService = {
  async changePassword(payload: ChangePasswordRequestDto) {
    await request<void>('/auth/change-password', {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  },

  async login(payload: SignInRequestDto) {
    const response = await request<AuthResponseDto>('/auth/login', {
      body: JSON.stringify(payload),
      method: 'POST',
    })

    return createAuthenticatedSession(response)
  },

  async logout() {
    await request<void>('/auth/logout', {
      method: 'POST',
    }).catch(() => undefined)
    clearAuthTokens()
    return createGuestSession()
  },

  async register(payload: RegisterRequestDto) {
    const response = await request<AuthResponseDto>('/auth/registration', {
      body: JSON.stringify(payload),
      method: 'POST',
    })

    return createAuthenticatedSession(response)
  },
}

function createAuthenticatedSession(response: AuthResponseDto): SessionDto {
  const tokens = response.tokens ?? (
    response.accessToken && response.refreshToken
      ? {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        }
      : null
  )

  if (tokens) {
    writeAuthTokens(tokens)
  }

  return {
    isAuthenticated: true,
    profile: normalizeProfile(response.profile ?? response.user),
  }
}

function createGuestSession(): SessionDto {
  return {
    isAuthenticated: false,
    profile: null,
  }
}

function normalizeProfile(profile: AuthResponseDto['profile'] | AuthResponseDto['user']): UserProfileDto {
  if (!profile) {
    throw new Error('Профиль не найден в ответе сервера.')
  }

  const language = 'language' in profile ? profile.language : profile.lang

  return {
    email: profile.email,
    id: profile.id,
    lang: language,
    language,
    name: profile.name,
    role: profile.role,
    username: 'username' in profile ? profile.username : undefined,
  }
}
