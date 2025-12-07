import type { LivingActor } from "@/types"
import { getProfileUrl } from "@/services/api"
import { PersonIcon } from "@/components/icons"

interface LastSurvivorProps {
  actor: LivingActor
  totalLiving: number
}

export default function LastSurvivor({ actor, totalLiving }: LastSurvivorProps) {
  const profileUrl = getProfileUrl(actor.profile_path, "w185")

  if (totalLiving > 3) {
    // Don't show "last survivor" if there are still several living
    return null
  }

  const title =
    totalLiving === 1 ? "Last Surviving Cast Member" : `${totalLiving} Surviving Cast Members`

  return (
    <div
      data-testid="last-survivor"
      className="bg-living-bg border border-living-border/30 rounded-lg p-4 mb-8"
    >
      <h3 data-testid="last-survivor-title" className="font-display text-lg text-brown-dark mb-3">
        {title}
      </h3>

      <div className="flex items-center gap-4">
        {profileUrl ? (
          <img
            data-testid="last-survivor-photo"
            src={profileUrl}
            alt={actor.name}
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div
            data-testid="last-survivor-photo-placeholder"
            className="w-16 h-16 rounded-full bg-living-muted/20 flex items-center justify-center"
          >
            <PersonIcon size={32} className="text-living" />
          </div>
        )}

        <div>
          <p data-testid="last-survivor-name" className="font-semibold text-brown-dark">
            {actor.name}
          </p>
          <p data-testid="last-survivor-character" className="text-sm text-living-dark">
            as {actor.character}
          </p>
          {actor.age && (
            <p data-testid="last-survivor-age" className="text-sm text-living">
              Age: {actor.age}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
