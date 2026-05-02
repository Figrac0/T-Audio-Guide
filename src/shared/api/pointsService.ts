import { request } from '@/shared/api/http'
import type {
  ApiCategoryListResponse,
  ApiPointDetail,
  ApiPointListResponse,
} from '@/shared/api/mappers'

interface PointsSearchParams {
  location: { latitude: number; longitude: number }
  radiusKilometers: number
  categorySlugs?: string[]
  visitTime?: number
}

export const pointsService = {
  /** POST /points/search → PointListResponse { points: PointShortItem[] } */
  async searchPoints(params: PointsSearchParams) {
    const response = await request<ApiPointListResponse>('/points/search', {
      body: JSON.stringify(params),
      method: 'POST',
    })
    return response.points ?? []
  },

  /** GET /points/{pointId} → PointDetailResponse */
  async getPointDetail(id: number | string): Promise<ApiPointDetail> {
    return request<ApiPointDetail>(`/points/${id}`)
  },

  /** GET /points/categories → CategoryListResponse { categories: CategoryItem[] } */
  async getCategories() {
    const response = await request<ApiCategoryListResponse>('/points/categories')
    return response.categories ?? []
  },
}
