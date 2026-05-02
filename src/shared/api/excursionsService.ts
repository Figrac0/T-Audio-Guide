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

interface CreateExcursionParams {
  title: string
  description: string
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

  /** DELETE /excursions/{excursionId} */
  async deleteExcursion(id: number | string): Promise<void> {
    return request<void>(`/excursions/${id}`, { method: 'DELETE' })
  },

  /** POST /excursions/{excursionId}/favorite */
  async addFavorite(id: number | string): Promise<void> {
    return request<void>(`/excursions/${id}/favorite`, { method: 'POST' })
  },

  /** POST /excursions/{excursionId}/unfavorite */
  async removeFavorite(id: number | string): Promise<void> {
    return request<void>(`/excursions/${id}/unfavorite`, { method: 'POST' })
  },

  /** GET /excursions/my — custom excursions created by current user */
  async getMyExcursions(): Promise<ApiExcursionListResponse> {
    return request<ApiExcursionListResponse>('/excursions/my')
  },

  /** GET /excursions/favorites — excursions the user has favorited */
  async getFavoriteExcursions(): Promise<ApiExcursionListResponse> {
    return request<ApiExcursionListResponse>('/excursions/favorites')
  },
}
