import { Link } from "react-router-dom"
import { createActorSlug } from "@/utils/slugify"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import { PersonIcon } from "@/components/icons"
import type { NotableActor } from "@/types"

interface NotableActorCardProps {
  actor: NotableActor
}

export default function NotableActorCard({ actor }: NotableActorCardProps) {
  const slug = createActorSlug(actor.name, actor.tmdbId ?? actor.id)
  const profileUrl = getProfileUrl(actor.profilePath, "w185")

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`notable-actor-${actor.tmdbId ?? actor.id}`}
      className="flex flex-col items-center rounded-lg bg-surface p-3 text-center transition-colors hover:bg-surface-muted"
    >
      {profileUrl ? (
        <img
          src={profileUrl}
          alt={actor.name}
          className="mb-2 h-16 w-16 rounded-full object-cover"
        />
      ) : (
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
          <PersonIcon size={32} className="text-foreground-muted" />
        </div>
      )}
      <h3 className="truncate font-medium text-foreground" style={{ maxWidth: "100%" }}>
        {actor.name}
      </h3>
      <p className="text-xs text-foreground-muted">
        Age {actor.ageAtDeath || "?"} · {formatDate(actor.deathday)}
      </p>
    </Link>
  )
}
