import type { DeceasedActor } from '@/types'
import { getProfileUrl } from '@/services/api'
import DeathInfo from './DeathInfo'

interface DeceasedCardProps {
  actor: DeceasedActor
}

export default function DeceasedCard({ actor }: DeceasedCardProps) {
  const profileUrl = getProfileUrl(actor.profile_path, 'w185')

  return (
    <div className="bg-white border border-brown-medium/20 rounded-lg p-4 flex gap-4 items-start">
      {profileUrl ? (
        <img
          src={profileUrl}
          alt={actor.name}
          className="w-16 h-20 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-20 rounded bg-beige flex items-center justify-center flex-shrink-0">
          <span className="text-2xl text-text-muted">👤</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
          <div>
            <h3 className="font-semibold text-brown-dark">{actor.name}</h3>
            <p className="text-sm text-text-muted italic">as {actor.character}</p>
          </div>

          <DeathInfo
            deathday={actor.deathday}
            birthday={actor.birthday}
            causeOfDeath={actor.causeOfDeath}
            wikipediaUrl={actor.wikipediaUrl}
          />
        </div>
      </div>
    </div>
  )
}
