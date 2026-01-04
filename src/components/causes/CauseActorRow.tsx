import { Link } from "react-router-dom"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import CauseOfDeathBadge from "@/components/common/CauseOfDeathBadge"
import { PersonIcon } from "@/components/icons"
import type { CauseActor } from "@/types"

interface CauseActorRowProps {
  actor: CauseActor
  rank: number
  /** Whether to show the cause badge (true for category pages, false for specific cause pages) */
  showCauseBadge?: boolean
}

export default function CauseActorRow({ actor, rank, showCauseBadge = true }: CauseActorRowProps) {
  const actorId = actor.tmdbId ?? actor.id
  const slug = createActorSlug(actor.name, actorId)
  const profileUrl = getProfileUrl(actor.profilePath, "w185")

  // For category pages, show the cause. For specific cause pages, show details only.
  const shouldShowBadge = showCauseBadge ? actor.causeOfDeath : actor.causeOfDeathDetails

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`actor-row-${actorId}`}
      className="block rounded-lg bg-white p-3 transition-colors hover:bg-cream"
    >
      {/* Desktop layout */}
      <div className="hidden items-center gap-4 md:flex">
        <span className="w-8 text-center font-display text-lg text-brown-medium">{rank}</span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={actor.name}
            className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-beige">
            <PersonIcon size={24} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-brown-dark">{actor.name}</h3>
          <p className="text-sm text-text-muted">
            Died {formatDate(actor.deathday)}
            {actor.ageAtDeath && ` · Age ${actor.ageAtDeath}`}
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          {shouldShowBadge && (
            <p className="text-sm text-brown-dark">
              <CauseOfDeathBadge
                causeOfDeath={actor.causeOfDeath || ""}
                causeOfDeathDetails={actor.causeOfDeathDetails}
                testId={`actor-cause-${actorId}`}
                iconSize={14}
              />
            </p>
          )}
          {actor.yearsLost !== null && actor.yearsLost > 0 && (
            <p className="text-xs text-accent">{Math.round(actor.yearsLost)} years lost</p>
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex items-start gap-3 md:hidden">
        <span className="mt-1 w-6 text-center font-display text-base text-brown-medium">
          {rank}
        </span>

        {profileUrl ? (
          <img
            src={profileUrl}
            alt={actor.name}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-beige">
            <PersonIcon size={20} className="text-brown-medium" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-brown-dark">{actor.name}</h3>
          <p className="text-xs text-text-muted">
            Died {formatDate(actor.deathday)}
            {actor.ageAtDeath && ` · Age ${actor.ageAtDeath}`}
          </p>
          {actor.yearsLost !== null && actor.yearsLost > 0 && (
            <p className="text-xs text-accent">{Math.round(actor.yearsLost)} years lost</p>
          )}
        </div>
      </div>
    </Link>
  )
}
