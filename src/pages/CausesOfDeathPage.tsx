import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useCauseCategoryIndex } from "@/hooks/useCausesOfDeath"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import {
  RibbonIcon,
  HeartIcon,
  LungsIcon,
  BrainIcon,
  PillIcon,
  WarningIcon,
  SkullIcon,
  VirusIcon,
  KidneyIcon,
  LeafIcon,
  QuestionIcon,
} from "@/components/icons"
import type { CauseCategoryStats } from "@/types"

// Map category slugs to their icons
const categoryIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  cancer: RibbonIcon,
  "heart-disease": HeartIcon,
  respiratory: LungsIcon,
  neurological: BrainIcon,
  overdose: PillIcon,
  accident: WarningIcon,
  suicide: SkullIcon,
  homicide: SkullIcon,
  infectious: VirusIcon,
  "liver-kidney": KidneyIcon,
  natural: LeafIcon,
  other: QuestionIcon,
}

function getCategoryIcon(slug: string) {
  return categoryIcons[slug] || QuestionIcon
}

function CategoryCard({ category }: { category: CauseCategoryStats }) {
  const Icon = getCategoryIcon(category.slug)
  return (
    <Link
      to={`/causes-of-death/${category.slug}`}
      data-testid={`category-card-${category.slug}`}
      className="flex flex-col rounded-lg bg-beige p-4 transition-colors hover:bg-cream"
    >
      <div className="mb-2 flex items-center gap-3">
        <Icon size={20} className="shrink-0 text-accent" />
        <h2 className="truncate font-display text-lg text-brown-dark">{category.label}</h2>
      </div>

      <p className="text-sm text-text-muted">
        {category.count.toLocaleString()} {category.count === 1 ? "death" : "deaths"}
      </p>

      {category.avgAge && (
        <p className="text-xs text-text-muted">Avg age: {Math.round(category.avgAge)}</p>
      )}

      {category.topCauses.length > 0 && (
        <div className="mt-3 border-t border-brown-medium/10 pt-2">
          <ul className="space-y-1">
            {category.topCauses.slice(0, 3).map((cause) => (
              <li key={cause.slug} className="truncate text-xs text-text-muted">
                {cause.cause} ({cause.count})
              </li>
            ))}
          </ul>
        </div>
      )}
    </Link>
  )
}

export default function CausesOfDeathPage() {
  const { data, isLoading, error } = useCauseCategoryIndex()

  if (isLoading) {
    return <LoadingSpinner message="Loading causes of death..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Failed to load data" />
  }

  return (
    <>
      <Helmet>
        <title>Causes of Death - Dead on Film</title>
        <meta
          name="description"
          content="Explore causes of death among actors in movies and TV shows. Browse by category including cancer, heart disease, accidents, and more."
        />
        <meta property="og:title" content="Causes of Death - Dead on Film" />
        <meta
          property="og:description"
          content="Explore causes of death among actors in movies and TV shows"
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://deadonfilm.com/causes-of-death" />
      </Helmet>

      <div data-testid="causes-of-death-page" className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Causes of Death</h1>
          <p className="text-text-muted">
            Explore how actors from movies and TV shows have passed away
          </p>
        </div>

        {/* Stats Banner */}
        <div className="mb-8 grid gap-4 rounded-lg bg-beige p-4 sm:grid-cols-4">
          <div className="text-center">
            <p className="font-display text-2xl text-brown-dark">
              {data.totalWithKnownCause.toLocaleString()}
            </p>
            <p className="text-xs text-text-muted">Known Causes</p>
          </div>

          <div className="text-center">
            <p className="font-display text-2xl text-brown-dark">
              {data.overallAvgAge ? Math.round(data.overallAvgAge) : "-"}
            </p>
            <p className="text-xs text-text-muted">Avg Age at Death</p>
          </div>

          <div className="text-center">
            <p className="font-display text-2xl text-accent">
              {data.overallAvgYearsLost ? Math.round(data.overallAvgYearsLost) : "-"}
            </p>
            <p className="text-xs text-text-muted">Avg Years Lost</p>
          </div>

          <div className="text-center">
            <p className="font-display text-2xl text-brown-dark">{data.categories.length}</p>
            <p className="text-xs text-text-muted">Categories</p>
          </div>
        </div>

        {/* Category Grid */}
        <div
          data-testid="category-grid"
          className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        >
          {data.categories.map((category) => (
            <CategoryCard key={category.slug} category={category} />
          ))}
        </div>
      </div>
    </>
  )
}
