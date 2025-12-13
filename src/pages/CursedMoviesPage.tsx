import { Link, useSearchParams } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useQuery } from "@tanstack/react-query"
import { useCursedMovies } from "@/hooks/useCursedMovies"
import { getPosterUrl, getCursedMoviesFilters } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import { getDecadeOptions } from "@/utils/formatDate"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import CalculationExplainer from "@/components/common/CalculationExplainer"
import type { CursedMovie } from "@/types"

const DECADE_OPTIONS = getDecadeOptions(1930)

function MovieRow({ movie }: { movie: CursedMovie }) {
  const posterUrl = getPosterUrl(movie.posterPath, "w92")
  const releaseYear = movie.releaseYear?.toString() || "Unknown"
  const slug = createMovieSlug(movie.title, releaseYear, movie.id)
  const excessDeaths = Math.round((movie.deceasedCount - movie.expectedDeaths) * 10) / 10

  return (
    <Link
      to={`/movie/${slug}`}
      className="flex items-center gap-4 rounded-lg bg-white p-3 transition-colors hover:bg-cream"
    >
      <span className="w-8 text-center font-display text-lg text-brown-medium">{movie.rank}</span>

      <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-beige">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            width={44}
            height={64}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-lg text-brown-dark">{movie.title}</h3>
        <p className="text-sm text-text-muted">{releaseYear}</p>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="font-display text-lg text-brown-dark">
          {movie.deceasedCount}/{movie.castCount}
        </p>
        <p className="text-xs text-text-muted">
          +{excessDeaths > 0 ? excessDeaths.toFixed(1) : "0"} above expected
        </p>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="font-display text-xl text-brown-dark">
          {(movie.mortalitySurpriseScore * 100).toFixed(0)}%
        </p>
        <p className="text-xs text-text-muted">curse score</p>
      </div>
    </Link>
  )
}

function getPageTitle(fromDecade?: number, toDecade?: number): string {
  if (fromDecade && toDecade && fromDecade !== toDecade) {
    return `Most Cursed Movies (${fromDecade}s-${toDecade}s) - Dead on Film`
  }
  if (fromDecade) {
    return `Most Cursed Movies from the ${fromDecade}s - Dead on Film`
  }
  return "Most Cursed Movies - Dead on Film"
}

// Generate min deaths options from 3 to max
function generateMinDeathsOptions(maxMinDeaths: number) {
  const options = [{ value: "3", label: "Any" }]
  for (let i = 4; i <= maxMinDeaths; i++) {
    options.push({ value: String(i), label: `${i}+` })
  }
  return options
}

export default function CursedMoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Fetch filter options (max min deaths value)
  const { data: filtersData } = useQuery({
    queryKey: ["cursed-movies-filters"],
    queryFn: getCursedMoviesFilters,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  // Generate options based on fetched max, default to just "Any" while loading
  const minDeathsOptions = generateMinDeathsOptions(filtersData?.maxMinDeaths ?? 3)

  // Parse URL params
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const fromDecade = searchParams.get("from") ? parseInt(searchParams.get("from")!, 10) : undefined
  const toDecade = searchParams.get("to") ? parseInt(searchParams.get("to")!, 10) : undefined
  const minDeadActors = parseInt(searchParams.get("minDeaths") || "3", 10)
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useCursedMovies({
    page,
    fromDecade,
    toDecade,
    minDeadActors,
    includeObscure,
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
    return <LoadingSpinner message="Loading cursed movies..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const hasFilters = fromDecade || toDecade || minDeadActors !== 3 || includeObscure
  const noResults = !data || data.movies.length === 0

  return (
    <>
      <Helmet>
        <title>{getPageTitle(fromDecade, toDecade)}</title>
        <meta
          name="description"
          content="Discover the most cursed movies in cinema history. Ranked by mortality surprise score - films where cast deaths exceeded statistical expectations."
        />
        <meta property="og:title" content={getPageTitle(fromDecade, toDecade)} />
        <meta
          property="og:description"
          content="Movies ranked by how many cast members died above statistical expectations"
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <div data-testid="cursed-movies-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">Most Cursed Movies</h1>
          <p className="mt-2 text-sm text-text-muted">
            Movies ranked by statistically abnormal mortality. A film from the 1930s with all
            deceased actors isn't "cursed" if that's expected for their ages. These films had
            significantly more deaths than actuarial tables predicted. The curse score shows excess
            mortality: 50% means 50% more deaths than expected.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-4 rounded-lg bg-beige p-4">
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
            <label htmlFor="min-deaths" className="text-sm text-text-muted">
              Min Deaths:
            </label>
            <select
              id="min-deaths"
              value={minDeadActors.toString()}
              onChange={(e) =>
                updateParams({ minDeaths: e.target.value === "3" ? undefined : e.target.value })
              }
              className="rounded border border-brown-medium/30 bg-white px-2 py-1 text-sm"
            >
              {minDeathsOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={includeObscure}
              onChange={(e) =>
                updateParams({ includeObscure: e.target.checked ? "true" : undefined })
              }
              className="rounded border-brown-medium/30"
            />
            Include obscure movies
          </label>

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
            <p>No movies match these filters. Try adjusting your criteria.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.movies.map((movie) => (
                <MovieRow key={movie.id} movie={movie} />
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
              Showing {data.movies.length} of {data.pagination.totalCount} movies
            </p>

            <CalculationExplainer type="movies" />
          </>
        )}
      </div>
    </>
  )
}
