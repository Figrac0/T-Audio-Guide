import { useCallback, useEffect, useRef, useState } from 'react'

interface PagedFetcher<T> {
  (params: { page: number; size: number; search?: string }): Promise<{
    items: T[]
    page: number
    size: number
    totalElements: number
    totalPages: number
  }>
}

interface UsePagedListResult<T> {
  items: T[]
  page: number
  totalPages: number
  totalElements: number
  size: number
  search: string
  isLoading: boolean
  error: string | null
  setPage: (page: number) => void
  setSearch: (search: string) => void
  refresh: () => void
}

const DEFAULT_PAGE_SIZE = 20

export function usePagedList<T>(fetcher: PagedFetcher<T>): UsePagedListResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(0)
  const [size] = useState(DEFAULT_PAGE_SIZE)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [search, setSearchState] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Debounce search to avoid one request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(id)
  }, [search])

  // Reset to page 0 when search changes (otherwise we'd be paginating against
  // a filtered list that may have fewer pages than current `page`).
  const lastSearchRef = useRef(debouncedSearch)
  useEffect(() => {
    if (lastSearchRef.current !== debouncedSearch) {
      lastSearchRef.current = debouncedSearch
      setPage(0)
    }
  }, [debouncedSearch])

  // Keep latest fetcher in a ref so changing the fetcher reference doesn't
  // cancel the in-flight request via the useEffect dep array.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)
    fetcherRef.current({ page, size, search: debouncedSearch || undefined })
      .then((response) => {
        if (!active) return
        setItems(response.items)
        setTotalPages(response.totalPages)
        setTotalElements(response.totalElements)
      })
      .catch((fetchError: unknown) => {
        if (!active) return
        setError(
          fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить список.',
        )
        setItems([])
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [page, size, debouncedSearch, refreshKey])

  const setSearch = useCallback((value: string) => {
    setSearchState(value)
  }, [])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return {
    items,
    page,
    totalPages,
    totalElements,
    size,
    search,
    isLoading,
    error,
    setPage,
    setSearch,
    refresh,
  }
}
