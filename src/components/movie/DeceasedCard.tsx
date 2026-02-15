import { useState } from "react"
import { Link } from "react-router-dom"
import type { DeceasedActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import DeathInfo from "./DeathInfo"
import { PersonIcon, ChevronIcon } from "@/components/icons"

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
      className="group rounded-lg border border-brown-medium/20 bg-surface-elevated p-4"
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
              isLoading={showLoading}
            />
          </div>
        </div>
      </div>

      {/* Expand/collapse button */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={
          isExpanded ? `Collapse links for ${actor.name}` : `Show links for ${actor.name}`
        }
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded py-1 text-xs text-brown-medium transition-colors hover:text-brown-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brown-medium/50"
      >
        <span>{isExpanded ? "Hide links" : "Show links"}</span>
        <ChevronIcon
          size={14}
          direction={isExpanded ? "up" : "down"}
          className="transition-transform"
        />
      </button>

      {/* Expanded section with external links */}
      {isExpanded && (
        <div
          data-testid="actor-expanded"
          className="mt-2 flex flex-wrap gap-3 border-t border-brown-medium/10 pt-3"
        >
          <a
            href={actor.tmdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
          >
            View on TMDB →
          </a>
          {actor.wikipediaUrl && (
            <a
              href={actor.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
            >
              Wikipedia →
            </a>
          )}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(actor.name + " actor filmography")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-beige px-3 py-1.5 text-xs text-brown-dark transition-colors hover:bg-cream"
          >
            Search Filmography →
          </a>
        </div>
      )}
    </div>
  )
}
