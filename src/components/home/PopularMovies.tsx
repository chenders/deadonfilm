import { Link } from "react-router-dom"
import { usePopularMovies } from "@/hooks/usePopularMovies"
import { getPosterUrl } from "@/services/api"
import { FilmReelIcon } from "@/components/icons"

export default function PopularMovies() {
  const { data, isLoading, error } = usePopularMovies(8)

  if (isLoading) {
    return (
      <section data-testid="popular-movies" className="mt-8">
        <div className="animate-pulse">
          <div className="mx-auto mb-3 h-5 w-40 rounded bg-brown-medium/20" />
          <div className="flex justify-center gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 w-20 rounded bg-brown-medium/20" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error || !data || data.movies.length === 0) {
    return null
  }

  return (
    <section data-testid="popular-movies" className="mt-8">
      <h2
        data-testid="popular-movies-title"
        className="mb-3 text-center font-display text-xl text-brown-dark"
      >
        Popular Movies
      </h2>

      <div
        data-testid="popular-movies-list"
        className="flex justify-center gap-2 overflow-x-auto pb-2"
      >
        {data.movies.map((movie, index) => {
          const slug = `${movie.title
            .toLowerCase()
            .replace(/['\u02BC\u2019]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")}-${movie.releaseYear || "unknown"}-${movie.id}`

          const mortalityPercent = Math.round((movie.deceasedCount / movie.castCount) * 100)

          return (
            <Link
              key={movie.id}
              to={`/movie/${slug}`}
              className="animate-fade-slide-in group flex w-20 flex-col items-center rounded-lg bg-beige p-2 text-center transition-colors hover:bg-cream"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {movie.posterPath ? (
                <img
                  src={getPosterUrl(movie.posterPath, "w185")!}
                  alt={movie.title}
                  width={64}
                  height={96}
                  loading="lazy"
                  className="mb-1 h-24 w-16 rounded object-cover shadow-sm"
                />
              ) : (
                <div className="mb-1 flex h-24 w-16 items-center justify-center rounded bg-brown-medium/20">
                  <FilmReelIcon size={24} className="text-text-muted" />
                </div>
              )}

              <h3
                className="w-full truncate text-xs font-medium text-brown-dark"
                title={movie.title}
              >
                {movie.title}
              </h3>
              {movie.releaseYear && <p className="text-xs text-text-muted">{movie.releaseYear}</p>}
              <p className="text-xs text-accent">{mortalityPercent}% deceased</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
