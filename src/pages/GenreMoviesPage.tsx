import { useParams, useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useMoviesByGenre, useGenreCategories } from "@/hooks/useMoviesByGenre"
import { createMovieSlug } from "@/utils/slugify"
import { getPosterUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import { FilmReelIcon, SkullIcon } from "@/components/icons"
import type { MovieByGenre } from "@/types"

function MovieRow({ movie, rank }: { movie: MovieByGenre; rank: number }) {
  // createMovieSlug expects a date string; convert releaseYear to a date-like string
  const releaseDate = movie.releaseYear ? `${movie.releaseYear}-01-01` : ""
  const slug = createMovieSlug(movie.title, releaseDate, movie.id)
  const posterUrl = getPosterUrl(movie.posterPath, "w92")

  return (
    <Link
      to={`/movie/${slug}`}
      data-testid={`movie-row-${movie.id}`}
      className="block rounded-lg bg-surface p-3 transition-colors hover:bg-surface-muted"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-foreground-muted">{rank}</span>

        {posterUrl ? (
          <img
            src={posterUrl}
            alt={movie.title}
            className="h-16 w-11 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded bg-surface-muted">
            <FilmReelIcon size={20} className="text-foreground-muted" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-foreground">
            {movie.title}
            {movie.releaseYear && (
              <span className="ml-2 text-base text-foreground-muted">({movie.releaseYear})</span>
            )}
          </h3>
          <p className="text-sm text-foreground-muted">
            {movie.deceasedCount.toLocaleString()} of {movie.castCount.toLocaleString()} cast
            deceased
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-1 text-accent">
            <SkullIcon size={16} />
            <span className="font-medium">{movie.deceasedCount.toLocaleString()}</span>
          </div>
          {movie.mortalitySurpriseScore !== null && movie.mortalitySurpriseScore > 0 && (
            <p className="text-xs text-foreground-muted">
              +{(movie.mortalitySurpriseScore * 100).toFixed(0)}% curse
            </p>
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-foreground-muted">
          {rank}
        </span>

        {posterUrl ? (
          <img
            src={posterUrl}
            alt={movie.title}
            className="h-14 w-10 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-14 w-10 flex-shrink-0 items-center justify-center rounded bg-surface-muted">
            <FilmReelIcon size={16} className="text-foreground-muted" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-foreground">
            {movie.title}
            {movie.releaseYear && (
              <span className="ml-1 text-sm text-foreground-muted">({movie.releaseYear})</span>
            )}
          </h3>
          <p className="text-xs text-foreground-muted">
            {movie.deceasedCount.toLocaleString()} of {movie.castCount.toLocaleString()} cast
            deceased
          </p>
          {movie.mortalitySurpriseScore !== null && movie.mortalitySurpriseScore > 0 && (
            <p className="mt-1 text-xs text-accent">
              +{(movie.mortalitySurpriseScore * 100).toFixed(0)}% curse score
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

function GenreSelector({ currentGenreSlug }: { currentGenreSlug: string }) {
  const { data } = useGenreCategories()

  if (!data || data.genres.length === 0) return null

  // Show only top 10 genres in the selector
  const topGenres = data.genres.slice(0, 10)

  return (
    <div className="mb-6 flex flex-wrap justify-center gap-2">
      {topGenres.map((g) => {
        const isActive = currentGenreSlug === g.slug
        return (
          <Link
            key={g.slug}
            to={`/movies/genre/${g.slug}`}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              isActive
                ? "bg-foreground text-white"
                : "bg-surface-muted text-foreground hover:bg-foreground/20"
            }`}
          >
            {g.genre}
          </Link>
        )
      })}
    </div>
  )
}

export default function GenreMoviesPage() {
  const { genre: genreSlug } = useParams<{ genre: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))

  const { data, isLoading, error } = useMoviesByGenre(genreSlug || "", page)

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
    return <LoadingSpinner message="Loading movies..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Genre not found" />
  }

  const noResults = data.movies.length === 0
  const baseOffset = (page - 1) * data.pagination.pageSize

  return (
    <>
      <Helmet>
        <title>{data.genre} Movies | Dead on Film</title>
        <meta
          name="description"
          content={`${data.pagination.totalCount} ${data.genre.toLowerCase()} movies and TV shows ranked by mortality statistics. Browse the most cursed ${data.genre.toLowerCase()} content.`}
        />
        <link rel="canonical" href={`https://deadonfilm.com/movies/genre/${data.slug}`} />
      </Helmet>

      <div data-testid="genre-movies-page" className="mx-auto max-w-3xl">
        <div className="mb-4 text-center">
          <Link
            to="/movies/genres"
            className="mb-2 inline-block text-sm text-foreground-muted hover:text-foreground"
          >
            &larr; All Genres
          </Link>
          <h1 className="font-display text-3xl text-foreground">{data.genre} Movies</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            {data.pagination.totalCount.toLocaleString()}{" "}
            {data.pagination.totalCount === 1 ? "movie" : "movies"} ranked by curse score
          </p>
        </div>

        <GenreSelector currentGenreSlug={genreSlug || ""} />

        {noResults ? (
          <div className="text-center text-foreground-muted">
            <p>No movies found for this genre.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.movies.map((movie, index) => (
                <MovieRow key={movie.id} movie={movie} rank={baseOffset + index + 1} />
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
          </>
        )}
      </div>
    </>
  )
}
