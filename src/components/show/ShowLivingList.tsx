import { useState } from "react"
import { Link } from "react-router-dom"
import type { LivingShowActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import { PersonIcon, ChevronIcon } from "@/components/icons"
import { formatEpisodeDisplay } from "./formatEpisodeDisplay"

const PAGE_SIZE = 25

interface ShowLivingListProps {
  actors: LivingShowActor[]
  showId?: number
  showName?: string
}

export default function ShowLivingList({ actors, showId, showName }: ShowLivingListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  if (actors.length === 0) {
    return (
      <div data-testid="no-living-message" className="py-8 text-center">
        <p className="text-lg text-text-muted">No living cast members found</p>
      </div>
    )
  }

  const visibleActors = actors.slice(0, visibleCount)
  const hasMore = visibleCount < actors.length
  const remainingCount = actors.length - visibleCount

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, actors.length))
  }

  return (
    <div data-testid="show-living-list">
      <h2 data-testid="living-list-title" className="mb-4 font-display text-2xl text-brown-dark">
        Living Cast Members
      </h2>

      <div data-testid="living-cards" className="space-y-3">
        {visibleActors.map((actor, index) => (
          <div
            key={actor.id}
            className="animate-fade-slide-in"
            style={{ animationDelay: `${Math.min(index, PAGE_SIZE - 1) * 50}ms` }}
          >
            <ShowLivingCard actor={actor} showId={showId} showName={showName} />
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            data-testid="show-more-living"
            onClick={handleShowMore}
            className="rounded-lg bg-living/10 px-6 py-2 text-sm font-medium text-living-dark transition-colors hover:bg-living/20"
          >
            Show more ({remainingCount} remaining)
          </button>
        </div>
      )}
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

  // Format episode appearances for display with links (using living color)
  const episodeDisplay = formatEpisodeDisplay(actor, showId, showName, "hover:text-living-dark")

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
