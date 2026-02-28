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
  const slug = createActorSlug(actor.name, actor.id)
  const profileUrl = getProfileUrl(actor.profilePath, "w185") || actor.fallbackProfileUrl

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={`notable-actor-${actor.id}`}
      className="flex flex-col items-center rounded-lg bg-surface-elevated p-3 text-center transition-colors hover:bg-cream"
    >
      {profileUrl ? (
        <img
          src={profileUrl}
          alt={actor.name}
          className="mb-2 h-16 w-16 rounded-full object-cover"
        />
      ) : (
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-beige">
          <PersonIcon size={32} className="text-brown-medium" />
        </div>
      )}
      <h3 className="truncate font-medium text-brown-dark" style={{ maxWidth: "100%" }}>
        {actor.name}
      </h3>
      <p className="text-xs text-text-muted">
        Age {actor.ageAtDeath || "?"} · {formatDate(actor.deathday)}
      </p>
    </Link>
  )
}
