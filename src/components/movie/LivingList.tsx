import type { LivingActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { PersonIcon } from "@/components/icons"

interface LivingListProps {
  actors: LivingActor[]
}

export default function LivingList({ actors }: LivingListProps) {
  if (actors.length === 0) {
    return (
      <div data-testid="no-living-message" className="text-center py-8">
        <p className="text-text-muted text-lg">No living cast members found</p>
      </div>
    )
  }

  return (
    <div data-testid="living-list">
      <h2 data-testid="living-list-title" className="font-display text-2xl text-brown-dark mb-4">
        Living Cast Members
      </h2>

      <div data-testid="living-cards" className="space-y-3">
        {actors.map((actor, index) => (
          <div
            key={actor.id}
            className={`animate-fade-in-up ${index < 10 ? `stagger-${index + 1}` : ""}`}
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
      className="bg-living-bg border border-living-border/30 rounded-lg p-4 flex gap-4 items-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      {profileUrl ? (
        <img
          data-testid="living-actor-photo"
          src={profileUrl}
          alt={actor.name}
          className="w-16 h-20 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div
          data-testid="living-actor-photo-placeholder"
          className="w-16 h-20 rounded bg-living-muted/20 flex items-center justify-center flex-shrink-0"
        >
          <PersonIcon size={32} className="text-living" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
          <div>
            <h3 data-testid="living-actor-name" className="font-semibold text-brown-dark">
              {actor.name}
            </h3>
            <p data-testid="living-actor-character" className="text-sm text-living-dark italic">
              as {actor.character}
            </p>
          </div>

          {actor.age !== null && (
            <p data-testid="living-actor-age" className="text-sm text-living font-medium">
              Age {actor.age}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
