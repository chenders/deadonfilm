import { useMemo, useState } from "react"
import { useParams, useLocation, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useActor } from "@/hooks/useActor"
import { createMovieSlug, createShowSlug, createActorSlug, extractActorId } from "@/utils/slugify"
import { formatDate, calculateCurrentAge } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { getProfileUrl, getPosterUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import JsonLd from "@/components/seo/JsonLd"
import { buildPersonSchema, buildBreadcrumbSchema } from "@/utils/schema"
import { PersonIcon, FilmReelIcon, TVIcon } from "@/components/icons"
import { useRelatedActors } from "@/hooks/useRelatedContent"
import RelatedContent from "@/components/content/RelatedContent"
import SeeAlso from "@/components/content/SeeAlso"
import Breadcrumb from "@/components/layout/Breadcrumb"
import AdminActorToolbar from "@/components/admin/AdminActorToolbar"
import AdminActorMetadata from "@/components/admin/AdminActorMetadata"
import DeathSummaryCard from "@/components/death/DeathSummaryCard"
import FactorBadge from "@/components/death/FactorBadge"
import ProjectLink from "@/components/death/ProjectLink"
import RelatedCelebrityCard from "@/components/death/RelatedCelebrityCard"
import type { ActorFilmographyMovie, ActorFilmographyShow } from "@/types"

type FilmographyItem =
  | { type: "movie"; data: ActorFilmographyMovie; year: number | null }
  | { type: "show"; data: ActorFilmographyShow; year: number | null }

function FilmographyRow({ item }: { item: FilmographyItem }) {
  if (item.type === "movie") {
    const movie = item.data
    const posterUrl = getPosterUrl(movie.posterPath, "w92")
    const slug = createMovieSlug(
      movie.title,
      movie.releaseYear?.toString() || "unknown",
      movie.movieId
    )
    const mortalityPercent =
      movie.castCount > 0 ? Math.round((movie.deceasedCount / movie.castCount) * 100) : 0

    return (
      <Link
        to={`/movie/${slug}`}
        className="flex items-center gap-3 rounded-lg bg-surface-elevated p-3 transition-colors hover:bg-cream"
        data-testid="filmography-row"
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={movie.title}
            width={46}
            height={69}
            loading="lazy"
            className="h-[69px] w-[46px] flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-[69px] w-[46px] flex-shrink-0 items-center justify-center rounded bg-beige">
            <FilmReelIcon size={24} className="text-text-muted" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-brown-dark">{movie.title}</h3>
          {movie.releaseYear && <p className="text-sm text-text-muted">{movie.releaseYear}</p>}
          {movie.character && (
            <p className="truncate text-sm italic text-text-muted">as {movie.character}</p>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-display text-lg text-brown-dark">
            {movie.deceasedCount.toLocaleString()}/{movie.castCount.toLocaleString()}
          </p>
          <p className="text-xs text-text-muted">{mortalityPercent}% deceased</p>
        </div>
      </Link>
    )
  }

  // TV Show
  const show = item.data
  const posterUrl = getPosterUrl(show.posterPath, "w92")
  // createShowSlug expects a date string, so we construct one from the year
  const firstAirDate = show.firstAirYear ? `${show.firstAirYear}-01-01` : null
  const slug = createShowSlug(show.name, firstAirDate, show.showId)
  const mortalityPercent =
    show.castCount > 0 ? Math.round((show.deceasedCount / show.castCount) * 100) : 0

  // Format year range
  const yearDisplay =
    show.firstAirYear && show.lastAirYear && show.firstAirYear !== show.lastAirYear
      ? `${show.firstAirYear}–${show.lastAirYear}`
      : show.firstAirYear?.toString() || ""

  return (
    <Link
      to={`/show/${slug}`}
      className="flex items-center gap-3 rounded-lg bg-surface-elevated p-3 transition-colors hover:bg-cream"
      data-testid="filmography-row"
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={show.name}
          width={46}
          height={69}
          loading="lazy"
          className="h-[69px] w-[46px] flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-[69px] w-[46px] flex-shrink-0 items-center justify-center rounded bg-beige">
          <TVIcon size={24} className="text-text-muted" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base text-brown-dark">{show.name}</h3>
        <p className="text-sm text-text-muted">
          {yearDisplay}
          {yearDisplay && " · "}
          {show.episodeCount} episode{show.episodeCount !== 1 ? "s" : ""}
        </p>
        {show.character && (
          <p className="truncate text-sm italic text-text-muted">as {show.character}</p>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="font-display text-lg text-brown-dark">
          {show.deceasedCount.toLocaleString()}/{show.castCount.toLocaleString()}
        </p>
        <p className="text-xs text-text-muted">{mortalityPercent}% deceased</p>
      </div>
    </Link>
  )
}

function formatCareerStatus(status: string | null): string | null {
  if (!status) return null
  return status
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function getSourceDisplayName(type: "wikipedia" | "tmdb" | "imdb" | null): string {
  switch (type) {
    case "wikipedia":
      return "Wikipedia"
    case "tmdb":
      return "TMDB"
    case "imdb":
      return "IMDb"
    default:
      return "source"
  }
}

export default function ActorPage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const { data, isLoading, error } = useActor(slug || "")

  // Combine and sort movies and TV shows chronologically (newest first)
  // Must be before early returns to maintain consistent hook order
  const combinedFilmography = useMemo(() => {
    if (!data) return []
    const { analyzedFilmography, analyzedTVFilmography } = data
    const movies: FilmographyItem[] = analyzedFilmography.map((m) => ({
      type: "movie" as const,
      data: m,
      year: m.releaseYear,
    }))
    const shows: FilmographyItem[] = (analyzedTVFilmography || []).map((s) => ({
      type: "show" as const,
      data: s,
      year: s.firstAirYear,
    }))
    return [...movies, ...shows].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  }, [data])

  const [showAllFilmography, setShowAllFilmography] = useState(false)
  const FILMOGRAPHY_PREVIEW_COUNT = 5

  // Extract internal actor ID from slug (not the TMDB person ID from the API response)
  const actorId = slug ? extractActorId(slug) : 0
  const relatedActors = useRelatedActors(actorId)

  if (!slug) {
    return <ErrorMessage message="Invalid actor URL" />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading actor profile..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Actor not found" />
  }

  const { actor, analyzedFilmography, analyzedTVFilmography, deathInfo } = data
  const profileUrl = getProfileUrl(actor.profilePath, "h632")
  const currentAge = actor.deathday ? null : calculateCurrentAge(actor.birthday)
  const isDeceased = !!actor.deathday
  // Build a descriptive meta description based on death status
  const metaDescription = isDeceased
    ? `${actor.name} died on ${formatDate(actor.deathday, actor.deathdayPrecision)}${deathInfo?.ageAtDeath ? ` at age ${deathInfo.ageAtDeath}` : ""}.${deathInfo?.causeOfDeath ? ` Cause of death: ${deathInfo.causeOfDeath}.` : ""} See complete filmography and mortality statistics.`
    : `${actor.name} is alive${currentAge ? ` at age ${currentAge}` : ""}. See filmography and which co-stars have passed away.`

  return (
    <>
      <Helmet>
        <title>{actor.name} - Dead on Film</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={`${actor.name} - Dead on Film`} />
        <meta property="og:type" content="profile" />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:image" content={`https://deadonfilm.com/og/actor/${actor.id}.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${actor.name} - Dead on Film`} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={`https://deadonfilm.com/og/actor/${actor.id}.png`} />
        <link rel="canonical" href={`https://deadonfilm.com${location.pathname}`} />
      </Helmet>
      <JsonLd
        data={buildPersonSchema(
          {
            name: actor.name,
            birthday: actor.birthday,
            deathday: actor.deathday,
            biography: actor.biography,
            profilePath: actor.profilePath,
            placeOfBirth: actor.placeOfBirth,
            causeOfDeath: deathInfo?.causeOfDeath,
          },
          slug!
        )}
      />
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: "https://deadonfilm.com" },
          { name: actor.name, url: `https://deadonfilm.com${location.pathname}` },
        ])}
      />

      <div data-testid="actor-page" className="mx-auto max-w-3xl">
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: actor.name }]} />
        <AdminActorToolbar actorId={actorId} />

        {/* Header section */}
        <div className="mb-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Profile photo */}
          {profileUrl ? (
            <a
              href={actor.biographySourceUrl || `https://www.themoviedb.org/person/${actor.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0"
            >
              <img
                src={profileUrl}
                alt={actor.name}
                width={144}
                height={192}
                className="h-48 w-36 rounded-lg object-cover shadow-md transition-opacity hover:opacity-90"
                data-testid="actor-profile-photo"
              />
            </a>
          ) : (
            <div
              className="flex h-48 w-36 flex-shrink-0 items-center justify-center rounded-lg bg-beige shadow-md"
              data-testid="actor-profile-placeholder"
            >
              <PersonIcon size={64} className="text-text-muted" />
            </div>
          )}

          {/* Basic info */}
          <div className="flex-1 text-center sm:text-left">
            <h1
              className={`font-display text-3xl ${isDeceased ? "text-accent" : "text-brown-dark"}`}
            >
              {actor.name}
              {isDeceased && (
                <span className="ml-2" data-testid="deceased-label">
                  (Deceased)
                </span>
              )}
            </h1>

            <div className="mt-2 space-y-1 text-sm text-text-primary">
              {actor.birthday && (
                <p>
                  <span className="font-medium">Born:</span> {formatDate(actor.birthday)}
                  {actor.placeOfBirth && ` in ${actor.placeOfBirth}`}
                </p>
              )}

              {isDeceased && actor.deathday && deathInfo?.ageAtDeath && (
                <p>
                  <span className="font-medium">Died:</span> {formatDate(actor.deathday)} (age{" "}
                  {deathInfo.ageAtDeath})
                </p>
              )}

              {!isDeceased && currentAge && (
                <p>
                  <span className="font-medium">Age:</span> {currentAge}
                </p>
              )}

              {deathInfo?.causeOfDeath && (
                <p>
                  <span className="font-medium">Cause of Death:</span>{" "}
                  {toTitleCase(deathInfo.causeOfDeath)}
                </p>
              )}
            </div>

            {/* External links */}
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <a
                href={`https://www.themoviedb.org/person/${actor.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
              >
                TMDB
              </a>
              {deathInfo?.wikipediaUrl && (
                <a
                  href={deathInfo.wikipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
                >
                  Wikipedia
                </a>
              )}
            </div>

            {/* Notable factor badges */}
            {deathInfo?.notableFactors && deathInfo.notableFactors.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-1 sm:justify-start">
                {deathInfo.notableFactors.map((factor) => (
                  <FactorBadge key={factor} factor={factor} />
                ))}
              </div>
            )}
          </div>
        </div>

        <AdminActorMetadata actorId={actorId} />

        {/* Death Summary Card */}
        {isDeceased && deathInfo && (
          <DeathSummaryCard
            causeOfDeath={deathInfo.causeOfDeath}
            causeOfDeathDetails={deathInfo.causeOfDeathDetails}
            ageAtDeath={deathInfo.ageAtDeath}
            yearsLost={deathInfo.yearsLost ? Number(deathInfo.yearsLost) : null}
            hasFullDetails={deathInfo.hasDetailedDeathInfo}
            slug={slug!}
            onExpand={() => {
              // Fire virtual pageview for analytics
              fetch("/api/page-views/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pageType: "actor_death",
                  entityId: actorId,
                  path: `${location.pathname}/death`,
                }),
              }).catch(() => {})
            }}
          />
        )}

        {/* Biography */}
        {actor.biography && (
          <div className="mb-6 rounded-lg bg-surface-elevated p-4">
            <h2 className="mb-2 font-display text-lg text-brown-dark">Biography</h2>
            <p className="leading-relaxed text-text-primary">{actor.biography}</p>
            {actor.biographySourceUrl && (
              <a
                href={actor.biographySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-brown-medium hover:text-brown-dark hover:underline"
              >
                Read more on {getSourceDisplayName(actor.biographySourceType)} →
              </a>
            )}
          </div>
        )}

        {/* Career Context */}
        {isDeceased && deathInfo?.career && (
          <div
            className="mb-6 rounded-lg bg-surface-elevated p-4"
            data-testid="career-context-section"
          >
            <h2 className="mb-2 font-display text-lg text-brown-dark">Career Context</h2>
            <div className="space-y-2 text-text-primary">
              {deathInfo.career.statusAtDeath && (
                <p>
                  <span className="font-medium">Status at Death:</span>{" "}
                  {formatCareerStatus(deathInfo.career.statusAtDeath)}
                </p>
              )}
              {deathInfo.career.lastProject && (
                <p>
                  <span className="font-medium">Last Project:</span>{" "}
                  <ProjectLink project={deathInfo.career.lastProject} />
                </p>
              )}
              {deathInfo.career.posthumousReleases &&
                deathInfo.career.posthumousReleases.length > 0 && (
                  <div>
                    <span className="font-medium">Posthumous Releases:</span>
                    <ul className="ml-4 mt-1 list-disc">
                      {deathInfo.career.posthumousReleases.map((project, idx) => (
                        <li key={idx}>
                          <ProjectLink project={project} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Related People */}
        {isDeceased && deathInfo?.relatedCelebrities && deathInfo.relatedCelebrities.length > 0 && (
          <div
            className="mb-6 rounded-lg bg-surface-elevated p-4"
            data-testid="related-people-section"
          >
            <h2 className="mb-2 font-display text-lg text-brown-dark">Related People</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {deathInfo.relatedCelebrities.map((celebrity, idx) => (
                <RelatedCelebrityCard key={idx} celebrity={celebrity} />
              ))}
            </div>
          </div>
        )}

        {/* Filmography */}
        <div>
          <h2 className="mb-3 font-display text-lg text-brown-dark">
            Analyzed Filmography
            {combinedFilmography.length > 0 && (
              <span className="ml-2 text-sm font-normal text-text-muted">
                ({analyzedFilmography.length} movie{analyzedFilmography.length !== 1 ? "s" : ""}
                {(analyzedTVFilmography?.length ?? 0) > 0 && (
                  <>
                    , {analyzedTVFilmography.length} TV show
                    {analyzedTVFilmography.length !== 1 ? "s" : ""}
                  </>
                )}
                )
              </span>
            )}
          </h2>

          {combinedFilmography.length === 0 ? (
            <div className="rounded-lg bg-surface-elevated p-6 text-center text-text-muted">
              <p>No movies or TV shows in our database yet.</p>
              <p className="mt-1 text-sm">
                This actor hasn't appeared in any productions we've analyzed for mortality
                statistics.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {(showAllFilmography
                  ? combinedFilmography
                  : combinedFilmography.slice(0, FILMOGRAPHY_PREVIEW_COUNT)
                ).map((item) => (
                  <FilmographyRow
                    key={
                      item.type === "movie"
                        ? `movie-${item.data.movieId}`
                        : `show-${item.data.showId}`
                    }
                    item={item}
                  />
                ))}
              </div>
              {combinedFilmography.length > FILMOGRAPHY_PREVIEW_COUNT && (
                <button
                  onClick={() => setShowAllFilmography((prev) => !prev)}
                  className="mt-3 w-full rounded-md py-2 text-center text-sm font-medium text-brown-dark transition-colors hover:bg-cream"
                  data-testid="filmography-toggle"
                >
                  {showAllFilmography
                    ? "Show less"
                    : `Show all ${combinedFilmography.length} titles`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Related actors */}
        {relatedActors.data?.actors && relatedActors.data.actors.length > 0 && (
          <div className="mt-6">
            <RelatedContent
              title={
                data.deathInfo?.causeOfDeath
                  ? `Also died of ${toTitleCase(data.deathInfo.causeOfDeath)}`
                  : "Similar Era Actors"
              }
              items={relatedActors.data.actors.map((a) => ({
                href: `/actor/${createActorSlug(a.name, a.id)}`,
                title: a.name,
                subtitle: a.causeOfDeath ? toTitleCase(a.causeOfDeath) : undefined,
                imageUrl: getProfileUrl(a.profilePath, "w185"),
              }))}
              placeholderIcon={<PersonIcon size={20} className="text-text-muted" />}
            />
          </div>
        )}

        {/* Hub page links */}
        {isDeceased && (
          <div className="mt-4">
            <SeeAlso
              links={[
                ...(deathInfo?.causeOfDeath
                  ? [{ href: "/causes-of-death", label: "Deaths by Cause" }]
                  : []),
                { href: "/forever-young", label: "Forever Young" },
                { href: "/death-watch", label: "Death Watch" },
              ]}
            />
          </div>
        )}
      </div>
    </>
  )
}
