import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useDecadeCategories } from "@/hooks/useDeathsByDecade"
import { SkullIcon } from "@/components/icons"
import type { DecadeCategory } from "@/types"
import { getProfileUrl, getBackdropUrl } from "@/services/api"

interface DecadeCardProps {
  category: DecadeCategory
}

function DecadeCard({ category }: DecadeCardProps) {
  const decadeLabel = `${category.decade}s`
  const { featuredActor, topCauses, topMovie } = category

  return (
    <Link
      to={`/deaths/decade/${decadeLabel}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-beige shadow-md transition-shadow hover:shadow-lg"
    >
      {/* Movie Backdrop Image Section */}
      <div className="relative h-48 bg-brown-medium/30">
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
            <SkullIcon size={48} className="text-brown-medium/40" />
          </div>
        )}

        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Movie Title Badge - Top Right */}
        {topMovie && (
          <div className="absolute right-2 top-2 rounded bg-black/80 px-2 py-1">
            <span className="text-xs text-white/90">
              {topMovie.title}
              {topMovie.releaseYear && ` (${topMovie.releaseYear})`}
            </span>
          </div>
        )}

        {/* Featured Actor Badge */}
        {featuredActor && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/80 py-1 pl-1 pr-3">
            {featuredActor.profilePath ? (
              <img
                src={getProfileUrl(featuredActor.profilePath, "w45") || ""}
                alt={featuredActor.name}
                loading="lazy"
                decoding="async"
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brown-medium/50">
                <SkullIcon size={14} className="text-white/70" />
              </div>
            )}
            <span className="text-xs font-medium uppercase tracking-wide text-white">
              Top Actor: {featuredActor.name}
            </span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col p-4">
        {/* Decade heading */}
        <h2 className="font-display text-2xl text-brown-dark">{decadeLabel}</h2>

        {/* Death count */}
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">
          {category.count.toLocaleString()} Deaths
        </p>

        {/* Top Causes as pills */}
        {topCauses && topCauses.length > 0 && (
          <div className="mt-auto">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Top Causes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topCauses.slice(0, 3).map((cause, idx) => (
                <span
                  key={idx}
                  className="rounded-full border border-brown-medium/30 bg-cream px-2.5 py-1 text-xs text-brown-dark"
                >
                  {cause.cause}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function DecadesIndexPage() {
  const { data, isLoading, error } = useDecadeCategories()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="animate-pulse">
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-2 h-10 w-64 rounded bg-brown-medium/20" />
            <div className="h-5 w-48 rounded bg-brown-medium/20" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
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
        <h1 className="mb-4 font-display text-3xl text-brown-dark">Deaths by Decade</h1>
        <p className="text-text-muted">Failed to load decade categories. Please try again later.</p>
      </div>
    )
  }

  const totalDeaths = data.decades.reduce((sum, d) => sum + d.count, 0)

  return (
    <>
      <Helmet>
        <title>Deaths by Decade - Dead on Film</title>
        <meta
          name="description"
          content="Browse actors by decade of death from movies and TV shows. Explore mortality across different eras in film and television."
        />
        <link rel="canonical" href="https://deadonfilm.com/deaths/decades" />
      </Helmet>

      <div data-testid="decades-index-page" className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-4xl text-brown-dark">Deaths by Decade</h1>
          <p className="text-sm font-medium uppercase tracking-widest text-text-muted">
            {totalDeaths.toLocaleString()} Deaths Across {data.decades.length} Decades
          </p>
        </div>

        <div data-testid="decades-grid" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.decades.map((category) => (
            <DecadeCard key={category.decade} category={category} />
          ))}
        </div>
      </div>
    </>
  )
}
