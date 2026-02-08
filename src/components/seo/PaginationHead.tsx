import { Helmet } from "react-helmet-async"
import { usePaginationSeo } from "@/hooks/usePaginationSeo"

interface PaginationHeadProps {
  currentPage: number
  totalPages: number
  basePath: string
}

export default function PaginationHead({ currentPage, totalPages, basePath }: PaginationHeadProps) {
  const { canonicalUrl, prevUrl, nextUrl, noindex } = usePaginationSeo({
    currentPage,
    totalPages,
    basePath,
  })

  return (
    <Helmet>
      <link rel="canonical" href={canonicalUrl} />
      {prevUrl && <link rel="prev" href={prevUrl} />}
      {nextUrl && <link rel="next" href={nextUrl} />}
      {noindex && <meta name="robots" content="noindex, follow" />}
    </Helmet>
  )
}
