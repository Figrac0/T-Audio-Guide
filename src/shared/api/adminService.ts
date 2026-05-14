import { readAuthTokens, request } from '@/shared/api/http'
import type {
  ApiCategory,
  ApiCategoryListResponse,
  ApiExcursionDetail,
  ApiPointDetail,
} from '@/shared/api/mappers'

// ── Pagination ──────────────────────────────────────────────────────────────

export interface PageParams {
  page?: number
  size?: number
  sortBy?: string
  sortDirection?: 'ASC' | 'DESC'
  search?: string
}

interface PageMeta {
  page: number
  size: number
  totalElements: number
  totalPages: number
}

function buildPageQuery(params?: PageParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.page != null) search.set('page', String(params.page))
  if (params.size != null) search.set('size', String(params.size))
  if (params.sortBy) search.set('sortBy', params.sortBy)
  if (params.sortDirection) search.set('sortDirection', params.sortDirection)
  if (params.search) search.set('search', params.search)
  const query = search.toString()
  return query ? `?${query}` : ''
}

// ── Categories ──────────────────────────────────────────────────────────────

export interface CategoryRequest {
  name: string
  slug: string
}

// ── Points ──────────────────────────────────────────────────────────────────

export interface CreatePointParams {
  title: string
  description?: string
  shortDescription?: string
  categoryId: number
  address?: string
  coordinates: { latitude: number; longitude: number }
  visitTime?: number
  workingHours?: string
  active?: boolean
}

export interface PatchPointParams {
  title?: string
  description?: string
  shortDescription?: string
  categoryId?: number
  address?: string
  coordinates?: { latitude: number; longitude: number }
  visitTime?: number
  workingHours?: string
  active?: boolean
}

export interface AdminPointShortItem {
  id: number
  title: string
  categoryId: number
  categoryName: string
  visitTime?: number
  createdAt: string
  active: boolean
}

export interface AdminPointPageResponse extends PageMeta {
  points: AdminPointShortItem[]
}

export type MediaType = 'PHOTO' | 'VIDEO' | 'AUDIO'

export interface AdminPointMediaItem {
  id: number
  url: string
  type: MediaType | string
  sortOrder: number
  // Backend may send null for points without transcript (photos/videos).
  transcript?: string | null
  createdAt: string
}

export interface UploadMediaMetadata {
  type: MediaType
  sortOrder: number
  transcript?: string
}

// ── Excursions ──────────────────────────────────────────────────────────────

export interface CreatePrebuiltExcursionParams {
  title: string
  description?: string
  shortDescription?: string
  visibility: 'PUBLIC' | 'PRIVATE'
  points: Array<{ pointId: number; order: number }>
}

export interface PatchPrebuiltExcursionParams {
  title?: string
  description?: string
  shortDescription?: string
  visibility?: 'PUBLIC' | 'PRIVATE'
}

export interface AdminExcursionShortItem {
  id: number
  routeType: 'PREBUILT' | 'CUSTOM' | string
  visibility: 'PUBLIC' | 'PRIVATE' | string
  title: string
  description?: string
  shortDescription?: string
  distance?: number
  durationMin?: number
  pointsCount?: number
  coordinates?: { latitude: number; longitude: number }
  categoryIds?: number[]
  rating?: number
  reviewsCount?: number
  owner?: boolean
}

export interface AdminExcursionPageResponse extends PageMeta {
  excursions: AdminExcursionShortItem[]
}

// ── Users ───────────────────────────────────────────────────────────────────

export interface AdminUserShortItem {
  id: number
  email: string
  role: string
  createdAt: string
  active: boolean
}

export interface AdminUserDetailResponse {
  id: number
  email: string
  name: string
  lang: string
  role: string
  createdAt: string
  updatedAt: string
  active: boolean
}

export interface AdminUserPageResponse extends PageMeta {
  users: AdminUserShortItem[]
}

export interface PatchUserParams {
  email?: string
  lang?: string
  role?: 'USER' | 'ADMIN'
  active?: boolean
}

// ── Multipart upload helper ─────────────────────────────────────────────────
// `request()` always sets Content-Type: application/json, which breaks
// multipart uploads. For media uploads we have to talk to fetch directly.

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api').replace(/\/$/, '')

