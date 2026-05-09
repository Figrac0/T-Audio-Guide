import { request } from '@/shared/api/http'
import type {
  ApiExcursionDetail,
  ApiExcursionListResponse,
} from '@/shared/api/mappers'

interface ExcursionsSearchParams {
  location: { latitude: number; longitude: number }
  radiusKilometers: number
  categoryIds?: number[]
  visitTime?: number
}

// Swagger CreateCustomExcursionRequest:
//   { title, description, shortDescription?, visibility?, points }
// where order in points is 1-based (per swagger example: { pointId: 1, order: 1 }).
interface CreateExcursionParams {
  title: string
  description: string
  shortDescription?: string
  visibility?: 'PUBLIC' | 'PRIVATE'
  points?: Array<{ pointId: number; order: number }>
}

// Swagger UpdateCustomExcursionRequest — partial update of own excursion.
interface UpdateExcursionParams {
  title?: string
  description?: string
  shortDescription?: string
  visibility?: 'PUBLIC' | 'PRIVATE'
}

// Swagger SetExcursionPointsRequest — replaces the entire point list.
interface SetExcursionPointsParams {
  points: Array<{ pointId: number; order: number }>
}

export const excursionsService = {
  /** POST /excursions/search → ExcursionListResponse { excursions: ExcursionShortItem[] } */
  async searchExcursions(params: ExcursionsSearchParams) {
    const response = await request<ApiExcursionListResponse>('/excursions/search', {
      body: JSON.stringify(params),
      method: 'POST',
    })
    return response.excursions ?? []
  },

  /** GET /excursions/{excursionId} → ExcursionDetailResponse */
  async getExcursionById(id: number | string): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>(`/excursions/${id}`)
  },

  /** POST /excursions → ExcursionDetailResponse */
  async createExcursion(params: CreateExcursionParams): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>('/excursions', {
      body: JSON.stringify(params),
      method: 'POST',
    })
  },

  /** PUT /excursions/{excursionId}/points — replace the route's point set */
  async setExcursionPoints(
    id: number | string,
    params: SetExcursionPointsParams,
  ): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>(`/excursions/${id}/points`, {
      body: JSON.stringify(params),
      method: 'PUT',
    })
  },

  /** PATCH /excursions/{excursionId} — partial update of own excursion */
  async updateExcursion(
    id: number | string,
    params: UpdateExcursionParams,
  ): Promise<ApiExcursionDetail> {
    return request<ApiExcursionDetail>(`/excursions/${id}`, {
      body: JSON.stringify(params),
      method: 'PATCH',
    })
  },

  /** DELETE /excursions/{excursionId} */
  async deleteExcursion(id: number | string): Promise<void> {
    return request<void>(`/excursions/${id}`, { method: 'DELETE' })
  },

  /** POST /excursions/{excursionId}/favorite (returns 204) */
  async addFavorite(id: number | string): Promise<void> {
    return request<void>(`/excursions/${id}/favorite`, { method: 'POST' })
  },

  /** POST /excursions/{excursionId}/unfavorite (returns 204) */
  async removeFavorite(id: number | string): Promise<void> {
    return request<void>(`/excursions/${id}/unfavorite`, { method: 'POST' })
  },

  /** GET /excursions/my?page=&size= — custom excursions created by current user */
  async getMyExcursions(
    pagination?: { page?: number; size?: number },
  ): Promise<ApiExcursionListResponse> {
    const params = buildPaginationQuery(pagination)
    return request<ApiExcursionListResponse>(`/excursions/my${params}`)
  },

  /** GET /excursions/favorites?page=&size= — favorited excursions */
  async getFavoriteExcursions(
    pagination?: { page?: number; size?: number },
  ): Promise<ApiExcursionListResponse> {
    const params = buildPaginationQuery(pagination)
    return request<ApiExcursionListResponse>(`/excursions/favorites${params}`)
  },
}

function buildPaginationQuery(pagination?: { page?: number; size?: number }): string {
  if (!pagination) return ''
  const search = new URLSearchParams()
  if (pagination.page != null) search.set('page', String(pagination.page))
  if (pagination.size != null) search.set('size', String(pagination.size))
  const query = search.toString()
  return query ? `?${query}` : ''
}
