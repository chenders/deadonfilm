import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useForeverYoung } from "@/hooks/useForeverYoung"
import { createMovieSlug, createActorSlug } from "@/utils/slugify"
import { getPosterUrl, getProfileUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import CauseOfDeathBadge from "@/components/common/CauseOfDeathBadge"
import { PersonIcon } from "@/components/icons"
import type { ForeverYoungMovie } from "@/types"

function MovieRow({ movie }: { movie: ForeverYoungMovie }) {
  const movieSlug = createMovieSlug(
    movie.title,
    movie.releaseYear?.toString() || "unknown",
    movie.id
  )
  const actorSlug = createActorSlug(movie.actor.name, movie.actor.id)
  const posterUrl = getPosterUrl(movie.posterPath, "w92")
  const profileUrl = getProfileUrl(movie.actor.profilePath, "w185")

  return (
    <div
      data-testid={`forever-young-row-${movie.id}`}
      className="rounded-lg bg-surface-elevated p-3 transition-colors hover:bg-cream"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-brown-medium">{movie.rank}</span>

        {/* Movie section (left) */}
        <Link to={`/movie/${movieSlug}`} className="flex items-center gap-3">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-16 w-11 flex-shrink-0 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded bg-beige text-xs text-brown-medium">
              No poster
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg text-brown-dark hover:underline">
              {movie.title}
            </h3>
            <p className="text-sm text-text-muted">{movie.releaseYear || "Unknown year"}</p>
          </div>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actor section (right) */}
        <Link to={`/actor/${actorSlug}`} className="flex items-center gap-3 text-right">
          <div className="min-w-0">
            <p className="font-display text-brown-dark hover:underline">{movie.actor.name}</p>
            <p className="text-sm text-accent">
              Died {Math.round(movie.actor.yearsLost)} years early
            </p>
            {movie.actor.causeOfDeath && (
              <p className="max-w-xs truncate text-xs text-text-muted">
                <CauseOfDeathBadge
                  causeOfDeath={movie.actor.causeOfDeath}
                  causeOfDeathDetails={movie.actor.causeOfDeathDetails}
                  testId={`forever-young-death-details-${movie.id}`}
                />
              </p>
            )}
          </div>
          {profileUrl ? (
            <img
              src={profileUrl}
              alt={movie.actor.name}
              className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-beige">
              <PersonIcon size={24} className="text-brown-medium" />
            </div>
          )}
        </Link>
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-brown-medium">
          {movie.rank}
        </span>

        <Link to={`/movie/${movieSlug}`} className="flex-shrink-0">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-14 w-10 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-14 w-10 items-center justify-center rounded bg-beige text-[8px] text-brown-medium">
              No poster
            </div>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link to={`/movie/${movieSlug}`}>
            <h3 className="truncate font-display text-base text-brown-dark">{movie.title}</h3>
          </Link>
          <p className="text-xs text-text-muted">{movie.releaseYear || "Unknown year"}</p>
          <Link to={`/actor/${actorSlug}`} className="mt-1 block">
            <p className="text-xs text-brown-dark">
              <span className="font-medium">{movie.actor.name}</span>
              <span className="text-accent">
                {" "}
                died {Math.round(movie.actor.yearsLost)} years early
              </span>
            </p>
          </Link>
          {movie.actor.causeOfDeath && (
            <p className="truncate text-xs text-text-muted">
              <CauseOfDeathBadge
                causeOfDeath={movie.actor.causeOfDeath}
                causeOfDeathDetails={movie.actor.causeOfDeathDetails}
                testId={`forever-young-death-details-mobile-${movie.id}`}
              />
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ForeverYoungPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))

  const { data, isLoading, error } = useForeverYoung(page)

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    if (newPage > 1) {
      newParams.set("page", String(newPage))
    } else {
      newParams.delete("page")
    }
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading forever young movies..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.movies.length === 0

  return (
    <>
      <Helmet>
        <title>Forever Young | Dead on Film</title>
        <meta
          name="description"
          content="Movies and TV shows featuring actors who died tragically young, losing 40% or more of their expected lifespan. Ranked by years of life lost."
        />
        <meta property="og:title" content="Forever Young | Dead on Film" />
        <meta
          property="og:description"
          content="Movies and TV shows featuring actors who died tragically young"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Forever Young | Dead on Film" />
        <meta
          name="twitter:description"
          content="Movies and TV shows featuring actors who died tragically young"
        />
        <link rel="canonical" href="https://deadonfilm.com/forever-young" />
      </Helmet>

      <div data-testid="forever-young-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">
            <span className="mr-2">👼</span>
            Forever Young
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Movies featuring leading actors who died tragically young, losing 40% or more of their
            expected lifespan. Ranked by years of life lost.
          </p>
        </div>

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No forever young movies found in our database.</p>
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
              Showing {data.movies.length.toLocaleString()} of{" "}
              {data.pagination.totalCount.toLocaleString()} movies
              {data.pagination.totalPages === 20 && " (showing first 1,000)"}
            </p>
          </>
        )}
      </div>
    </>
  )
}
