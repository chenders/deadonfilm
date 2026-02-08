const BASE_URL = "https://deadonfilm.com"
const NOINDEX_THRESHOLD = 20

export function buildPageUrl(basePath: string, page: number): string {
  const url = `${BASE_URL}${basePath}`
  return page <= 1 ? url : `${url}?page=${page}`
}

interface UsePaginationSeoOptions {
  currentPage: number
  totalPages: number
  basePath: string
}

interface PaginationSeo {
  canonicalUrl: string
  prevUrl: string | null
  nextUrl: string | null
  noindex: boolean
}

export function usePaginationSeo({
  currentPage,
  totalPages,
  basePath,
}: UsePaginationSeoOptions): PaginationSeo {
  const safeTotal = Number.isFinite(totalPages) ? Math.max(1, totalPages) : 1
  const safePage = Number.isFinite(currentPage) ? Math.max(1, Math.min(currentPage, safeTotal)) : 1

  const canonicalUrl = buildPageUrl(basePath, safePage)

  const prevUrl = safePage > 1 ? buildPageUrl(basePath, safePage - 1) : null

  const nextUrl = safePage < safeTotal ? buildPageUrl(basePath, safePage + 1) : null

  const noindex = safePage > NOINDEX_THRESHOLD

  return { canonicalUrl, prevUrl, nextUrl, noindex }
}
