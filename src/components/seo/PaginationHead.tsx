import { Helmet } from "react-helmet-async"
import { usePaginationSeo } from "@/hooks/usePaginationSeo"

interface PaginationHeadProps {
  currentPage: number
  totalPages: number
  basePath: string
  /** When false, only emits noindex for deep pages (skips canonical/prev/next). Use for filtered views. */
  includeLinks?: boolean
}

export default function PaginationHead({
  currentPage,
  totalPages,
  basePath,
  includeLinks = true,
}: PaginationHeadProps) {
  const { canonicalUrl, prevUrl, nextUrl, noindex } = usePaginationSeo({
    currentPage,
    totalPages,
    basePath,
  })

  return (
    <Helmet>
      {includeLinks && <link rel="canonical" href={canonicalUrl} />}
      {includeLinks && prevUrl && <link rel="prev" href={prevUrl} />}
      {includeLinks && nextUrl && <link rel="next" href={nextUrl} />}
      {noindex && <meta name="robots" content="noindex, follow" />}
    </Helmet>
  )
}
