import { useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useCovidDeaths } from "@/hooks/useCovidDeaths"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import { PersonIcon } from "@/components/icons"
import type { CovidDeath } from "@/types"

function ActorRow({ person }: { person: CovidDeath }) {
  const slug = createActorSlug(person.name, person.id)
  const profileUrl = getProfileUrl(person.profilePath, "w185")

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`covid-death-row-${person.id}`}
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

        <div className="flex-shrink-0 text-right">
          {person.causeOfDeath && <p className="text-sm text-brown-dark">{person.causeOfDeath}</p>}
          {person.causeOfDeathDetails && (
            <p
              className="max-w-xs truncate text-xs text-text-muted"
              title={person.causeOfDeathDetails}
            >
              {person.causeOfDeathDetails}
            </p>
          )}
        </div>
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
            <p className="mt-1 text-xs text-brown-dark">{person.causeOfDeath}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function CovidDeathsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))

  const { data, isLoading, error } = useCovidDeaths(page)

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    if (newPage > 1) {
      newParams.set("page", String(newPage))
    } else {
      newParams.delete("page")
    }
    setSearchParams(newParams)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading COVID-19 deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  const noResults = !data || data.persons.length === 0

  return (
    <>
      <Helmet>
        <title>COVID-19 Deaths | Dead on Film</title>
        <meta
          name="description"
          content="Actors who died from COVID-19 or related complications. A memorial to film industry members lost to the pandemic."
        />
        <meta property="og:title" content="COVID-19 Deaths | Dead on Film" />
        <meta
          property="og:description"
          content="Actors who died from COVID-19 or related complications"
        />
        <meta property="og:type" content="website" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="COVID-19 Deaths | Dead on Film" />
        <meta
          name="twitter:description"
          content="Actors who died from COVID-19 or related complications"
        />
        <link rel="canonical" href="https://deadonfilm.com/covid-deaths" />
      </Helmet>

      <div data-testid="covid-deaths-page" className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-brown-dark">COVID-19 Deaths</h1>
          <p className="mt-2 text-sm text-text-muted">
            Actors in our database who died from COVID-19, coronavirus, or related complications.
            Ordered by death date, most recent first.
          </p>
        </div>

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No COVID-19 deaths found in our database.</p>
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
              Showing {data.persons.length} of {data.pagination.totalCount} actors
            </p>
          </>
        )}
      </div>
    </>
  )
}
