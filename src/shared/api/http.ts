import type { AuthTokensDto } from '@/shared/api/contracts'

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api')
  .replace(/\/$/, '')

const authTokensStorageKey = 't-guide:auth:tokens'

export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithAuth(path, init)

  if (response.status === 401 && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken()

    if (refreshed) {
      const retryResponse = await fetchWithAuth(path, init)
      return parseResponse<T>(retryResponse)
    }
  }

  return parseResponse<T>(response)
}

export function readAuthTokens(): AuthTokensDto | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(authTokensStorageKey)

    if (!rawValue) {
      return null
    }

    return parseAuthTokens(JSON.parse(rawValue))
  } catch {
    clearAuthTokens()
    return null
  }
}

export function writeAuthTokens(tokens: AuthTokensDto | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!tokens) {
    clearAuthTokens()
    return
  }

  window.localStorage.setItem(authTokensStorageKey, JSON.stringify(tokens))
}

export function clearAuthTokens() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(authTokensStorageKey)
}

async function fetchWithAuth(path: string, init?: RequestInit) {
  const tokens = readAuthTokens()
  const headers = new Headers(init?.headers)

  headers.set('Content-Type', 'application/json')

  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`)
  }

  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  })
}

async function refreshAccessToken() {
  const tokens = readAuthTokens()

  if (!tokens?.refreshToken) {
    return false
  }

  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    method: 'POST',
  })

  if (!response.ok) {
    clearAuthTokens()
    return false
  }

  const payload = (await response.json()) as unknown
  const nextTokens = parseAuthTokens(payload)

  if (!nextTokens) {
    clearAuthTokens()
    return false
  }

  writeAuthTokens(nextTokens)
  return true
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()

  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

function parseAuthTokens(value: unknown): AuthTokensDto | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Partial<AuthTokensDto> & { tokens?: Partial<AuthTokensDto> }
  const accessToken = payload.accessToken ?? payload.tokens?.accessToken
  const refreshToken = payload.refreshToken ?? payload.tokens?.refreshToken

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return null
  }

  return {
    accessToken,
    refreshToken,
  }
}
