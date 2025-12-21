import { useState } from "react"
import { Link } from "react-router-dom"
import type { DeceasedShowActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import DeathInfo from "@/components/movie/DeathInfo"
import { PersonIcon, ChevronIcon } from "@/components/icons"
import EmptyStateCard from "@/components/common/EmptyStateCard"
import { formatEpisodeDisplay } from "./formatEpisodeDisplay"

const PAGE_SIZE = 25

interface ShowDeceasedListProps {
  actors: DeceasedShowActor[]
  showId?: number
  showName?: string
}

export default function ShowDeceasedList({ actors, showId, showName }: ShowDeceasedListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  if (actors.length === 0) {
    return (
      <div data-testid="no-deceased-message">
        <EmptyStateCard type="no-deceased" />
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
    <div data-testid="show-deceased-list">
      <h2 data-testid="deceased-list-title" className="mb-4 font-display text-2xl text-brown-dark">
        Deceased Cast Members
      </h2>

      <div data-testid="deceased-cards" className="space-y-3">
        {visibleActors.map((actor, index) => (
          <div
            key={actor.id}
            className="animate-fade-slide-in"
            style={{ animationDelay: `${Math.min(index, PAGE_SIZE - 1) * 50}ms` }}
          >
            <ShowDeceasedCard actor={actor} showId={showId} showName={showName} />
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            data-testid="show-more-deceased"
            onClick={handleShowMore}
            className="rounded-lg bg-brown-medium/10 px-6 py-2 text-sm font-medium text-brown-dark transition-colors hover:bg-brown-medium/20"
          >
            Show more ({remainingCount} remaining)
          </button>
        </div>
      )}
    </div>
  )
}

interface ShowDeceasedCardProps {
  actor: DeceasedShowActor
  showId?: number
  showName?: string
}

function ShowDeceasedCard({ actor, showId, showName }: ShowDeceasedCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const profileUrl = getProfileUrl(actor.profile_path, "w185")

  // Format episode appearances for display with optional links
  const episodeDisplay = formatEpisodeDisplay(actor, showId, showName)

  return (
    <div
      data-testid="deceased-card"
      className="group rounded-lg border border-brown-medium/20 bg-white p-4"
    >
      <div className="flex items-start gap-4">
        {profileUrl ? (
          <img
            data-testid="actor-photo"
            src={profileUrl}
            alt={actor.name}
            width={64}
            height={80}
            loading="lazy"
            className="h-20 w-16 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div
            data-testid="actor-photo-placeholder"
            className="flex h-20 w-16 flex-shrink-0 items-center justify-center rounded bg-beige"
          >
            <PersonIcon size={32} className="text-text-muted" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 data-testid="actor-name" className="font-semibold text-brown-dark">
                <Link
                  to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                  className="hover:text-accent hover:underline"
                >
                  {actor.name}
                </Link>
              </h3>
              <p data-testid="actor-character" className="text-sm italic text-text-muted">
                as {actor.character}
              </p>
              {/* Episode info */}
              <div data-testid="actor-episodes" className="mt-1 text-xs text-brown-medium">
                {episodeDisplay}
              </div>
            </div>

            <DeathInfo
              actorName={actor.name}
              deathday={actor.deathday}
              birthday={actor.birthday}
              ageAtDeath={actor.ageAtDeath}
              yearsLost={actor.yearsLost}
              causeOfDeath={actor.causeOfDeath}
              causeOfDeathDetails={actor.causeOfDeathDetails}
              wikipediaUrl={actor.wikipediaUrl}
              tmdbUrl={actor.tmdbUrl}
            />
          </div>
        </div>
      </div>

      {/* Expand/collapse button */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={
          isExpanded ? `Collapse details for ${actor.name}` : `Show details for ${actor.name}`
        }
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 flex w-full items-center justify-center gap-1 py-1 text-xs text-brown-medium transition-colors hover:text-brown-dark focus:outline-none"
      >
        <span>{isExpanded ? "Hide details" : "Show details"}</span>
        <ChevronIcon
          size={14}
          direction={isExpanded ? "up" : "down"}
          className="transition-transform"
        />
      </button>

      {/* Expanded section with episode list and external links */}
      {isExpanded && (
        <div data-testid="actor-expanded" className="mt-2 border-t border-brown-medium/10 pt-3">
          {/* Episode appearances */}
          {actor.episodes.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-2 text-xs font-medium text-brown-dark">Episode Appearances:</h4>
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

          {/* External links */}
          <div className="flex flex-wrap gap-3">
            <a
              href={actor.tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
            >
              View on TMDB
            </a>
            {actor.wikipediaUrl && (
              <a
                href={actor.wikipediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
              >
                Wikipedia
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
