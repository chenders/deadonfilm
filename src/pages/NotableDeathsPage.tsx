import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useNotableDeaths } from "@/hooks/useDeathDetails"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import SortControl from "@/components/common/SortControl"
import { PersonIcon } from "@/components/icons"
import ConfidenceIndicator from "@/components/common/ConfidenceIndicator"
import type { NotableDeathActor, NotableDeathsFilter } from "@/types"

// Filter tab configuration
const FILTERS: { id: NotableDeathsFilter; label: string; description: string }[] = [
  { id: "all", label: "All", description: "All actors with detailed death information" },
  { id: "strange", label: "Strange", description: "Unusual or mysterious deaths" },
  { id: "disputed", label: "Disputed", description: "Deaths with conflicting accounts" },
  { id: "controversial", label: "Controversial", description: "Deaths involving controversy" },
]

// Notable factor badge
function FactorBadge({ factor }: { factor: string }) {
  const formatted = factor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  return (
    <span
      className="inline-block rounded-full bg-beige px-2 py-0.5 text-xs text-brown-dark"
      data-testid="factor-badge"
    >
      {formatted}
    </span>
  )
}

function ActorCard({ actor }: { actor: NotableDeathActor }) {
  const profileUrl = getProfileUrl(actor.profilePath, "w185")

  return (
    <Link
      to={`/actor/${actor.slug}/death`}
      data-testid={`notable-death-${actor.id}`}
      className="block rounded-lg bg-surface-elevated p-4 transition-colors hover:bg-cream"
    >
      <div className="flex items-start gap-4">
        {/* Profile image */}
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

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg text-brown-dark">{actor.name}</h3>
            {actor.strangeDeath && (
              <span
                className="flex-shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-white"
                title="Strange or unusual death"
              >
                Strange
              </span>
            )}
          </div>

          <p className="text-sm text-text-muted">
            Died {formatDate(actor.deathday)}
            {actor.ageAtDeath && ` · Age ${actor.ageAtDeath}`}
          </p>

          {actor.causeOfDeath && (
            <p className="mt-1 text-sm text-brown-dark">{toTitleCase(actor.causeOfDeath)}</p>
          )}

          {/* Death manner and confidence */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actor.deathManner && (
              <span className="rounded-full bg-brown-medium/10 px-2 py-0.5 text-xs text-brown-dark">
                {toTitleCase(actor.deathManner)}
              </span>
            )}
            {actor.circumstancesConfidence && (
              <ConfidenceIndicator level={actor.circumstancesConfidence} variant="badge" />
            )}
          </div>

          {/* Notable factors */}
          {actor.notableFactors && actor.notableFactors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {actor.notableFactors.slice(0, 3).map((factor) => (
                <FactorBadge key={factor} factor={factor} />
              ))}
              {actor.notableFactors.length > 3 && (
                <span className="text-xs text-text-muted">
                  +{actor.notableFactors.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function NotableDeathsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const filter = (searchParams.get("filter") as NotableDeathsFilter) || "all"
  const includeObscure = searchParams.get("includeObscure") === "true"
  const sort = searchParams.get("sort") || "date"
  const dir = (searchParams.get("dir") || "desc") as "asc" | "desc"

  const { data, isLoading, error } = useNotableDeaths({ page, filter, includeObscure, sort, dir })

  const setFilter = (newFilter: NotableDeathsFilter) => {
    const newParams = new URLSearchParams(searchParams)
    if (newFilter !== "all") {
      newParams.set("filter", newFilter)
    } else {
      newParams.delete("filter")
    }
    newParams.delete("page") // Reset to first page when filter changes
    setSearchParams(newParams)
  }

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
    return <LoadingSpinner message="Loading notable deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.actors.length === 0
  const currentFilter = FILTERS.find((f) => f.id === filter)

  return (
    <>
      <Helmet>
        <title>Notable Deaths | Dead on Film</title>
        <meta
          name="description"
          content="Explore detailed accounts of celebrity deaths - strange circumstances, disputed accounts, and controversial deaths in film and television."
        />
        <meta property="og:title" content="Notable Deaths | Dead on Film" />
        <meta
          property="og:description"
          content="Strange, disputed, and controversial celebrity deaths"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Notable Deaths | Dead on Film" />
        <meta
          name="twitter:description"
          content="Strange, disputed, and controversial celebrity deaths"
        />
      </Helmet>
      {data && (
        <PaginationHead
          currentPage={page}
          totalPages={data.pagination.totalPages}
          basePath="/deaths/notable"
          includeLinks={filter === "all" && !includeObscure}
        />
      )}

      <div data-testid="notable-deaths-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">Notable Deaths</h1>
          <p className="mt-2 text-sm text-text-muted">
            Detailed accounts of celebrity deaths with sources and context
          </p>
        </div>

        {/* Filter tabs */}
        <div className="mb-4 flex flex-wrap justify-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              title={f.description}
              data-testid={`filter-${f.id}`}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                filter === f.id
                  ? "bg-brown-dark text-white"
                  : "bg-brown-medium/10 text-brown-dark hover:bg-brown-medium/20"
              }`}
            >
              {f.label}
            </button>
          ))}
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
              { value: "date", label: "Date" },
              { value: "name", label: "Name" },
            ]}
            currentSort={sort}
            currentDir={dir}
            onSortChange={handleSortChange}
            onDirChange={handleDirChange}
          />
        </div>

        {/* Filter description */}
        {currentFilter && filter !== "all" && (
          <p className="mb-4 text-center text-sm text-text-muted">{currentFilter.description}</p>
        )}

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No notable deaths found for this filter.</p>
            <p className="mt-2 text-xs">
              Try a different filter or enable "Include lesser-known actors".
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
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
