import { useParams, useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useSpecificCauseDetail } from "@/hooks/useCausesOfDeath"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import { NotableActorCard, DecadeChart, CauseActorRow } from "@/components/causes"

export default function SpecificCausePage() {
  const { categorySlug, causeSlug } = useParams<{ categorySlug: string; causeSlug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useSpecificCauseDetail(categorySlug || "", causeSlug || "", {
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
    return <LoadingSpinner message="Loading cause details..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Cause not found" />
  }

  const baseOffset = (page - 1) * data.pagination.pageSize

  return (
    <>
      <Helmet>
        <title>{data.cause} Deaths - Dead on Film</title>
        <meta
          name="description"
          content={`${data.count.toLocaleString()} actors who died from ${data.cause.toLowerCase()}. Average age at death: ${data.avgAge ? Math.round(data.avgAge) : "unknown"}.`}
        />
        <meta property="og:title" content={`${data.cause} Deaths - Dead on Film`} />
        <meta
          property="og:description"
          content={`Explore ${data.count.toLocaleString()} actors who died from ${data.cause.toLowerCase()}`}
        />
      </Helmet>
      <PaginationHead
        currentPage={page}
        totalPages={data.pagination.totalPages}
        basePath={`/causes-of-death/${data.categorySlug}/${data.slug}`}
        includeLinks={!includeObscure}
      />

      <div data-testid="specific-cause-page" className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-4 flex flex-wrap gap-1 text-sm text-brown-medium">
          <Link to="/causes-of-death" className="hover:text-brown-dark">
            Causes of Death
          </Link>
          <span>&rsaquo;</span>
          <Link to={`/causes-of-death/${data.categorySlug}`} className="hover:text-brown-dark">
            {data.categoryLabel}
          </Link>
          <span>&rsaquo;</span>
          <span className="text-brown-dark">{data.cause}</span>
        </div>

        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">{data.cause}</h1>
          <p className="text-text-primary">{data.count.toLocaleString()} actors</p>
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.notableActors.map((actor) => (
                <NotableActorCard key={actor.id} actor={actor} />
              ))}
            </div>
          </div>
        )}

        {/* Decade Breakdown */}
        {data.decadeBreakdown.length > 0 && (
          <div className="mb-8 rounded-lg bg-surface-elevated p-4">
            <h2 className="mb-4 font-display text-lg text-brown-dark">Deaths by Decade</h2>
            <DecadeChart breakdown={data.decadeBreakdown} />
          </div>
        )}

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
          {data.actors.length === 0 ? (
            <p className="text-center text-text-muted">No actors found for this cause.</p>
          ) : (
            <div className="space-y-2">
              {data.actors.map((actor, index) => (
                <CauseActorRow
                  key={actor.id}
                  actor={actor}
                  rank={baseOffset + index + 1}
                  showCauseBadge={false}
                />
              ))}
            </div>
          )}
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
        {data.actors.length > 0 && (
          <p className="mt-4 text-center text-sm text-text-muted">
            Showing {data.actors.length.toLocaleString()} of{" "}
            {data.pagination.totalCount.toLocaleString()} actors
          </p>
        )}
      </div>
    </>
  )
}
