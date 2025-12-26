import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useAllDeaths } from "@/hooks/useAllDeaths"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import HoverTooltip from "@/components/common/HoverTooltip"
import { PersonIcon, InfoIcon } from "@/components/icons"
import type { AllDeath } from "@/types"

function ActorRow({ person }: { person: AllDeath }) {
  const slug = createActorSlug(person.name, person.id)
  const profileUrl = getProfileUrl(person.profilePath, "w185")

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`death-row-${person.id}`}
      className="block rounded-lg bg-white p-3 transition-colors hover:bg-cream"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-brown-medium">
          {person.rank}
        </span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={person.name}
            className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-beige">
            <PersonIcon size={24} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-brown-dark">{person.name}</h3>
          <p className="text-sm text-text-muted">
            Died {formatDate(person.deathday)}
            {person.ageAtDeath && ` · Age ${person.ageAtDeath}`}
          </p>
        </div>

        {person.causeOfDeath && (
          <div className="flex-shrink-0 text-right">
            <p className="text-sm text-brown-dark">
              {person.causeOfDeathDetails ? (
                <HoverTooltip content={person.causeOfDeathDetails}>
                  <span
                    className="underline decoration-dotted"
                    data-testid={`death-details-${person.id}`}
                  >
                    {toTitleCase(person.causeOfDeath)}
                    <InfoIcon
                      size={14}
                      className="ml-1 inline-block align-text-bottom text-brown-medium"
                    />
                  </span>
                </HoverTooltip>
              ) : (
                toTitleCase(person.causeOfDeath)
              )}
            </p>
          </div>
        )}
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-brown-medium">
          {person.rank}
        </span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={person.name}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-beige">
            <PersonIcon size={20} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-brown-dark">{person.name}</h3>
          <p className="text-xs text-text-muted">
            Died {formatDate(person.deathday)}
            {person.ageAtDeath && ` · Age ${person.ageAtDeath}`}
          </p>
          {person.causeOfDeath && (
            <p className="mt-1 text-xs text-brown-dark">{toTitleCase(person.causeOfDeath)}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function AllDeathsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const includeObscure = searchParams.get("includeObscure") === "true"

  const { data, isLoading, error } = useAllDeaths({ page, includeObscure })

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    if (newPage > 1) {
      newParams.set("page", String(newPage))
    } else {
      newParams.delete("page")
    }
    setSearchParams(newParams)
  }

  const toggleIncludeObscure = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams)
    if (checked) {
      newParams.set("includeObscure", "true")
    } else {
      newParams.delete("includeObscure")
    }
    newParams.delete("page") // Reset to first page when filter changes
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.deaths.length === 0

  return (
    <>
      <Helmet>
        <title>All Deaths | Dead on Film</title>
        <meta
          name="description"
          content="Complete list of deceased actors in our database, ordered by death date. Browse through thousands of actors who have passed away."
        />
        <meta property="og:title" content="All Deaths | Dead on Film" />
        <meta
          property="og:description"
          content="Complete list of deceased actors in our database, ordered by death date"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="All Deaths | Dead on Film" />
        <meta
          name="twitter:description"
          content="Complete list of deceased actors in our database, ordered by death date"
        />
        <link rel="canonical" href="https://deadonfilm.com/deaths/all" />
      </Helmet>

      <div data-testid="all-deaths-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">All Deaths</h1>
          <p className="mt-2 text-sm text-text-muted">
            {includeObscure
              ? "All deceased actors in our database, ordered by death date (most recent first)."
              : "Well-known deceased actors in our database, ordered by death date (most recent first)."}
          </p>
        </div>

        {/* Filter */}
        <div className="mb-4 flex justify-center">
          <label
            className="flex cursor-pointer items-center gap-2 text-sm text-text-muted"
            data-testid="include-obscure-filter"
          >
            <input
              type="checkbox"
              checked={includeObscure}
              onChange={(e) => toggleIncludeObscure(e.target.checked)}
              className="h-4 w-4 rounded border-brown-medium text-brown-dark focus:ring-brown-medium"
            />
            Include lesser-known actors
          </label>
        </div>

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No deaths found in our database.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.deaths.map((person) => (
                <ActorRow key={person.id} person={person} />
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded bg-brown-medium px-4 py-2 text-sm text-white transition-colors hover:bg-brown-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <span className="text-sm text-text-muted">
                  Page {page} of {data.pagination.totalPages}
                </span>

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="rounded bg-brown-medium px-4 py-2 text-sm text-white transition-colors hover:bg-brown-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            {/* Total count */}
            <p className="mt-4 text-center text-sm text-text-muted">
              Showing {data.deaths.length} of {data.pagination.totalCount} actors
            </p>
          </>
        )}
      </div>
    </>
  )
}
