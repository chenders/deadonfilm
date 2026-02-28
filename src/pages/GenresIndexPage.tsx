import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useGenreCategories } from "@/hooks/useMoviesByGenre"
import { FilmReelIcon } from "@/components/icons"
import type { GenreCategory } from "@/types"
import { getBackdropUrl } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"

// Maximum number of top causes to display per genre card
const MAX_DISPLAYED_CAUSES = 3

interface GenreCardProps {
  category: GenreCategory
}

function GenreCard({ category }: GenreCardProps) {
  const { topCauses, topMovie } = category

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg bg-beige shadow-md transition-shadow hover:shadow-lg">
      {/* Invisible overlay link for genre page - covers entire card */}
      <Link
        to={`/movies/genre/${category.slug}`}
        className="absolute inset-0 z-0"
        aria-label={`View movies in ${category.genre}`}
      />

      {/* Movie Backdrop Image Section (pointer-events-none allows clicks to pass to overlay link) */}
      <div className="pointer-events-none relative h-48 bg-brown-medium/30">
        {topMovie?.backdropPath ? (
          <img
            src={getBackdropUrl(topMovie.backdropPath, "w500") || ""}
            alt={topMovie.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-brown-medium/20 to-brown-dark/30">
            <FilmReelIcon size={48} className="text-brown-medium/40" />
          </div>
        )}

        {/* Dark gradient overlay for readability */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Movie Title Badge - Top Right (links to movie page) */}
        {topMovie && (
          <Link
            to={`/movie/${createMovieSlug(topMovie.title, topMovie.releaseYear?.toString() || "", topMovie.tmdbId)}`}
            className="pointer-events-auto absolute right-2 top-2 z-10 rounded bg-overlay/80 px-2 py-1 transition-colors hover:bg-overlay/90"
          >
            <span className="text-xs text-overlay-text/90">
              {topMovie.title}
              {topMovie.releaseYear && ` (${topMovie.releaseYear})`}
            </span>
          </Link>
        )}
      </div>

      {/* Content Section */}
      <div className="relative z-10 flex flex-1 flex-col p-4">
        {/* Genre heading (links to genre page) */}
        <Link to={`/movies/genre/${category.slug}`} className="hover:underline">
          <h2 className="text-2xl font-semibold text-brown-dark">{category.genre}</h2>
        </Link>

        {/* Movie count */}
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">
          {category.count.toLocaleString()} Movies
        </p>

        {/* Top Causes as pills (links to cause pages) */}
        {topCauses && topCauses.length > 0 && (
          <div className="mt-auto">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Top Causes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topCauses.slice(0, MAX_DISPLAYED_CAUSES).map((cause) => (
                <Link
                  key={cause.cause}
                  to={`/deaths/${cause.slug}`}
                  className="rounded-full border border-brown-medium/30 bg-cream px-2.5 py-1 text-xs text-brown-dark transition-colors hover:bg-brown-light/30"
                >
                  {cause.cause}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function GenresIndexPage() {
  const { data, isLoading, error } = useGenreCategories()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="animate-pulse">
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-2 h-10 w-64 rounded bg-brown-medium/20" />
            <div className="h-5 w-48 rounded bg-brown-medium/20" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-80 rounded-lg bg-brown-medium/20" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl text-center">
        <h1 className="mb-4 font-display text-3xl text-brown-dark">Movies by Genre</h1>
        <p className="text-text-muted">Failed to load genre categories. Please try again later.</p>
      </div>
    )
  }

  const totalMovies = data.genres.reduce((sum, g) => sum + g.count, 0)

  return (
    <>
      <Helmet>
        <title>Movies by Genre - Dead on Film</title>
        <meta
          name="description"
          content="Browse movies and TV shows by genre. Explore horror, drama, action, and more ranked by mortality statistics."
        />
        <link rel="canonical" href="https://deadonfilm.com/movies/genres" />
      </Helmet>

      <div data-testid="genres-index-page" className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-4xl text-brown-dark">Movies by Genre</h1>
          <p className="text-sm font-medium uppercase tracking-widest text-text-primary">
            {totalMovies.toLocaleString()} Movies Across {data.genres.length} Genres
          </p>
        </div>

        <div data-testid="genres-grid" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.genres.map((category) => (
            <GenreCard key={category.slug} category={category} />
          ))}
        </div>
      </div>
    </>
  )
}
