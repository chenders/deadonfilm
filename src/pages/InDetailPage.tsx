import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useInDetail } from "@/hooks/useInDetail"
import { useDebouncedSearchParam } from "@/hooks/useDebouncedSearchParam"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import SortControl from "@/components/common/SortControl"
import { PersonIcon } from "@/components/icons"
import RelativeTime from "@/components/common/RelativeTime"
import type { InDetailActor } from "@/types"

function ActorCard({ actor }: { actor: InDetailActor }) {
  const profileUrl = getProfileUrl(actor.profilePath, "w185")

  return (
    <Link
      to={`/actor/${actor.slug}`}
      data-testid={`in-detail-${actor.id}`}
      className="block rounded-lg bg-surface-elevated p-4 transition-colors hover:bg-cream"
    >
      <div className="flex items-start gap-4">
        {profileUrl ? (
          <img
            src={profileUrl}
            alt={actor.name}
            className="h-20 w-16 flex-shrink-0 rounded-lg object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-beige shadow-sm">
            <PersonIcon size={32} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg text-brown-dark">{actor.name}</h3>

          <p className="text-sm text-text-muted">
            Died {formatDate(actor.deathday)}
            {actor.ageAtDeath && ` · Age ${actor.ageAtDeath}`}
          </p>

          {actor.causeOfDeath && (
            <p className="mt-1 text-sm text-brown-dark">{toTitleCase(actor.causeOfDeath)}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actor.deathManner && (
              <span className="rounded-full bg-brown-medium/10 px-2 py-0.5 text-xs text-brown-dark">
                {toTitleCase(actor.deathManner)}
              </span>
            )}
            <RelativeTime
              date={actor.enrichedAt}
              prefix="Updated"
              className="text-xs text-text-muted"
            />
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function InDetailPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchInput, setSearchInput, searchQuery] = useDebouncedSearchParam()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"
  const validSorts = ["updated", "date", "name", "age"]
  const rawSort = searchParams.get("sort")
  const sort = rawSort && validSorts.includes(rawSort) ? rawSort : "updated"
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc"

  const { data, isLoading, error } = useInDetail({
    page,
    includeObscure,
    search: searchQuery || undefined,
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
    newParams.delete("page")
    setSearchParams(newParams)
  }

  const handleSortChange = (newSort: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (newSort !== "updated") {
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
    return <LoadingSpinner message="Loading actors..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.actors.length === 0

  return (
    <>
      <Helmet>
        <title>In Detail | Dead on Film</title>
        <meta
          name="description"
          content="Actors with thoroughly researched death details, circumstances, and sources — sorted by most recently updated."
        />
        <meta property="og:title" content="In Detail | Dead on Film" />
        <meta
          property="og:description"
          content="Thoroughly researched actor death details with sources"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="In Detail | Dead on Film" />
        <meta
          name="twitter:description"
          content="Thoroughly researched actor death details with sources"
        />
      </Helmet>
      {data && (
        <PaginationHead
          currentPage={page}
          totalPages={data.pagination.totalPages}
          basePath="/in-detail"
          includeLinks={!searchQuery && !includeObscure}
        />
      )}

      <div data-testid="in-detail-page" className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">In Detail</h1>
          <p className="mt-2 text-sm text-text-primary">
            Actors with thoroughly researched death details and sources
          </p>
        </div>

        {/* Search input */}
        <div className="mb-4 flex justify-center">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search for an actor..."
            data-testid="search-input"
            className="w-full max-w-md rounded-lg border border-brown-medium/30 bg-surface-elevated px-4 py-2 text-sm text-brown-dark placeholder-text-muted focus:border-brown-medium focus:outline-none focus:ring-1 focus:ring-brown-medium"
          />
        </div>

        {/* Include obscure checkbox */}
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

        <div className="mb-4 flex justify-center">
          <SortControl
            options={[
              { value: "updated", label: "Updated" },
              { value: "date", label: "Date" },
              { value: "name", label: "Name" },
              { value: "age", label: "Age" },
            ]}
            currentSort={sort}
            currentDir={dir}
            onSortChange={handleSortChange}
            onDirChange={handleDirChange}
          />
        </div>

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No results found.</p>
            <p className="mt-2 text-xs">
              Try a different search term or enable "Include lesser-known actors".
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {data.actors.map((actor) => (
                <ActorCard key={actor.id} actor={actor} />
              ))}
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
          </>
        )}
      </div>
    </>
  )
}
