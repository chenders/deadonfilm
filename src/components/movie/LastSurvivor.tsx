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
      className="mb-8 rounded-lg border border-living-border/30 bg-living-bg p-4"
    >
      <h3 data-testid="last-survivor-title" className="mb-3 font-display text-lg text-brown-dark">
        {title}
      </h3>

      <div className="flex items-center gap-4">
        {profileUrl ? (
          <img
            data-testid="last-survivor-photo"
            src={profileUrl}
            alt={actor.name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div
            data-testid="last-survivor-photo-placeholder"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-living-muted/20"
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
