import { useParams, useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useCauseCategoryDetail } from "@/hooks/useCausesOfDeath"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import { NotableActorCard, DecadeChart, CauseActorRow } from "@/components/causes"
import type { SpecificCauseStats } from "@/types"

function SpecificCauseList({
  causes,
  categorySlug,
}: {
  causes: SpecificCauseStats[]
  categorySlug: string
}) {
  if (causes.length === 0) return null

  return (
    <div className="space-y-1">
      {causes.map((cause) => (
        <Link
          key={cause.slug}
          to={`/causes-of-death/${categorySlug}/${cause.slug}`}
          className="flex items-center justify-between rounded p-2 text-sm transition-colors hover:bg-cream"
        >
          <span className="truncate text-brown-dark">{cause.cause}</span>
          <span className="shrink-0 text-text-muted">
            {cause.count} · Avg {Math.round(cause.avgAge || 0)}
          </span>
        </Link>
      ))}
    </div>
  )
}

export default function CauseCategoryPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useCauseCategoryDetail(categorySlug || "", {
    page,
    includeObscure,
  })

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    if (newPage > 1) {
      newParams.set("page", String(newPage))
    } else {
      newParams.delete("page")
    }
    setSearchParams(newParams)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const toggleIncludeObscure = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams)
    if (checked) {
      newParams.set("includeObscure", "true")
    } else {
      newParams.delete("includeObscure")
    }
    newParams.delete("page")
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading category..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Category not found" />
  }

  const baseOffset = (page - 1) * data.pagination.pageSize

  return (
    <>
      <Helmet>
        <title>{data.label} Deaths - Dead on Film</title>
        <meta
          name="description"
          content={`${data.count.toLocaleString()} actors who died from ${data.label.toLowerCase()}. Average age at death: ${data.avgAge ? Math.round(data.avgAge) : "unknown"}.`}
        />
        <meta property="og:title" content={`${data.label} Deaths - Dead on Film`} />
        <meta
          property="og:description"
          content={`Explore ${data.count.toLocaleString()} actors who died from ${data.label.toLowerCase()}`}
        />
      </Helmet>
      <PaginationHead
        currentPage={page}
        totalPages={data.pagination.totalPages}
        basePath={`/causes-of-death/${data.slug}`}
        includeLinks={!includeObscure}
      />

      <div data-testid="cause-category-page" className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link to="/causes-of-death" className="text-sm text-brown-medium hover:text-brown-dark">
            &larr; Causes of Death
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">{data.label}</h1>
          <p className="text-text-muted">
            {data.count.toLocaleString()} actors ({data.percentage.toFixed(1)}% of known causes)
          </p>
        </div>

        {/* Stats Panel */}
        <div className="mb-8 grid gap-4 rounded-lg bg-beige p-4 sm:grid-cols-3">
          <div className="text-center">
            <p className="font-display text-2xl text-brown-dark">{data.count.toLocaleString()}</p>
            <p className="text-xs text-text-muted">Total Deaths</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl text-brown-dark">
              {data.avgAge ? Math.round(data.avgAge) : "-"}
            </p>
            <p className="text-xs text-text-muted">Avg Age at Death</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl text-accent">
              {data.avgYearsLost ? Math.round(data.avgYearsLost) : "-"}
            </p>
            <p className="text-xs text-text-muted">Avg Years Lost</p>
          </div>
        </div>

        {/* Notable Actors */}
        {data.notableActors.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 font-display text-xl text-brown-dark">Notable Actors</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {data.notableActors.map((actor) => (
                <NotableActorCard key={actor.id} actor={actor} />
              ))}
            </div>
          </div>
        )}

        {/* Two Column Layout for Desktop */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          {/* Decade Breakdown */}
          {data.decadeBreakdown.length > 0 && (
            <div className="rounded-lg bg-surface-elevated p-4">
              <h2 className="mb-4 font-display text-lg text-brown-dark">Deaths by Decade</h2>
              <DecadeChart breakdown={data.decadeBreakdown} />
            </div>
          )}

          {/* Specific Causes */}
          {data.specificCauses.length > 0 && (
            <div className="rounded-lg bg-surface-elevated p-4">
              <h2 className="mb-4 font-display text-lg text-brown-dark">Specific Causes</h2>
              <SpecificCauseList causes={data.specificCauses} categorySlug={data.slug} />
            </div>
          )}
        </div>

        {/* Filter */}
        <div className="mb-4 flex justify-center">
          <label
            className="flex cursor-pointer items-center gap-2 text-sm text-text-muted"
            data-testid="include-obscure-filter"
          >
            <input
              type="checkbox"
              checked={includeObscure}
              onChange={(e) => toggleIncludeObscure(e.target.checked)}
              className="h-4 w-4 rounded border-brown-medium text-brown-dark focus:ring-brown-medium"
            />
            Include lesser-known actors
          </label>
        </div>

        {/* Actor List */}
        <div className="mb-4">
          <h2 className="mb-4 font-display text-xl text-brown-dark">All Actors</h2>
          <div className="space-y-2">
            {data.actors.map((actor, index) => (
              <CauseActorRow
                key={actor.id}
                actor={actor}
                rank={baseOffset + index + 1}
                showCauseBadge
              />
            ))}
          </div>
        </div>

        {/* Pagination */}
        {data.pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded bg-brown-medium px-4 py-2 text-sm text-white transition-colors hover:bg-brown-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <span className="text-sm text-text-muted">
              Page {page} of {data.pagination.totalPages}
            </span>

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= data.pagination.totalPages}
              className="rounded bg-brown-medium px-4 py-2 text-sm text-white transition-colors hover:bg-brown-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Total count */}
        <p className="mt-4 text-center text-sm text-text-muted">
          Showing {data.actors.length.toLocaleString()} of{" "}
          {data.pagination.totalCount.toLocaleString()} actors
        </p>
      </div>
    </>
  )
}
