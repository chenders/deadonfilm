import { useState } from "react"
import type { DeceasedActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import DeathInfo from "./DeathInfo"
import { PersonIcon } from "@/components/icons"

interface DeceasedCardProps {
  actor: DeceasedActor
  isPolling?: boolean
}

export default function DeceasedCard({ actor, isPolling = false }: DeceasedCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const profileUrl = getProfileUrl(actor.profile_path, "w185")

  // Show loading indicator only for actors without cause/wikipedia info while polling
  const showLoading = isPolling && !actor.causeOfDeath && !actor.wikipediaUrl

  return (
    <div
      data-testid="deceased-card"
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      className="group cursor-pointer rounded-lg border border-brown-medium/20 bg-white p-4 focus:outline-none focus:ring-2 focus:ring-brown-medium/50"
      onClick={() => setIsExpanded(!isExpanded)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setIsExpanded(!isExpanded)
        }
      }}
    >
      <div className="flex items-start gap-4">
        {profileUrl ? (
          <img
            data-testid="actor-photo"
            src={profileUrl}
            alt={actor.name}
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
                {actor.name}
              </h3>
              <p data-testid="actor-character" className="text-sm italic text-text-muted">
                as {actor.character}
              </p>
            </div>

            <DeathInfo
              actorName={actor.name}
              deathday={actor.deathday}
              birthday={actor.birthday}
              causeOfDeath={actor.causeOfDeath}
              causeOfDeathDetails={actor.causeOfDeathDetails}
              wikipediaUrl={actor.wikipediaUrl}
              tmdbUrl={actor.tmdbUrl}
              isLoading={showLoading}
            />
          </div>
        </div>
      </div>

      {/* Expanded section with external links */}
      {isExpanded && (
        <div
          data-testid="actor-expanded"
          className="mt-3 flex flex-wrap gap-3 border-t border-brown-medium/10 pt-3"
        >
          <a
            href={actor.tmdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
            onClick={(e) => e.stopPropagation()}
          >
            View on TMDB →
          </a>
          {actor.wikipediaUrl && (
            <a
              href={actor.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
              onClick={(e) => e.stopPropagation()}
            >
              Wikipedia →
            </a>
          )}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(actor.name + " actor filmography")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
            onClick={(e) => e.stopPropagation()}
          >
            Search Filmography →
          </a>
        </div>
      )}
    </div>
  )
}
