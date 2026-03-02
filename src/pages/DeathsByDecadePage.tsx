import { useParams, useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useDeathsByDecade, useDecadeCategories } from "@/hooks/useDeathsByDecade"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import ActorCard from "@/components/common/ActorCard"

function DecadeSelector({ currentDecade }: { currentDecade: string }) {
  const { data } = useDecadeCategories()

  if (!data || data.decades.length === 0) return null

  return (
    <div className="mb-6 flex flex-wrap justify-center gap-2">
      {data.decades.map((d) => {
        const decadeStr = `${d.decade}s`
        const isActive = currentDecade === decadeStr
        return (
          <Link
            key={d.decade}
            to={`/deaths/decade/${decadeStr}`}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              isActive ? "bg-brown-dark text-cream" : "bg-beige text-brown-dark hover:bg-cream"
            }`}
          >
            {decadeStr}
          </Link>
        )
      })}
    </div>
  )
}

export default function DeathsByDecadePage() {
  const { decade } = useParams<{ decade: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useDeathsByDecade(decade || "", { page, includeObscure })

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    if (newPage > 1) {
      newParams.set("page", String(newPage))
    } else {
      newParams.delete("page")
    }
    setSearchParams(newParams)
  }

  const toggleIncludeObscure = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams)
    if (checked) {
      newParams.set("includeObscure", "true")
    } else {
      newParams.delete("includeObscure")
    }
    newParams.delete("page") // Reset to first page when filter changes
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Decade not found" />
  }

  const noResults = data.deaths.length === 0
  const baseOffset = (page - 1) * data.pagination.pageSize

  return (
    <>
      <Helmet>
        <title>Deaths in the {data.decadeLabel} | Dead on Film</title>
        <meta
          name="description"
          content={`${data.pagination.totalCount} actors who died in the ${data.decadeLabel}. Browse actors by decade of death from movies and TV shows.`}
        />
      </Helmet>
      <PaginationHead
        currentPage={page}
        totalPages={data.pagination.totalPages}
        basePath={`/deaths/decade/${data.decadeLabel}`}
        includeLinks={!includeObscure}
      />

      <div data-testid="deaths-by-decade-page" className="mx-auto max-w-5xl">
        <div className="mb-4 text-center">
          <Link
            to="/deaths/decades"
            className="mb-2 inline-block text-sm text-brown-medium hover:text-brown-dark"
          >
            &larr; All Decades
          </Link>
          <h1 className="font-display text-3xl text-brown-dark">
            Deaths in the {data.decadeLabel}
          </h1>
          <p className="mt-2 text-sm text-text-primary">
            {data.pagination.totalCount.toLocaleString()}{" "}
            {data.pagination.totalCount === 1 ? "actor" : "actors"} died during this decade
          </p>
        </div>

        <DecadeSelector currentDecade={decade || ""} />

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

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No deaths found for this decade.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.deaths.map((person, index) => (
                <ActorCard
                  key={person.id}
                  name={person.name}
                  slug={person.actorSlug}
                  profilePath={person.profilePath}
                  deathday={person.deathday}
                  ageAtDeath={person.ageAtDeath}
                  causeOfDeath={person.causeOfDeath}
                  knownFor={person.knownFor}
                  rank={baseOffset + index + 1}
                  useCauseOfDeathBadge
                  testId={`death-row-${person.id}`}
                >
                  {typeof person.yearsLost === "number" && person.yearsLost > 0 && (
                    <span className="mt-1 block text-xs text-text-muted">
                      {Math.round(person.yearsLost).toLocaleString()} years lost
                    </span>
                  )}
                </ActorCard>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded bg-brown-medium px-4 py-2 text-sm text-cream transition-colors hover:bg-brown-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <span className="text-sm text-text-muted">
                  Page {page} of {data.pagination.totalPages}
                </span>

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="rounded bg-brown-medium px-4 py-2 text-sm text-cream transition-colors hover:bg-brown-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            {/* Total count */}
            <p className="mt-4 text-center text-sm text-text-muted">
              Showing {data.deaths.length.toLocaleString()} of{" "}
              {data.pagination.totalCount.toLocaleString()} actors
            </p>
          </>
        )}
      </div>
    </>
  )
}
