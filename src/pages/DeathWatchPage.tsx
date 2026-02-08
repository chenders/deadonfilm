import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import PaginationHead from "@/components/seo/PaginationHead"
import { useDeathWatch } from "@/hooks/useDeathWatch"
import { useDebouncedSearchParam } from "@/hooks/useDebouncedSearchParam"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import JsonLd from "@/components/seo/JsonLd"
import { buildCollectionPageSchema } from "@/utils/schema"
import { PersonIcon } from "@/components/icons"
import type { DeathWatchActor } from "@/types"

function formatPercentage(probability: number): string {
  const percent = probability * 100
  if (percent < 1) {
    return percent.toFixed(2) + "%"
  }
  return percent.toFixed(1) + "%"
}

function ActorRow({ actor }: { actor: DeathWatchActor }) {
  const slug = createActorSlug(actor.name, actor.id)
  const profileUrl = getProfileUrl(actor.profilePath, "w185")

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`death-watch-row-${actor.id}`}
      className="block rounded-lg bg-surface-elevated p-3 transition-colors hover:bg-cream"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-brown-medium">{actor.rank}</span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={actor.name}
            className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-beige">
            <PersonIcon size={24} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-brown-dark">{actor.name}</h3>
          <p className="text-sm text-text-muted">
            Age {actor.age} &middot; {actor.totalMovies} movie{actor.totalMovies !== 1 && "s"}
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-display text-lg text-brown-dark">
            {formatPercentage(actor.deathProbability)}
          </p>
          <p className="text-xs text-text-muted">chance this year</p>
        </div>

        {actor.yearsRemaining !== null && (
          <div className="flex-shrink-0 text-right">
            <p className="font-display text-lg text-brown-dark">~{actor.yearsRemaining}</p>
            <p className="text-xs text-text-muted">years left</p>
          </div>
        )}
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-brown-medium">
          {actor.rank}
        </span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={actor.name}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-beige">
            <PersonIcon size={20} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-brown-dark">{actor.name}</h3>
          <p className="text-xs text-text-muted">
            Age {actor.age} &middot; {actor.totalMovies} movie{actor.totalMovies !== 1 && "s"}
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className="font-medium text-brown-dark">
              {formatPercentage(actor.deathProbability)} risk
            </span>
            {actor.yearsRemaining !== null && (
              <span className="text-text-muted">~{actor.yearsRemaining} yrs left</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function DeathWatchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"

  // Debounced search with URL sync
  const [searchInput, setSearchInput, searchQuery] = useDebouncedSearchParam()

  const { data, isLoading, error } = useDeathWatch({ page, includeObscure, search: searchQuery })

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    if (newPage > 1) {
      newParams.set("page", String(newPage))
    } else {
      newParams.delete("page")
    }
    setSearchParams(newParams)
  }

  const toggleObscure = () => {
    const newParams = new URLSearchParams(searchParams)
    if (includeObscure) {
      newParams.delete("includeObscure")
    } else {
      newParams.set("includeObscure", "true")
    }
    newParams.delete("page") // Reset to first page when toggling
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading Death Watch..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.actors.length === 0

  return (
    <>
      <Helmet>
        <title>Death Watch | Dead on Film</title>
        <meta
          name="description"
          content="Living actors most likely to die soon based on actuarial statistics. Ranked by 1-year death probability."
        />
        <meta property="og:title" content="Death Watch | Dead on Film" />
        <meta
          property="og:description"
          content="Living actors most likely to die soon based on actuarial statistics"
        />
        <meta property="og:type" content="website" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Death Watch | Dead on Film" />
        <meta
          name="twitter:description"
          content="Living actors most likely to die soon based on actuarial statistics"
        />
      </Helmet>
      {data && (
        <PaginationHead
          currentPage={page}
          totalPages={data.pagination.totalPages}
          basePath="/death-watch"
          includeLinks={!includeObscure && !searchQuery}
        />
      )}
      {page === 1 && !includeObscure && !searchQuery && data && data.actors.length > 0 && (
        <JsonLd
          data={buildCollectionPageSchema(
            "Death Watch",
            "Living actors most likely to die soon based on actuarial statistics, ranked by 1-year death probability.",
            "https://deadonfilm.com/death-watch",
            data.actors.map((actor) => ({
              name: actor.name,
              url: `https://deadonfilm.com/actor/${createActorSlug(actor.name, actor.id)}`,
            }))
          )}
        />
      )}

      <div data-testid="death-watch-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">Death Watch</h1>
          <p className="mt-2 text-sm text-text-muted">
            Living actors in our database ranked by their probability of dying in the next year,
            based on US Social Security Administration actuarial tables.
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
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeObscure}
                onChange={toggleObscure}
                className="rounded border-brown-medium text-brown-dark focus:ring-brown-medium"
              />
              <span className="text-text-muted">Include lesser-known actors</span>
            </label>
          </div>
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
              <>
                <p>No actors found matching your criteria.</p>
                <p className="mt-2 text-xs">
                  Try enabling "Include lesser-known actors" to see more results.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.actors.map((actor) => (
                <ActorRow key={actor.id} actor={actor} />
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
