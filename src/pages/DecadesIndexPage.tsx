import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useDecadeCategories } from "@/hooks/useDeathsByDecade"
import { SkullIcon } from "@/components/icons"

export default function DecadesIndexPage() {
  const { data, isLoading, error } = useDecadeCategories()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-64 rounded bg-brown-medium/20" />
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {[...Array(9)].map((_, i) => (
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
          content="Browse movie actors by decade of death. Explore mortality across different eras in film history."
        />
        <link rel="canonical" href="https://deadonfilm.com/deaths/decades" />
      </Helmet>

      <div data-testid="decades-index-page" className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Deaths by Decade</h1>
          <p className="text-text-muted">
            {totalDeaths.toLocaleString()} deaths across {data.decades.length} decades
          </p>
        </div>

        <div data-testid="decades-grid" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {data.decades.map((category) => {
            const decadeLabel = `${category.decade}s`
            return (
              <Link
                key={category.decade}
                to={`/deaths/decade/${decadeLabel}`}
                className="flex items-center gap-3 rounded-lg bg-beige p-4 transition-colors hover:bg-cream"
              >
                <SkullIcon size={20} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium text-brown-dark">{decadeLabel}</h2>
                  <p className="text-sm text-text-muted">
                    {category.count.toLocaleString()} {category.count === 1 ? "death" : "deaths"}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
