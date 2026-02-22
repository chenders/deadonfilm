import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useGenreCategories } from "@/hooks/useMoviesByGenre"
import { FilmReelIcon } from "@/components/icons"

export default function GenresIndexPage() {
  const { data, isLoading, error } = useGenreCategories()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-64 rounded bg-brown-medium/20" />
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-brown-medium/20" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl text-center">
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

      <div data-testid="genres-index-page" className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Movies by Genre</h1>
          <p className="text-text-primary">
            {totalMovies.toLocaleString()} movies across {data.genres.length} genres
          </p>
        </div>

        <div data-testid="genres-grid" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {data.genres.map((category) => (
            <Link
              key={category.slug}
              to={`/movies/genre/${category.slug}`}
              className="flex items-center gap-3 rounded-lg bg-beige p-4 transition-colors hover:bg-cream"
            >
              <FilmReelIcon size={20} className="shrink-0 text-brown-medium" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium text-brown-dark" title={category.genre}>
                  {category.genre}
                </h2>
                <p className="text-sm text-text-muted">
                  {category.count.toLocaleString()} {category.count === 1 ? "movie" : "movies"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
