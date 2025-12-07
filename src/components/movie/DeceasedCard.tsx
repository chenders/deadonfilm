import type { DeceasedActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import DeathInfo from "./DeathInfo"

interface DeceasedCardProps {
  actor: DeceasedActor
  isPolling?: boolean
}

export default function DeceasedCard({ actor, isPolling = false }: DeceasedCardProps) {
  const profileUrl = getProfileUrl(actor.profile_path, "w185")

  // Show loading indicator only for actors without cause/wikipedia info while polling
  const showLoading = isPolling && !actor.causeOfDeath && !actor.wikipediaUrl

  return (
    <div data-testid="deceased-card" className="bg-white border border-brown-medium/20 rounded-lg p-4 flex gap-4 items-start">
      {profileUrl ? (
        <img
          data-testid="actor-photo"
          src={profileUrl}
          alt={actor.name}
          className="w-16 h-20 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div data-testid="actor-photo-placeholder" className="w-16 h-20 rounded bg-beige flex items-center justify-center flex-shrink-0">
          <span className="text-2xl text-text-muted">👤</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
          <div>
            <h3 data-testid="actor-name" className="font-semibold text-brown-dark">{actor.name}</h3>
            <p data-testid="actor-character" className="text-sm text-text-muted italic">as {actor.character}</p>
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
  )
}
