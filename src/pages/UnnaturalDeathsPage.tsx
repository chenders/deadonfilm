import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useUnnaturalDeaths } from "@/hooks/useUnnaturalDeaths"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import CauseOfDeathBadge from "@/components/common/CauseOfDeathBadge"
import { PersonIcon } from "@/components/icons"
import type { UnnaturalDeath, UnnaturalDeathCategory } from "@/types"

function ActorRow({ person }: { person: UnnaturalDeath }) {
  const slug = createActorSlug(person.name, person.id)
  const profileUrl = getProfileUrl(person.profilePath, "w185")

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`unnatural-death-row-${person.id}`}
      className="block rounded-lg bg-surface p-3 transition-colors hover:bg-surface-muted"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-foreground-muted">
          {person.rank}
        </span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={person.name}
            className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted">
            <PersonIcon size={24} className="text-foreground-muted" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-foreground">{person.name}</h3>
          <p className="text-sm text-foreground-muted">
            Died {formatDate(person.deathday)}
            {person.ageAtDeath && ` · Age ${person.ageAtDeath}`}
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          {person.causeOfDeath && (
            <p className="text-sm text-foreground">
              <CauseOfDeathBadge
                causeOfDeath={person.causeOfDeath}
                causeOfDeathDetails={person.causeOfDeathDetails}
                testId={`unnatural-death-details-${person.id}`}
                iconSize={14}
              />
            </p>
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-foreground-muted">
          {person.rank}
        </span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={person.name}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted">
            <PersonIcon size={20} className="text-foreground-muted" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-foreground">{person.name}</h3>
          <p className="text-xs text-foreground-muted">
            Died {formatDate(person.deathday)}
            {person.ageAtDeath && ` · Age ${person.ageAtDeath}`}
          </p>
          {person.causeOfDeath && (
            <p className="mt-1 text-xs text-foreground">
              <CauseOfDeathBadge
                causeOfDeath={person.causeOfDeath}
                causeOfDeathDetails={person.causeOfDeathDetails}
                testId={`unnatural-death-details-mobile-${person.id}`}
              />
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

const CATEGORY_LABELS: Record<UnnaturalDeathCategory | "all", string> = {
  all: "All",
  suicide: "Suicide",
  accident: "Accident",
  overdose: "Overdose",
  homicide: "Homicide",
  other: "Other",
}

export default function UnnaturalDeathsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const category = (searchParams.get("category") || "all") as UnnaturalDeathCategory | "all"
  const showSelfInflicted = searchParams.get("showSelfInflicted") === "true"
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useUnnaturalDeaths({
    page,
    category,
    showSelfInflicted,
    includeObscure,
  })

  const updateParams = (updates: {
    page?: number
    category?: UnnaturalDeathCategory | "all"
    showSelfInflicted?: boolean
    includeObscure?: boolean
  }) => {
    const newParams = new URLSearchParams(searchParams)

    if (updates.page !== undefined) {
      if (updates.page > 1) {
        newParams.set("page", String(updates.page))
      } else {
        newParams.delete("page")
      }
    }

    if (updates.category !== undefined) {
      if (updates.category !== "all") {
        newParams.set("category", updates.category)
      } else {
        newParams.delete("category")
      }
      // Reset page when changing category
      newParams.delete("page")
    }

    if (updates.showSelfInflicted !== undefined) {
      if (updates.showSelfInflicted) {
        newParams.set("showSelfInflicted", "true")
      } else {
        newParams.delete("showSelfInflicted")
      }
      // Reset page when changing filter
      newParams.delete("page")
    }

    if (updates.includeObscure !== undefined) {
      if (updates.includeObscure) {
        newParams.set("includeObscure", "true")
      } else {
        newParams.delete("includeObscure")
      }
      // Reset page when changing filter
      newParams.delete("page")
    }

    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading unnatural deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.persons.length === 0

  return (
    <>
      <Helmet>
        <title>Unnatural Deaths | Dead on Film</title>
        <meta
          name="description"
          content="Actors who died from unnatural causes including accidents, overdoses, homicides, and suicides."
        />
        <meta property="og:title" content="Unnatural Deaths | Dead on Film" />
        <meta
          property="og:description"
          content="Actors who died from unnatural causes including accidents, overdoses, homicides, and suicides"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Unnatural Deaths | Dead on Film" />
        <meta
          name="twitter:description"
          content="Actors who died from unnatural causes including accidents, overdoses, homicides, and suicides"
        />
        <link rel="canonical" href="https://deadonfilm.com/unnatural-deaths" />
      </Helmet>

      <div data-testid="unnatural-deaths-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-foreground">Unnatural Deaths</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Actors who died from unnatural causes. Ordered by death date, most recent first.
          </p>
        </div>

        {/* Category tabs */}
        {data?.categories && data.categories.length > 0 && (
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => updateParams({ category: "all" })}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                category === "all"
                  ? "bg-foreground text-surface"
                  : "bg-surface-muted text-foreground hover:bg-foreground/20"
              }`}
              data-testid="category-tab-all"
            >
              All ({data.categories.reduce((sum, c) => sum + c.count, 0)})
            </button>
            {data.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => updateParams({ category: cat.id })}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  category === cat.id
                    ? "bg-foreground text-surface"
                    : "bg-surface-muted text-foreground hover:bg-foreground/20"
                }`}
                data-testid={`category-tab-${cat.id}`}
              >
                {cat.label} ({cat.count.toLocaleString()})
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap justify-center gap-4">
          {/* Show self-inflicted toggle (only show when viewing all category) */}
          {category === "all" && (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground-muted"
              data-testid="show-self-inflicted-filter"
            >
              <input
                type="checkbox"
                checked={showSelfInflicted}
                onChange={(e) => updateParams({ showSelfInflicted: e.target.checked })}
                className="h-4 w-4 rounded border-border-theme text-foreground focus:ring-border-theme"
              />
              Show self-inflicted deaths
            </label>
          )}

          {/* Include lesser-known actors */}
          <label
            className="flex cursor-pointer items-center gap-2 text-sm text-foreground-muted"
            data-testid="include-obscure-filter"
          >
            <input
              type="checkbox"
              checked={includeObscure}
              onChange={(e) => updateParams({ includeObscure: e.target.checked })}
              className="h-4 w-4 rounded border-border-theme text-foreground focus:ring-border-theme"
            />
            Include lesser-known actors
          </label>
        </div>

        {noResults ? (
          <div className="text-center text-foreground-muted">
            <p>
              No {category !== "all" ? CATEGORY_LABELS[category].toLowerCase() : "unnatural"} deaths
              found.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.persons.map((person) => (
                <ActorRow key={person.id} person={person} />
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => updateParams({ page: page - 1 })}
                  disabled={page <= 1}
                  className="rounded bg-foreground-muted px-4 py-2 text-sm text-surface transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <span className="text-sm text-foreground-muted">
                  Page {page} of {data.pagination.totalPages}
                </span>

                <button
                  onClick={() => updateParams({ page: page + 1 })}
                  disabled={page >= data.pagination.totalPages}
                  className="rounded bg-foreground-muted px-4 py-2 text-sm text-surface transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            {/* Total count */}
            <p className="mt-4 text-center text-sm text-foreground-muted">
              Showing {data.persons.length.toLocaleString()} of{" "}
              {data.pagination.totalCount.toLocaleString()} actors
            </p>
          </>
        )}
      </div>
    </>
  )
}
