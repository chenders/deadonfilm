import { useSearchParams } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useCovidDeaths } from "@/hooks/useCovidDeaths"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import ActorCard from "@/components/common/ActorCard"

export default function CovidDeathsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useCovidDeaths({ page, includeObscure })

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
    return <LoadingSpinner message="Loading COVID-19 deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.persons.length === 0

  return (
    <>
      <Helmet>
        <title>COVID-19 Deaths | Dead on Film</title>
        <meta
          name="description"
          content="Actors who died from COVID-19 or related complications. A memorial to film industry members lost to the pandemic."
        />
        <meta property="og:title" content="COVID-19 Deaths | Dead on Film" />
        <meta
          property="og:description"
          content="Actors who died from COVID-19 or related complications"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="COVID-19 Deaths | Dead on Film" />
        <meta
          name="twitter:description"
          content="Actors who died from COVID-19 or related complications"
        />
      </Helmet>
      {data && (
        <PaginationHead
          currentPage={page}
          totalPages={data.pagination.totalPages}
          basePath="/covid-deaths"
          includeLinks={!includeObscure}
        />
      )}

      <div data-testid="covid-deaths-page" className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">COVID-19 Deaths</h1>
          <p className="mt-2 text-sm text-text-primary">
            {includeObscure
              ? "All actors in our database who died from COVID-19, coronavirus, or related complications. Ordered by death date, most recent first."
              : "Well-known actors in our database who died from COVID-19, coronavirus, or related complications. Ordered by death date, most recent first."}
          </p>
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

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No COVID-19 deaths found in our database.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.persons.map((person) => (
                <ActorCard
                  key={person.id}
                  name={person.name}
                  slug={person.actorSlug}
                  profilePath={person.profilePath}
                  deathday={person.deathday}
                  ageAtDeath={person.ageAtDeath}
                  causeOfDeath={person.causeOfDeath}
                  causeOfDeathDetails={person.causeOfDeathDetails}
                  knownFor={person.knownFor}
                  rank={person.rank}
                  useCauseOfDeathBadge
                  testId={`covid-death-row-${person.id}`}
                />
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
              Showing {data.persons.length.toLocaleString()} of{" "}
              {data.pagination.totalCount.toLocaleString()} actors
            </p>
          </>
        )}
      </div>
    </>
  )
}
