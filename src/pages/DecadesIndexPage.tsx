import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useDecadeCategories } from "@/hooks/useDeathsByDecade"
import { SkullIcon } from "@/components/icons"
import type { DecadeCategory } from "@/types"
import { getProfileUrl } from "@/services/api"

interface DecadeCardProps {
  category: DecadeCategory
}

function DecadeCard({ category }: DecadeCardProps) {
  const decadeLabel = `${category.decade}s`
  const { featuredActor, topCauses } = category

  return (
    <Link
      to={`/deaths/decade/${decadeLabel}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-beige transition-colors hover:bg-cream"
    >
      {/* Featured Actor Section */}
      <div className="relative h-32 bg-brown-medium/20">
        {featuredActor?.profilePath ? (
          <img
            src={getProfileUrl(featuredActor.profilePath, "w185") || ""}
            alt={featuredActor.name}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <SkullIcon size={40} className="text-brown-medium/40" />
          </div>
        )}
        {/* Decade overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <h2 className="font-display text-2xl text-white">{decadeLabel}</h2>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col p-3">
        {/* Death count */}
        <p className="mb-2 text-sm font-medium text-accent">
          {category.count.toLocaleString()} {category.count === 1 ? "death" : "deaths"}
        </p>

        {/* Featured Actor Info */}
        {featuredActor && (
          <div className="mb-2 border-b border-brown-medium/20 pb-2">
            <p className="text-xs text-text-muted">Top Actor</p>
            <p className="truncate font-medium text-brown-dark">{featuredActor.name}</p>
            {featuredActor.causeOfDeath && (
              <p className="truncate text-xs text-text-muted">{featuredActor.causeOfDeath}</p>
            )}
          </div>
        )}

        {/* Top Causes */}
        {topCauses && topCauses.length > 0 && (
          <div className="mt-auto">
            <p className="mb-1 text-xs text-text-muted">Top Causes</p>
            <ul className="space-y-0.5">
              {topCauses.slice(0, 3).map((cause, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs">
                  <span className="truncate text-brown-dark">{cause.cause}</span>
                  <span className="ml-2 shrink-0 text-text-muted">{cause.count}</span>
                </li>
              ))}
            </ul>
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
      <div className="mx-auto max-w-5xl">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-64 rounded bg-brown-medium/20" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="h-64 rounded-lg bg-brown-medium/20" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl text-center">
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

      <div data-testid="decades-index-page" className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Deaths by Decade</h1>
          <p className="text-text-muted">
            {totalDeaths.toLocaleString()} deaths across {data.decades.length} decades
          </p>
        </div>

        <div data-testid="decades-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.decades.map((category) => (
            <DecadeCard key={category.decade} category={category} />
          ))}
        </div>
      </div>
    </>
  )
}
