import { Link } from "react-router-dom"
import { useFeaturedMovie } from "@/hooks/useFeaturedMovie"
import { getPosterUrl } from "@/services/api"
import { SkullIcon, FilmReelIcon } from "@/components/icons"
import { createMovieSlug } from "@/utils/slugify"

export default function FeaturedCursedMovie() {
  const { data, isLoading, error } = useFeaturedMovie()

  if (isLoading) {
    return (
      <section data-testid="featured-movie" className="mt-8">
        <div className="animate-pulse rounded-lg bg-beige p-4">
          <div className="mb-3 h-5 w-48 rounded bg-brown-medium/20" />
          <div className="flex gap-4">
            <div className="h-36 w-24 shrink-0 rounded bg-brown-medium/20" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 rounded bg-brown-medium/20" />
              <div className="h-4 w-1/2 rounded bg-brown-medium/20" />
              <div className="h-4 w-2/3 rounded bg-brown-medium/20" />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (error || !data?.movie) {
    return null // Silently fail - this is an enhancement feature
  }

  const movie = data.movie
  const mortalityPercentage = Math.round((movie.deceasedCount / movie.castCount) * 100)
  const releaseDate = movie.releaseYear ? `${movie.releaseYear}-01-01` : ""
  const movieSlug = createMovieSlug(movie.title, releaseDate, movie.tmdbId)

  return (
    <section data-testid="featured-movie" className="mt-8">
      <h2
        data-testid="featured-movie-title"
        className="mb-3 text-center font-display text-xl text-brown-dark"
      >
        Most Cursed Movie
      </h2>

      <Link
        to={`/movie/${movieSlug}`}
        data-testid="featured-movie-link"
        className="block rounded-lg bg-beige p-4 transition-colors hover:bg-cream"
      >
        <div className="flex gap-4">
          {movie.posterPath ? (
            <img
              src={getPosterUrl(movie.posterPath, "w185")!}
              alt={movie.title}
              width={96}
              height={144}
              loading="lazy"
              className="h-36 w-24 shrink-0 rounded object-cover shadow-md"
            />
          ) : (
            <div className="flex h-36 w-24 shrink-0 items-center justify-center rounded bg-brown-medium/20">
              <FilmReelIcon size={32} className="text-text-muted" />
            </div>
          )}

          <div className="flex flex-col justify-center">
            <h3 className="font-display text-lg font-semibold text-brown-dark">
              {movie.title}
              {movie.releaseYear && (
                <span className="ml-2 text-base font-normal text-text-muted">
                  ({movie.releaseYear})
                </span>
              )}
            </h3>

            <div className="mt-2 space-y-1 text-sm">
              <p className="flex items-center gap-2 text-accent">
                <SkullIcon size={14} />
                <span>
                  {movie.deceasedCount.toLocaleString()} of {movie.castCount.toLocaleString()} cast
                  deceased ({mortalityPercentage}%)
                </span>
              </p>
              <p className="text-text-muted">Expected: {movie.expectedDeaths.toFixed(1)} deaths</p>
              <p className="font-medium text-brown-dark">
                Curse Score: +{(movie.mortalitySurpriseScore * 100).toFixed(0)}% above expected
              </p>
            </div>
          </div>
        </div>
      </Link>
    </section>
  )
}
