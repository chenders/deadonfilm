import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useCauseCategories } from "@/hooks/useCauseCategories"
import { SkullIcon } from "@/components/icons"

export default function CausesIndexPage() {
  const { data, isLoading, error } = useCauseCategories()

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
        <h1 className="mb-4 font-display text-3xl text-brown-dark">Deaths by Cause</h1>
        <p className="text-text-muted">Failed to load cause categories. Please try again later.</p>
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>Deaths by Cause - Dead on Film</title>
        <meta
          name="description"
          content="Browse actors by cause of death from movies and TV shows. Explore deaths from cancer, heart disease, accidents, and more."
        />
        <link rel="canonical" href="https://deadonfilm.com/deaths" />
      </Helmet>

      <div data-testid="causes-index-page" className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Deaths by Cause</h1>
          <p className="text-text-primary">{data.causes.length} causes of death documented</p>
        </div>

        <div data-testid="causes-grid" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {data.causes.map((category) => (
            <Link
              key={category.slug}
              to={`/deaths/${category.slug}`}
              className="flex items-center gap-3 rounded-lg bg-beige p-4 transition-colors hover:bg-cream"
            >
              <SkullIcon size={20} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium text-brown-dark" title={category.cause}>
                  {category.cause}
                </h2>
                <p className="text-sm text-text-muted">
                  {category.count.toLocaleString()} {category.count === 1 ? "death" : "deaths"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
