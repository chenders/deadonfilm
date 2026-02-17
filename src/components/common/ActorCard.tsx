import { Link } from "react-router-dom"
import { getProfileUrl } from "@/services/api"
import { formatDate } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { PersonIcon } from "@/components/icons"
import CauseOfDeathBadge from "@/components/common/CauseOfDeathBadge"

interface ActorCardProps {
  name: string
  slug: string
  profilePath: string | null
  deathday: string

  birthday?: string | null
  ageAtDeath?: number | null
  causeOfDeath?: string | null
  causeOfDeathDetails?: string | null
  fallbackProfileUrl?: string | null

  knownFor?: Array<{ name: string; year: number | null; type: string }> | null
  deathManner?: string | null

  showBirthDate?: boolean
  useCauseOfDeathBadge?: boolean
  nameColor?: "accent" | "brown"

  badge?: React.ReactNode
  children?: React.ReactNode
  testId?: string
}

function formatDateRange(birthday: string | null | undefined, deathday: string): string {
  const deathStr = formatDate(deathday)
  if (birthday) {
    return `${formatDate(birthday)} – ${deathStr}`
  }
  return `Died ${deathStr}`
}

export default function ActorCard({
  name,
  slug,
  profilePath,
  deathday,
  birthday,
  ageAtDeath,
  causeOfDeath,
  causeOfDeathDetails,
  fallbackProfileUrl,
  knownFor,
  showBirthDate = false,
  useCauseOfDeathBadge = false,
  nameColor = "accent",
  badge,
  children,
  testId,
}: ActorCardProps) {
  const profileUrl = getProfileUrl(profilePath, "w185")
  const nameColorClass = nameColor === "brown" ? "text-brown-dark" : "text-accent"

  const knownForText =
    knownFor
      ?.slice(0, 2)
      .map((w) => (w.year ? `${w.name} (${w.year})` : w.name))
      .join(", ") || null

  const nameEl = (
    <h3 className={`min-w-0 truncate text-lg font-bold ${nameColorClass}`} title={name}>
      {name}
    </h3>
  )

  return (
    <Link
      to={`/actor/${slug}`}
      data-testid={testId}
      className="flex items-start gap-4 rounded-lg bg-beige p-3 text-left transition-colors hover:bg-cream"
    >
      {profileUrl ? (
        <img
          src={profileUrl}
          alt={name}
          width={80}
          height={112}
          loading="lazy"
          className="h-28 w-20 flex-shrink-0 rounded object-cover"
        />
      ) : fallbackProfileUrl ? (
        <img
          src={fallbackProfileUrl}
          alt={name}
          width={80}
          height={112}
          loading="lazy"
          className="h-28 w-20 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-28 w-20 flex-shrink-0 items-center justify-center rounded bg-brown-medium/20">
          <PersonIcon size={32} className="text-text-muted" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {badge ? (
          <div className="flex items-start justify-between gap-2">
            {nameEl}
            {badge}
          </div>
        ) : (
          nameEl
        )}

        <p className="text-sm text-text-primary">
          {showBirthDate ? formatDateRange(birthday, deathday) : `Died ${formatDate(deathday)}`}
        </p>

        {ageAtDeath != null && <p className="text-sm text-text-primary">Age: {ageAtDeath}</p>}

        {causeOfDeath &&
          (useCauseOfDeathBadge ? (
            <p className="mt-0.5 text-sm text-text-muted">
              <CauseOfDeathBadge
                causeOfDeath={causeOfDeath}
                causeOfDeathDetails={causeOfDeathDetails}
              />
            </p>
          ) : (
            <p className="mt-1 text-sm text-brown-dark">{toTitleCase(causeOfDeath)}</p>
          ))}

        {knownForText && (
          <p className="mt-0.5 line-clamp-2 text-sm italic text-text-muted">{knownForText}</p>
        )}

        {children}
      </div>
    </Link>
  )
}
