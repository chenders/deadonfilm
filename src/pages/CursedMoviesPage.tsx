import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useCursedMovies } from "@/hooks/useCursedMovies"
import { getPosterUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import type { CursedMovie } from "@/types"

function MovieRow({ movie }: { movie: CursedMovie }) {
  const posterUrl = getPosterUrl(movie.posterPath, "w92")
  const releaseYear = movie.releaseYear?.toString() || "Unknown"
  const slug = `${movie.title.toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${releaseYear}-${movie.id}`
  const excessDeaths = Math.round((movie.deceasedCount - movie.expectedDeaths) * 10) / 10

  return (
    <Link
      to={`/movie/${slug}`}
      className="flex items-center gap-4 rounded-lg bg-white p-3 transition-colors hover:bg-cream"
    >
      <span className="w-8 text-center font-display text-lg text-brown-medium">
        {movie.rank}
      </span>

      <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-beige">
        {posterUrl ? (
          <img src={posterUrl} alt="" className="h-full w-full object-cover" />
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

export default function CursedMoviesPage() {
  const { data, isLoading, error } = useCursedMovies(50)

  if (isLoading) {
    return <LoadingSpinner message="Loading cursed movies..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data || data.movies.length === 0) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="mb-4 font-display text-3xl text-brown-dark">Most Cursed Movies</h1>
        <p className="text-text-muted">
          No mortality data available yet. Try searching for some movies first!
        </p>
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>Most Cursed Movies - Dead on Film</title>
        <meta
          name="description"
          content="Discover the most cursed movies in cinema history. Ranked by mortality surprise score - films where cast deaths exceeded statistical expectations."
        />
        <meta property="og:title" content="Most Cursed Movies - Dead on Film" />
        <meta
          property="og:description"
          content="Movies ranked by how many cast members died above statistical expectations"
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <div data-testid="cursed-movies-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">Most Cursed Movies</h1>
          <p className="mt-2 text-text-muted">
            Movies ranked by mortality surprise score - where actual deaths exceeded statistical
            expectations based on cast ages
          </p>
        </div>

        <div className="space-y-2">
          {data.movies.map((movie) => (
            <MovieRow key={movie.id} movie={movie} />
          ))}
        </div>

        <div className="mt-8 rounded-lg bg-beige p-4 text-center text-sm text-text-muted">
          <p>
            The curse score shows how much higher the mortality rate is compared to what would be
            expected based on the cast's ages at filming. A score of 50% means 50% more deaths
            than predicted by actuarial life tables.
          </p>
        </div>
      </div>
    </>
  )
}
