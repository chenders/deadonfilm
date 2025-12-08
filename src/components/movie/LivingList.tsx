import type { LivingActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { PersonIcon } from "@/components/icons"

interface LivingListProps {
  actors: LivingActor[]
}

export default function LivingList({ actors }: LivingListProps) {
  if (actors.length === 0) {
    return (
      <div data-testid="no-living-message" className="py-8 text-center">
        <p className="text-lg text-text-muted">No living cast members found</p>
      </div>
    )
  }

  return (
    <div data-testid="living-list">
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
            <LivingCard actor={actor} />
          </div>
        ))}
      </div>
    </div>
  )
}

function LivingCard({ actor }: { actor: LivingActor }) {
  const profileUrl = getProfileUrl(actor.profile_path, "w185")

  return (
    <div
      data-testid="living-card"
      className="flex items-start gap-4 rounded-lg border border-living-border/30 bg-living-bg p-4"
    >
      {profileUrl ? (
        <img
          data-testid="living-actor-photo"
          src={profileUrl}
          alt={actor.name}
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
              {actor.name}
            </h3>
            <p data-testid="living-actor-character" className="text-sm italic text-living-dark">
              as {actor.character}
            </p>
          </div>

          {actor.age !== null && (
            <p data-testid="living-actor-age" className="text-sm font-medium text-living">
              Age {actor.age}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
