import { useParams, useSearchParams, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useDeathsByDecade, useDecadeCategories } from "@/hooks/useDeathsByDecade"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import { PersonIcon } from "@/components/icons"
import type { DeathByDecade } from "@/types"

function ActorRow({ person, rank }: { person: DeathByDecade; rank: number }) {
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
        <span className="w-8 text-center font-display text-lg text-brown-medium">{rank}</span>

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
          {person.causeOfDeath && (
            <p className="max-w-xs truncate text-sm text-text-muted" title={person.causeOfDeath}>
              {person.causeOfDeath}
            </p>
          )}
          {person.yearsLost !== null && person.yearsLost > 0 && (
            <p className="text-xs text-accent">{Math.round(person.yearsLost)} years lost</p>
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-brown-medium">
          {rank}
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
            <p className="mt-1 truncate text-xs text-brown-dark">{person.causeOfDeath}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

function DecadeSelector({ currentDecade }: { currentDecade: string }) {
  const { data } = useDecadeCategories()

  if (!data || data.decades.length === 0) return null

  return (
    <div className="mb-6 flex flex-wrap justify-center gap-2">
      {data.decades.map((d) => {
        const decadeStr = `${d.decade}s`
        const isActive = currentDecade === decadeStr
        return (
          <Link
            key={d.decade}
            to={`/deaths/decade/${decadeStr}`}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              isActive ? "bg-brown-dark text-white" : "bg-beige text-brown-dark hover:bg-cream"
            }`}
          >
            {decadeStr}
          </Link>
        )
      })}
    </div>
  )
}

export default function DeathsByDecadePage() {
  const { decade } = useParams<{ decade: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))

  const { data, isLoading, error } = useDeathsByDecade(decade || "", page)

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
    return <LoadingSpinner message="Loading deaths..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Decade not found" />
  }

  const noResults = data.deaths.length === 0
  const baseOffset = (page - 1) * data.pagination.pageSize

  return (
    <>
      <Helmet>
        <title>Deaths in the {data.decadeLabel} | Dead on Film</title>
        <meta
          name="description"
          content={`${data.pagination.totalCount} actors who died in the ${data.decadeLabel}. Browse movie actors by decade of death.`}
        />
        <link rel="canonical" href={`https://deadonfilm.com/deaths/decade/${data.decadeLabel}`} />
      </Helmet>

      <div data-testid="deaths-by-decade-page" className="mx-auto max-w-3xl">
        <div className="mb-4 text-center">
          <Link
            to="/deaths/decades"
            className="mb-2 inline-block text-sm text-brown-medium hover:text-brown-dark"
          >
            &larr; All Decades
          </Link>
          <h1 className="font-display text-3xl text-brown-dark">
            Deaths in the {data.decadeLabel}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {data.pagination.totalCount.toLocaleString()}{" "}
            {data.pagination.totalCount === 1 ? "actor" : "actors"} died during this decade
          </p>
        </div>

        <DecadeSelector currentDecade={decade || ""} />

        {noResults ? (
          <div className="text-center text-text-muted">
            <p>No deaths found for this decade.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.deaths.map((person, index) => (
                <ActorRow key={person.id} person={person} rank={baseOffset + index + 1} />
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
