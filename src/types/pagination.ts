export type SortDirection = 'asc' | 'desc'

export type PaginationParams = {
  page?: number
  pageSize?: number
  sortBy?: string
  sortDirection?: SortDirection
}

export type PaginatedResult<T> = {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export function clampPage(value: unknown) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function clampPageSize(value: unknown) {
  const pageSize = Number(value)
  if (!Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE)
}

export function getPaginationRange(page: number, pageSize: number) {
  const safePage = clampPage(page)
  const safePageSize = clampPageSize(pageSize)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1
  return { from, to }
}

export function createPaginatedResult<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
): PaginatedResult<T> {
  const safePageSize = clampPageSize(pageSize)
  const safeTotal = Math.max(Number(total) || 0, 0)
  return {
    data,
    page: clampPage(page),
    pageSize: safePageSize,
    total: safeTotal,
    totalPages: Math.max(Math.ceil(safeTotal / safePageSize), 1),
  }
}

export function createEmptyPaginatedResult<T>(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): PaginatedResult<T> {
  return createPaginatedResult<T>([], page, pageSize, 0)
}
