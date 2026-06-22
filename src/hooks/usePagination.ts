import { useCallback, useState } from 'react'
import { clampPage, clampPageSize, DEFAULT_PAGE_SIZE, type SortDirection } from '../types/pagination'

type UsePaginationOptions = {
  initialPage?: number
  initialPageSize?: number
  initialSortBy?: string
  initialSortDirection?: SortDirection
}

export function usePagination({
  initialPage = 1,
  initialPageSize = DEFAULT_PAGE_SIZE,
  initialSortBy = 'created_at',
  initialSortDirection = 'desc',
}: UsePaginationOptions = {}) {
  const [page, setPageState] = useState(() => clampPage(initialPage))
  const [pageSize, setPageSizeState] = useState(() => clampPageSize(initialPageSize))
  const [sortBy, setSortByState] = useState(initialSortBy)
  const [sortDirection, setSortDirectionState] = useState<SortDirection>(initialSortDirection)

  const setPage = useCallback((value: number) => {
    setPageState(clampPage(value))
  }, [])

  const setPageSize = useCallback((value: number) => {
    setPageSizeState(clampPageSize(value))
    setPageState(1)
  }, [])

  const resetPage = useCallback(() => {
    setPageState(1)
  }, [])

  const setSort = useCallback((nextSortBy: string) => {
    setSortByState((currentSortBy) => {
      setPageState(1)
      if (currentSortBy === nextSortBy) {
        setSortDirectionState((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
        return currentSortBy
      }

      setSortDirectionState('desc')
      return nextSortBy
    })
  }, [])

  return {
    page,
    pageSize,
    resetPage,
    setPage,
    setPageSize,
    setSort,
    setSortBy: setSortByState,
    setSortDirection: setSortDirectionState,
    sortBy,
    sortDirection,
  }
}
