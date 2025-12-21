import { useState } from "react"
import { Link } from "react-router-dom"
import type { LivingShowActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { createActorSlug, createEpisodeSlug } from "@/utils/slugify"
import { PersonIcon, ChevronIcon } from "@/components/icons"

interface ShowLivingListProps {
  actors: LivingShowActor[]
  showId?: number
  showName?: string
}

export default function ShowLivingList({ actors, showId, showName }: ShowLivingListProps) {
  if (actors.length === 0) {
    return (
      <div data-testid="no-living-message" className="py-8 text-center">
        <p className="text-lg text-text-muted">No living cast members found</p>
      </div>
    )
  }

  return (
    <div data-testid="show-living-list">
      <h2 data-testid="living-list-title" className="mb-4 font-display text-2xl text-brown-dark">
        Living Cast Members
      </h2>

      <div data-testid="living-cards" className="space-y-3">
        {actors.map((actor, index) => (
          <div
            key={actor.id}
            className="animate-fade-slide-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <ShowLivingCard actor={actor} showId={showId} showName={showName} />
          </div>
        ))}
      </div>
    </div>
  )
}

interface ShowLivingCardProps {
  actor: LivingShowActor
  showId?: number
  showName?: string
}

function ShowLivingCard({ actor, showId, showName }: ShowLivingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const profileUrl = getProfileUrl(actor.profile_path, "w185")

  // Format episode appearances for display with links
  const episodeDisplay = formatEpisodeDisplay(actor, showId, showName)

  return (
    <div
      data-testid="living-card"
      className="flex flex-col rounded-lg border border-living-border/30 bg-living-bg p-4"
    >
      <div className="flex items-start gap-4">
        {profileUrl ? (
          <img
            data-testid="living-actor-photo"
            src={profileUrl}
            alt={actor.name}
            width={64}
            height={80}
            loading="lazy"
            className="h-20 w-16 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div
            data-testid="living-actor-photo-placeholder"
            className="flex h-20 w-16 flex-shrink-0 items-center justify-center rounded bg-living-muted/20"
          >
            <PersonIcon size={32} className="text-living" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 data-testid="living-actor-name" className="font-semibold text-brown-dark">
                <Link
                  to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                  className="hover:text-accent hover:underline"
                >
                  {actor.name}
                </Link>
              </h3>
              <p data-testid="living-actor-character" className="text-sm italic text-living-dark">
                as {actor.character}
              </p>
              {/* Episode info */}
              <div data-testid="living-actor-episodes" className="mt-1 text-xs text-living">
                {episodeDisplay}
              </div>
            </div>

            {actor.age !== null && (
              <p data-testid="living-actor-age" className="text-sm font-medium text-living">
                Age {actor.age}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Show expand button only if there are episodes to show */}
      {actor.episodes.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? `Collapse details for ${actor.name}` : `Show details for ${actor.name}`
            }
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 flex w-full items-center justify-center gap-1 py-1 text-xs text-living transition-colors hover:text-living-dark focus:outline-none"
          >
            <span>{isExpanded ? "Hide episodes" : "Show episodes"}</span>
            <ChevronIcon
              size={14}
              direction={isExpanded ? "up" : "down"}
              className="transition-transform"
            />
          </button>

          {isExpanded && (
            <div className="mt-2 border-t border-living-border/20 pt-3">
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-text-muted">
                {actor.episodes.slice(0, 20).map((ep, i) => (
                  <li key={i}>
                    <span className="font-medium">
                      S{ep.seasonNumber}E{ep.episodeNumber}:
                    </span>{" "}
                    "{ep.episodeName}" {ep.character !== actor.character && `(as ${ep.character})`}
                  </li>
                ))}
                {actor.episodes.length > 20 && (
                  <li className="italic">...and {actor.episodes.length - 20} more episodes</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatEpisodeDisplay(
  actor: LivingShowActor,
  showId?: number,
  showName?: string
): React.ReactNode {
  const count = actor.totalEpisodes

  if (actor.episodes.length === 0) {
    return `${count} episode${count !== 1 ? "s" : ""}`
  }

  // Helper to create episode link
  const createEpisodeLink = (ep: {
    seasonNumber: number
    episodeNumber: number
    episodeName: string
  }) => {
    if (showId && showName) {
      const slug = createEpisodeSlug(
        showName,
        ep.episodeName,
        ep.seasonNumber,
        ep.episodeNumber,
        showId
      )
      return (
        <Link
          key={`${ep.seasonNumber}-${ep.episodeNumber}`}
          to={`/episode/${slug}`}
          className="hover:text-living-dark hover:underline"
        >
          "{ep.episodeName}"
        </Link>
      )
    }
    return `"${ep.episodeName}"`
  }

  if (actor.episodes.length === 1) {
    const ep = actor.episodes[0]
    return (
      <>
        S{ep.seasonNumber}E{ep.episodeNumber}: {createEpisodeLink(ep)}
      </>
    )
  }

  if (actor.episodes.length <= 3) {
    return actor.episodes.map((ep, i) => (
      <span key={`${ep.seasonNumber}-${ep.episodeNumber}`}>
        {i > 0 && ", "}
        {createEpisodeLink(ep)}
      </span>
    ))
  }

  const firstEp = actor.episodes[0]
  return (
    <>
      {count} episodes (first: {createEpisodeLink(firstEp)})
    </>
  )
}
