import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useCursedActors } from "@/hooks/useCursedActors"
import { getDecadeOptions } from "@/utils/formatDate"
import { createActorSlug } from "@/utils/slugify"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import CalculationExplainer from "@/components/common/CalculationExplainer"
import { PersonIcon, SkullIcon } from "@/components/icons"
import type { CursedActor } from "@/types"

const DECADE_OPTIONS = getDecadeOptions(1930)

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "living", label: "Living" },
  { value: "deceased", label: "Deceased" },
]

const MIN_MOVIES_OPTIONS = [
  { value: "2", label: "Any" },
  { value: "3", label: "3+" },
  { value: "5", label: "5+" },
  { value: "10", label: "10+" },
  { value: "15", label: "15+" },
  { value: "20", label: "20+" },
]

function ActorRow({ actor }: { actor: CursedActor }) {
  const excessDeaths = Math.round((actor.totalActualDeaths - actor.totalExpectedDeaths) * 10) / 10
  const cursePercentage =
    actor.totalExpectedDeaths > 0
      ? ((actor.totalActualDeaths - actor.totalExpectedDeaths) / actor.totalExpectedDeaths) * 100
      : 0
  const slug = createActorSlug(actor.name, actor.id)

  return (
    <Link
      to={`/actor/${slug}`}
      className="flex items-center gap-4 rounded-lg bg-white p-3 transition-colors hover:bg-cream"
    >
      <span className="w-8 text-center font-display text-lg text-brown-medium">{actor.rank}</span>

      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-beige">
        <PersonIcon size={24} className="text-brown-medium" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-lg text-brown-dark">{actor.name}</h3>
          {actor.isDeceased && <SkullIcon size={16} className="flex-shrink-0 text-brown-medium" />}
        </div>
        <p className="text-sm text-text-muted">{actor.totalMovies} movies analyzed</p>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="font-display text-lg text-brown-dark">{actor.totalActualDeaths} deaths</p>
        <p className="text-xs text-text-muted">
          +{excessDeaths > 0 ? excessDeaths.toFixed(1) : "0"} above expected
        </p>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="font-display text-xl text-brown-dark">
          {cursePercentage > 0 ? `${cursePercentage.toFixed(0)}%` : "0%"}
        </p>
        <p className="text-xs text-text-muted">curse score</p>
      </div>
    </Link>
  )
}

function getPageTitle(status?: string): string {
  if (status === "living") {
    return "Most Cursed Living Actors - Dead on Film"
  }
  if (status === "deceased") {
    return "Most Cursed Deceased Actors - Dead on Film"
  }
  return "Most Cursed Actors - Dead on Film"
}

export default function CursedActorsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse URL params
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const fromDecade = searchParams.get("from") ? parseInt(searchParams.get("from")!, 10) : undefined
  const toDecade = searchParams.get("to") ? parseInt(searchParams.get("to")!, 10) : undefined
  const minMovies = parseInt(searchParams.get("minMovies") || "2", 10)
  const status = (searchParams.get("status") as "living" | "deceased" | "all") || "all"

  const { data, isLoading, error } = useCursedActors({
    page,
    fromDecade,
    toDecade,
    minMovies,
    status,
  })

  const updateParams = (updates: Record<string, string | undefined>) => {
    const newParams = new URLSearchParams(searchParams)

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === "") {
        newParams.delete(key)
      } else {
        newParams.set(key, value)
      }
    }

    // Reset to page 1 when filters change
    if (!("page" in updates)) {
      newParams.delete("page")
    }

    setSearchParams(newParams)
  }

  const goToPage = (newPage: number) => {
    updateParams({ page: newPage > 1 ? String(newPage) : undefined })
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading cursed actors..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const hasFilters = fromDecade || toDecade || minMovies !== 2 || status !== "all"
  const noResults = !data || data.actors.length === 0

  return (
    <>
      <Helmet>
        <title>{getPageTitle(status)}</title>
        <meta
          name="description"
          content="Discover actors whose co-stars have died at unusually high rates. Ranked by curse score - how many more deaths than statistically expected across their filmography."
        />
        <meta property="og:title" content={getPageTitle(status)} />
        <meta
          property="og:description"
          content="Actors ranked by how many of their co-stars died above statistical expectations"
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <div data-testid="cursed-actors-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">Most Cursed Actors</h1>
          <p className="mt-2 text-sm text-text-muted">
            Actors whose co-stars have died at unusually high rates across their filmography. The
            curse score shows excess co-star mortality: 50% means 50% more co-star deaths than
            actuarial tables predicted based on cast ages.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-4 rounded-lg bg-beige p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="status" className="text-sm text-text-muted">
              Status:
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) =>
                updateParams({ status: e.target.value === "all" ? undefined : e.target.value })
              }
              className="rounded border border-brown-medium/30 bg-white px-2 py-1 text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="from-decade" className="text-sm text-text-muted">
              From:
            </label>
            <select
              id="from-decade"
              value={fromDecade?.toString() || ""}
              onChange={(e) => updateParams({ from: e.target.value || undefined })}
              className="rounded border border-brown-medium/30 bg-white px-2 py-1 text-sm"
            >
              {DECADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="to-decade" className="text-sm text-text-muted">
              To:
            </label>
            <select
              id="to-decade"
              value={toDecade?.toString() || ""}
              onChange={(e) => updateParams({ to: e.target.value || undefined })}
              className="rounded border border-brown-medium/30 bg-white px-2 py-1 text-sm"
            >
              {DECADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="min-movies" className="text-sm text-text-muted">
              Min Movies:
            </label>
            <select
              id="min-movies"
              value={minMovies.toString()}
              onChange={(e) =>
                updateParams({ minMovies: e.target.value === "2" ? undefined : e.target.value })
              }
              className="rounded border border-brown-medium/30 bg-white px-2 py-1 text-sm"
            >
              {MIN_MOVIES_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => setSearchParams(new URLSearchParams())}
              className="text-sm text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No actors match these filters. Try adjusting your criteria.</p>
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
              Showing {data.actors.length} of {data.pagination.totalCount} actors
            </p>

            <CalculationExplainer type="actors" />
          </>
        )}
      </div>
    </>
  )
}
