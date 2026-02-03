import { useState, useRef, useEffect, useMemo } from "react"
import { useParams, useLocation, Link } from "react-router-dom"
import { createPortal } from "react-dom"
import { Helmet } from "react-helmet-async"
import { useActor } from "@/hooks/useActor"
import { createMovieSlug, createShowSlug } from "@/utils/slugify"
import { formatDate, calculateCurrentAge } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { getProfileUrl, getPosterUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import JsonLd from "@/components/seo/JsonLd"
import { buildPersonSchema, buildBreadcrumbSchema } from "@/utils/schema"
import { PersonIcon, FilmReelIcon, TVIcon, InfoIcon } from "@/components/icons"
import type { ActorFilmographyMovie, ActorFilmographyShow } from "@/types"

type FilmographyItem =
  | { type: "movie"; data: ActorFilmographyMovie; year: number | null }
  | { type: "show"; data: ActorFilmographyShow; year: number | null }

interface TooltipProps {
  content: string
  triggerRef: React.RefObject<HTMLElement | null>
  isVisible: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

interface TooltipContentProps {
  content: string
  actorSlug?: string
  hasDetailedInfo?: boolean
}

function TooltipContent({ content, actorSlug, hasDetailedInfo }: TooltipContentProps) {
  return (
    <>
      <p className="max-h-[calc(60vh-2rem)] overflow-y-auto leading-relaxed">{content}</p>
      {hasDetailedInfo && actorSlug && (
        <Link
          to={`/actor/${actorSlug}/death`}
          className="mt-2 block text-right text-xs text-cream/80 underline hover:text-cream"
        >
          Read more →
        </Link>
      )}
    </>
  )
}

interface ExtendedTooltipProps extends TooltipProps {
  actorSlug?: string
  hasDetailedInfo?: boolean
}

function Tooltip({
  content,
  triggerRef,
  isVisible,
  onMouseEnter,
  onMouseLeave,
  actorSlug,
  hasDetailedInfo,
}: ExtendedTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // Calculate position when tooltip becomes visible
  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const trigger = triggerRef.current.getBoundingClientRect()
      const padding = 8
      // Position below the trigger
      const top = trigger.bottom + padding
      const left = trigger.left
      setPosition({ top, left })
    } else if (!isVisible) {
      setPosition(null)
    }
  }, [isVisible, triggerRef])

  if (!isVisible) {
    return null
  }

  return createPortal(
    <div
      ref={tooltipRef}
      data-testid="death-details-tooltip"
      className="animate-fade-slide-in fixed z-50 max-w-sm rounded-lg border border-brown-medium/50 bg-brown-dark px-4 py-3 text-sm text-cream shadow-xl sm:max-w-md"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="absolute -top-1 left-4 right-4 flex justify-between">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-2 w-1.5 rounded-sm bg-brown-medium/50" />
        ))}
      </div>
      <TooltipContent content={content} actorSlug={actorSlug} hasDetailedInfo={hasDetailedInfo} />
    </div>,
    document.body
  )
}

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
        className="flex items-center gap-3 rounded-lg bg-white p-3 transition-colors hover:bg-cream"
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
      className="flex items-center gap-3 rounded-lg bg-white p-3 transition-colors hover:bg-cream"
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

  // Tooltip state for cause of death details
  const [showTooltip, setShowTooltip] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 100)
  }

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
  const hasDeathDetails =
    deathInfo?.causeOfDeathDetails && deathInfo.causeOfDeathDetails.trim().length > 0

  return (
    <>
      <Helmet>
        <title>{actor.name} - Dead on Film</title>
        <meta
          name="description"
          content={`${actor.name}'s profile and filmography on Dead on Film.`}
        />
        <meta property="og:title" content={`${actor.name} - Dead on Film`} />
        <meta property="og:type" content="profile" />
        {actor.profilePath && (
          <meta
            property="og:image"
            content={`https://image.tmdb.org/t/p/h632${actor.profilePath}`}
          />
        )}
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${actor.name} - Dead on Film`} />
        <meta
          name="twitter:description"
          content={`${actor.name}'s profile and filmography on Dead on Film.`}
        />
        {actor.profilePath && (
          <meta
            name="twitter:image"
            content={`https://image.tmdb.org/t/p/h632${actor.profilePath}`}
          />
        )}
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

            <div className="mt-2 space-y-1 text-sm text-text-muted">
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
                  {hasDeathDetails ? (
                    <span
                      ref={triggerRef}
                      data-testid="cause-of-death-trigger"
                      className="cursor-help underline decoration-dotted"
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                    >
                      {toTitleCase(deathInfo.causeOfDeath)}
                      <InfoIcon
                        size={14}
                        className="ml-1 inline-block align-text-bottom text-brown-medium"
                      />
                      <Tooltip
                        content={deathInfo.causeOfDeathDetails!}
                        triggerRef={triggerRef}
                        isVisible={showTooltip}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        actorSlug={slug}
                        hasDetailedInfo={deathInfo.hasDetailedDeathInfo}
                      />
                    </span>
                  ) : (
                    <span>{toTitleCase(deathInfo.causeOfDeath)}</span>
                  )}
                </p>
              )}

              {deathInfo?.yearsLost && Number(deathInfo.yearsLost) > 0 && (
                <p className="text-accent">
                  Died {Number(deathInfo.yearsLost).toFixed(1)} years before life expectancy
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
              {isDeceased && deathInfo?.hasDetailedDeathInfo && (
                <Link
                  to={`/actor/${slug}/death`}
                  data-testid="death-details-button"
                  className="rounded-full bg-brown-medium px-3 py-1.5 text-xs text-cream transition-colors hover:bg-brown-dark"
                >
                  View Full Death Details →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Biography */}
        {actor.biography && (
          <div className="mb-6 rounded-lg bg-white p-4">
            <h2 className="mb-2 font-display text-lg text-brown-dark">Biography</h2>
            <p className="text-sm leading-relaxed text-text-muted">{actor.biography}</p>
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
            <div className="rounded-lg bg-white p-6 text-center text-text-muted">
              <p>No movies or TV shows in our database yet.</p>
              <p className="mt-1 text-sm">
                This actor hasn't appeared in any productions we've analyzed for mortality
                statistics.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {combinedFilmography.map((item) => (
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
          )}
        </div>
      </div>
    </>
  )
}
