import { useSearchParams } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useAllDeaths } from "@/hooks/useAllDeaths"
import { useDebouncedSearchParam } from "@/hooks/useDebouncedSearchParam"
import { createActorSlug } from "@/utils/slugify"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import SortControl from "@/components/common/SortControl"
import ActorCard from "@/components/common/ActorCard"
import JsonLd from "@/components/seo/JsonLd"
import { buildCollectionPageSchema } from "@/utils/schema"

export default function AllDeathsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"
  const validSorts = ["date", "name", "age"]
  const rawSort = searchParams.get("sort")
  const sort = rawSort && validSorts.includes(rawSort) ? rawSort : "date"
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc"

  // Debounced search with URL sync
  const [searchInput, setSearchInput, searchQuery] = useDebouncedSearchParam()

  const { data, isLoading, error } = useAllDeaths({
    page,
    includeObscure,
    search: searchQuery,
    sort,
    dir,
  })

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

  const handleSortChange = (newSort: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (newSort !== "date") {
      newParams.set("sort", newSort)
    } else {
      newParams.delete("sort")
    }
    newParams.delete("page")
    setSearchParams(newParams)
  }

  const handleDirChange = (newDir: "asc" | "desc") => {
    const newParams = new URLSearchParams(searchParams)
    if (newDir !== "desc") {
      newParams.set("dir", newDir)
    } else {
      newParams.delete("dir")
    }
    newParams.delete("page")
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.deaths.length === 0

  return (
    <>
      <Helmet>
        <title>All Deaths | Dead on Film</title>
        <meta
          name="description"
          content="Complete list of deceased actors in our database, ordered by death date. Browse through thousands of actors who have passed away."
        />
        <meta property="og:title" content="All Deaths | Dead on Film" />
        <meta
          property="og:description"
          content="Complete list of deceased actors in our database, ordered by death date"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="All Deaths | Dead on Film" />
        <meta
          name="twitter:description"
          content="Complete list of deceased actors in our database, ordered by death date"
        />
      </Helmet>
      {data && (
        <PaginationHead
          currentPage={page}
          totalPages={data.pagination.totalPages}
          basePath="/deaths/all"
          includeLinks={!includeObscure && !searchQuery}
        />
      )}
      {page === 1 && !includeObscure && !searchQuery && data && data.deaths.length > 0 && (
        <JsonLd
          data={buildCollectionPageSchema(
            "All Deaths",
            "Complete list of deceased actors in our database, ordered by death date.",
            "https://deadonfilm.com/deaths/all",
            data.deaths.map((person) => ({
              name: person.name,
              url: `https://deadonfilm.com/actor/${createActorSlug(person.name, person.id)}`,
            }))
          )}
        />
      )}

      <div data-testid="all-deaths-page" className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">All Deaths</h1>
          <p className="mt-2 text-sm text-text-primary">
            {includeObscure
              ? "All deceased actors in our database, ordered by death date (most recent first)."
              : "Well-known deceased actors in our database, ordered by death date (most recent first)."}
          </p>
        </div>

        {/* Search and Filter */}
        <div className="mb-4 space-y-3">
          <div className="flex justify-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search for an actor..."
              data-testid="search-input"
              className="w-full max-w-md rounded-lg border border-brown-medium/30 bg-surface-elevated px-4 py-2 text-sm text-brown-dark placeholder-text-muted focus:border-brown-medium focus:outline-none focus:ring-1 focus:ring-brown-medium"
            />
          </div>
          <div className="flex justify-center">
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
        </div>

        <div className="mb-4 flex justify-center">
          <SortControl
            options={[
              { value: "date", label: "Date" },
              { value: "name", label: "Name" },
              { value: "age", label: "Age at Death" },
            ]}
            currentSort={sort}
            currentDir={dir}
            onSortChange={handleSortChange}
            onDirChange={handleDirChange}
          />
        </div>

        {noResults ? (
          <div className="text-center text-text-muted">
            {searchQuery ? (
              <>
                <p>No actors found matching "{searchQuery}".</p>
                <p className="mt-2 text-xs">
                  Try a different search term or enable "Include lesser-known actors".
                </p>
              </>
            ) : (
              <p>No deaths found in our database.</p>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.deaths.map((person) => (
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
                  testId={`death-row-${person.id}`}
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
              Showing {data.deaths.length.toLocaleString()} of{" "}
              {data.pagination.totalCount.toLocaleString()} actors
            </p>
          </>
        )}
      </div>
    </>
  )
}
