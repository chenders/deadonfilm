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
import JsonLd from "@/components/seo/JsonLd"
import { buildItemListSchema } from "@/utils/schema"
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
      data-testid={`cursed-movie-row-${movie.id}`}
      className="block rounded-lg bg-surface p-3 transition-colors hover:bg-surface-muted"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-foreground-muted">
          {movie.rank}
        </span>

        <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-surface-muted">
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
            <div className="flex h-full w-full items-center justify-center text-xs text-foreground-muted">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-foreground">{movie.title}</h3>
          <p className="text-sm text-foreground-muted">{releaseYear}</p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-display text-lg text-foreground">
            {movie.deceasedCount.toLocaleString()}/{movie.castCount.toLocaleString()}
          </p>
          <p className="text-xs text-foreground-muted">
            +{excessDeaths > 0 ? excessDeaths.toFixed(1) : "0"} above expected
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-display text-xl text-foreground">
            {(movie.mortalitySurpriseScore * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-foreground-muted">curse score</p>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-foreground-muted">
          {movie.rank}
        </span>

        <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-surface-muted">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              width={40}
              height={56}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-foreground-muted">
              No img
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-foreground">{movie.title}</h3>
          <p className="text-xs text-foreground-muted">
            {releaseYear} · {movie.deceasedCount.toLocaleString()}/
            {movie.castCount.toLocaleString()} deaths
          </p>
          <p className="mt-1 text-xs text-foreground">
            <span className="font-display text-sm">
              {(movie.mortalitySurpriseScore * 100).toFixed(0)}%
            </span>{" "}
            curse score
            <span className="text-foreground-muted">
              {" "}
              (+{excessDeaths > 0 ? excessDeaths.toFixed(1) : "0"})
            </span>
          </p>
        </div>
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
          content="Discover the most cursed movies and TV shows. Ranked by mortality surprise score - where cast deaths exceeded statistical expectations."
        />
        <meta property="og:title" content={getPageTitle(fromDecade, toDecade)} />
        <meta
          property="og:description"
          content="Movies ranked by how many cast members died above statistical expectations"
        />
        <meta property="og:type" content="website" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={getPageTitle(fromDecade, toDecade)} />
        <meta
          name="twitter:description"
          content="Movies ranked by how many cast members died above statistical expectations"
        />
        <link rel="canonical" href="https://deadonfilm.com/cursed-movies" />
      </Helmet>
      {data && data.movies.length > 0 && (
        <JsonLd
          data={buildItemListSchema(
            "Most Cursed Movies",
            "Movies ranked by statistically abnormal cast mortality",
            data.movies.slice(0, 10).map((movie) => ({
              name: movie.title,
              url: `https://deadonfilm.com/movie/${createMovieSlug(movie.title, movie.releaseYear?.toString() || "unknown", movie.id)}`,
              position: movie.rank,
            }))
          )}
        />
      )}

      <div data-testid="cursed-movies-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-foreground">Most Cursed Movies</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Movies ranked by statistically abnormal mortality. A film from the 1930s with all
            deceased actors isn't "cursed" if that's expected for their ages. These films had
            significantly more deaths than actuarial tables predicted. The curse score shows excess
            mortality: 50% means 50% more deaths than expected.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg bg-surface-muted p-4">
          {/* Mobile filters - stacked */}
          <div className="grid grid-cols-3 gap-3 md:hidden">
            <div className="flex flex-col gap-1">
              <label htmlFor="from-decade-mobile" className="text-xs text-foreground-muted">
                From
              </label>
              <select
                id="from-decade-mobile"
                value={fromDecade?.toString() || ""}
                onChange={(e) => updateParams({ from: e.target.value || undefined })}
                className="rounded border border-border-theme/30 bg-surface px-2 py-1.5 text-sm"
              >
                {DECADE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="to-decade-mobile" className="text-xs text-foreground-muted">
                To
              </label>
              <select
                id="to-decade-mobile"
                value={toDecade?.toString() || ""}
                onChange={(e) => updateParams({ to: e.target.value || undefined })}
                className="rounded border border-border-theme/30 bg-surface px-2 py-1.5 text-sm"
              >
                {DECADE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="min-deaths-mobile" className="text-xs text-foreground-muted">
                Min Deaths
              </label>
              <select
                id="min-deaths-mobile"
                value={minDeadActors.toString()}
                onChange={(e) =>
                  updateParams({ minDeaths: e.target.value === "3" ? undefined : e.target.value })
                }
                className="rounded border border-border-theme/30 bg-surface px-2 py-1.5 text-sm"
              >
                {minDeathsOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between md:hidden">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground-muted">
              <input
                type="checkbox"
                checked={includeObscure}
                onChange={(e) =>
                  updateParams({ includeObscure: e.target.checked ? "true" : undefined })
                }
                className="rounded border-border-theme/30"
              />
              Include obscure
            </label>

            {hasFilters && (
              <button
                onClick={() => setSearchParams(new URLSearchParams())}
                className="text-xs text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Desktop filters - inline */}
          <div className="hidden flex-wrap items-center justify-center gap-4 md:flex">
            <div className="flex items-center gap-2">
              <label htmlFor="from-decade" className="text-sm text-foreground-muted">
                From:
              </label>
              <select
                id="from-decade"
                value={fromDecade?.toString() || ""}
                onChange={(e) => updateParams({ from: e.target.value || undefined })}
                className="rounded border border-border-theme/30 bg-surface px-2 py-1 text-sm"
              >
                {DECADE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="to-decade" className="text-sm text-foreground-muted">
                To:
              </label>
              <select
                id="to-decade"
                value={toDecade?.toString() || ""}
                onChange={(e) => updateParams({ to: e.target.value || undefined })}
                className="rounded border border-border-theme/30 bg-surface px-2 py-1 text-sm"
              >
                {DECADE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="min-deaths" className="text-sm text-foreground-muted">
                Min Deaths:
              </label>
              <select
                id="min-deaths"
                value={minDeadActors.toString()}
                onChange={(e) =>
                  updateParams({ minDeaths: e.target.value === "3" ? undefined : e.target.value })
                }
                className="rounded border border-border-theme/30 bg-surface px-2 py-1 text-sm"
              >
                {minDeathsOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground-muted">
              <input
                type="checkbox"
                checked={includeObscure}
                onChange={(e) =>
                  updateParams({ includeObscure: e.target.checked ? "true" : undefined })
                }
                className="rounded border-border-theme/30"
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
        </div>

        {noResults ? (
          <div className="text-center text-foreground-muted">
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
                  className="rounded bg-foreground-muted px-4 py-2 text-sm text-white transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <span className="text-sm text-foreground-muted">
                  Page {page} of {data.pagination.totalPages}
                </span>

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="rounded bg-foreground-muted px-4 py-2 text-sm text-white transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            {/* Total count */}
            <p className="mt-4 text-center text-sm text-foreground-muted">
              Showing {data.movies.length.toLocaleString()} of{" "}
              {data.pagination.totalCount.toLocaleString()} movies
            </p>

            <CalculationExplainer type="movies" />
          </>
        )}
      </div>
    </>
  )
}
