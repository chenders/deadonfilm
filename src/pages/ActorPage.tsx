import { useState, useRef, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { createPortal } from "react-dom"
import { Helmet } from "react-helmet-async"
import { useActor } from "@/hooks/useActor"
import { extractActorId, createMovieSlug } from "@/utils/slugify"
import { formatDate, calculateCurrentAge } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { getProfileUrl, getPosterUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import { PersonIcon, FilmReelIcon, InfoIcon } from "@/components/icons"
import type { ActorFilmographyMovie } from "@/types"

interface TooltipProps {
  content: string
  triggerRef: React.RefObject<HTMLElement | null>
  isVisible: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function Tooltip({ content, triggerRef, isVisible, onMouseEnter, onMouseLeave }: TooltipProps) {
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
      <p className="max-h-[calc(60vh-2rem)] overflow-y-auto leading-relaxed">{content}</p>
    </div>,
    document.body
  )
}

function FilmographyRow({ movie }: { movie: ActorFilmographyMovie }) {
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
          {movie.deceasedCount}/{movie.castCount}
        </p>
        <p className="text-xs text-text-muted">{mortalityPercent}% deceased</p>
      </div>
    </Link>
  )
}

export default function ActorPage() {
  const { slug } = useParams<{ slug: string }>()
  const actorId = slug ? extractActorId(slug) : 0
  const { data, isLoading, error } = useActor(actorId)

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

  if (!actorId) {
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

  const { actor, analyzedFilmography, deathInfo } = data
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
      </Helmet>

      <div data-testid="actor-page" className="mx-auto max-w-3xl">
        {/* Header section */}
        <div className="mb-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Profile photo */}
          {profileUrl ? (
            <img
              src={profileUrl}
              alt={actor.name}
              className="h-48 w-36 flex-shrink-0 rounded-lg object-cover shadow-md"
              data-testid="actor-profile-photo"
            />
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
            </div>
          </div>
        </div>

        {/* Biography */}
        {actor.biography && (
          <div className="mb-6 rounded-lg bg-white p-4">
            <h2 className="mb-2 font-display text-lg text-brown-dark">Biography</h2>
            <p className="line-clamp-6 text-sm leading-relaxed text-text-muted">
              {actor.biography}
            </p>
          </div>
        )}

        {/* Filmography */}
        <div>
          <h2 className="mb-3 font-display text-lg text-brown-dark">
            Analyzed Filmography
            {analyzedFilmography.length > 0 && (
              <span className="ml-2 text-sm font-normal text-text-muted">
                ({analyzedFilmography.length} movies)
              </span>
            )}
          </h2>

          {analyzedFilmography.length === 0 ? (
            <div className="rounded-lg bg-white p-6 text-center text-text-muted">
              <p>No movies in our database yet.</p>
              <p className="mt-1 text-sm">
                This actor hasn't appeared in any movies we've analyzed for mortality statistics.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {analyzedFilmography.map((movie) => (
                <FilmographyRow key={movie.movieId} movie={movie} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