async function multipartUpload<T>(path: string, formData: FormData): Promise<T> {
  const tokens = readAuthTokens()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    try {
      const body = JSON.parse(text) as { message?: string; error?: string }
      const message = body.message || body.error
      if (message) throw new Error(message)
    } catch (parseError) {
      if (parseError instanceof SyntaxError === false) throw parseError
    }
    throw new Error(`HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

// ── Service ─────────────────────────────────────────────────────────────────

export const adminService = {
  // ── Categories ──────────────────────────────────────────────────────────

  async listCategories(): Promise<ApiCategory[]> {
    const response = await request<ApiCategoryListResponse>('/admin/categories')
    return response.categories ?? []
  },

  createCategory(params: CategoryRequest): Promise<ApiCategory> {
    return request<ApiCategory>('/admin/categories', {
      body: JSON.stringify(params),
      method: 'POST',
    })
  },

  patchCategory(id: number, params: Partial<CategoryRequest>): Promise<ApiCategory> {
    return request<ApiCategory>(`/admin/categories/${id}`, {
      body: JSON.stringify(params),
      method: 'PATCH',
    })
  },

  deleteCategory(id: number): Promise<void> {
    return request<void>(`/admin/categories/${id}`, { method: 'DELETE' })
  },

  // ── Points ──────────────────────────────────────────────────────────────

  createPoint(params: CreatePointParams): Promise<ApiPointDetail> {
    return request<ApiPointDetail>('/admin/points', {
      body: JSON.stringify(params),
      method: 'POST',
    })
  },

  getPoint(id: number): Promise<ApiPointDetail> {
    return request<ApiPointDetail>(`/admin/points/${id}`)
  },

  patchPoint(id: number, params: PatchPointParams): Promise<ApiPointDetail> {
    return request<ApiPointDetail>(`/admin/points/${id}`, {
      body: JSON.stringify(params),
      method: 'PATCH',
    })
  },

  deletePoint(id: number): Promise<void> {
    return request<void>(`/admin/points/${id}`, { method: 'DELETE' })
  },

  listPointsPage(params?: PageParams): Promise<AdminPointPageResponse> {
    return request<AdminPointPageResponse>(`/admin/points/page${buildPageQuery(params)}`)
  },

  uploadPointMedia(
    pointId: number,
    file: File,
    metadata: UploadMediaMetadata,
  ): Promise<AdminPointMediaItem> {
    const fd = new FormData()
    fd.append('file', file)
    // Backend expects metadata as JSON blob with Content-Type application/json
    // inside multipart — most Spring backends accept either Blob or string.
    fd.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
    )
    return multipartUpload<AdminPointMediaItem>(`/admin/points/${pointId}/media`, fd)
  },

  patchPointMedia(
    pointId: number,
    mediaId: number,
    transcript: string,
  ): Promise<AdminPointMediaItem> {
    return request<AdminPointMediaItem>(`/admin/points/${pointId}/media/${mediaId}`, {
      body: JSON.stringify({ transcript }),
      method: 'PATCH',
    })
  },

  deletePointMedia(pointId: number, mediaId: number): Promise<void> {
    return request<void>(`/admin/points/${pointId}/media/${mediaId}`, { method: 'DELETE' })
  },

  // ── Excursions ──────────────────────────────────────────────────────────

  createPrebuiltExcursion(params: CreatePrebuiltExcursionParams): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>('/admin/excursions', {
      body: JSON.stringify(params),
      method: 'POST',
    })
  },

  getExcursion(id: number): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>(`/admin/excursions/${id}`)
  },

  patchExcursion(id: number, params: PatchPrebuiltExcursionParams): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>(`/admin/excursions/${id}`, {
      body: JSON.stringify(params),
      method: 'PATCH',
    })
  },

  deleteExcursion(id: number): Promise<void> {
    return request<void>(`/admin/excursions/${id}`, { method: 'DELETE' })
  },

  setExcursionPoints(
    id: number,
    points: Array<{ pointId: number; order: number }>,
  ): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>(`/admin/excursions/${id}/points`, {
      body: JSON.stringify({ points }),
      method: 'PUT',
    })
  },

  listExcursionsPage(params?: PageParams): Promise<AdminExcursionPageResponse> {
    return request<AdminExcursionPageResponse>(`/admin/excursions/page${buildPageQuery(params)}`)
  },

  // ── Users ───────────────────────────────────────────────────────────────

  getUser(id: number): Promise<AdminUserDetailResponse> {
    return request<AdminUserDetailResponse>(`/admin/users/${id}`)
  },

  patchUser(id: number, params: PatchUserParams): Promise<AdminUserDetailResponse> {
    return request<AdminUserDetailResponse>(`/admin/users/${id}`, {
      body: JSON.stringify(params),
      method: 'PATCH',
    })
  },

  listUsersPage(params?: PageParams): Promise<AdminUserPageResponse> {
    return request<AdminUserPageResponse>(`/admin/users/page${buildPageQuery(params)}`)
  },
}
