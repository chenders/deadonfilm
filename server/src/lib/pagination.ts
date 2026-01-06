/**
 * Pagination utilities for API route handlers.
 */

export interface PaginationInfo {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/**
 * Parse page number from request query string.
 * Returns at least 1 (minimum valid page).
 */
export function parsePage(queryPage: string | undefined): number {
  return Math.max(1, parseInt(queryPage as string) || 1)
}

/**
 * Parse page size from request query string with bounds.
 * @param queryPageSize - Raw query string value
 * @param defaultSize - Default page size (default: 50)
 * @param maxSize - Maximum allowed page size (default: 100)
 */
export function parsePageSize(
  queryPageSize: string | undefined,
  defaultSize = 50,
  maxSize = 100
): number {
  const parsed = parseInt(queryPageSize as string, 10) || defaultSize
  return Math.min(maxSize, Math.max(1, parsed))
}

/**
 * Calculate offset for SQL OFFSET clause.
 */
export function calculateOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize
}

/**
 * Build a complete pagination info object.
 * @param page - Current page number (1-indexed)
 * @param pageSize - Items per page
 * @param totalCount - Total number of items
 * @param maxPages - Optional cap on total pages (for performance reasons)
 */
export function buildPagination(
  page: number,
  pageSize: number,
  totalCount: number,
  maxPages?: number
): PaginationInfo {
  const calculatedPages = Math.ceil(totalCount / pageSize)
  const totalPages = maxPages ? Math.min(calculatedPages, maxPages) : calculatedPages

  return {
    page,
    pageSize,
    totalCount,
    totalPages,
  }
}

/**
 * Create an empty pagination object for when no results are available.
 */
export function emptyPagination(pageSize = 50): PaginationInfo {
  return {
    page: 1,
    pageSize,
    totalCount: 0,
    totalPages: 0,
  }
}
