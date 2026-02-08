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
  const canonicalUrl = buildPageUrl(basePath, currentPage)

  const prevUrl = currentPage > 1 ? buildPageUrl(basePath, currentPage - 1) : null

  const nextUrl = currentPage < totalPages ? buildPageUrl(basePath, currentPage + 1) : null

  const noindex = currentPage > NOINDEX_THRESHOLD

  return { canonicalUrl, prevUrl, nextUrl, noindex }
}
