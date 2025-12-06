import { formatDate, calculateAge } from "@/utils/formatDate"

interface DeathInfoProps {
  deathday: string
  birthday: string | null
  causeOfDeath: string | null
  wikipediaUrl: string | null
  isLoading?: boolean
}

function LoadingEllipsis() {
  return (
    <span className="inline-flex">
      <span className="animate-pulse">.</span>
      <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>
        .
      </span>
      <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>
        .
      </span>
    </span>
  )
}

export default function DeathInfo({
  deathday,
  birthday,
  causeOfDeath,
  wikipediaUrl,
  isLoading = false,
}: DeathInfoProps) {
  const ageAtDeath = calculateAge(birthday, deathday)

  return (
    <div className="text-right sm:text-right">
      <p className="text-accent font-medium">{formatDate(deathday)}</p>

      {ageAtDeath !== null && <p className="text-sm text-text-muted">Age {ageAtDeath}</p>}

      {causeOfDeath && (
        <p className="text-sm text-text-muted mt-1">
          {wikipediaUrl ? (
            <a
              href={wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brown-dark"
            >
              {causeOfDeath}
            </a>
          ) : (
            causeOfDeath
          )}
        </p>
      )}

      {!causeOfDeath && wikipediaUrl && (
        <p className="text-sm text-text-muted mt-1">
          <span className="italic">(cause unknown)</span>
          {" - "}
          <a
            href={wikipediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brown-medium underline hover:text-brown-dark"
          >
            Wikipedia
          </a>
        </p>
      )}

      {!causeOfDeath && !wikipediaUrl && isLoading && (
        <p className="text-sm text-text-muted mt-1 italic">
          Looking up cause
          <LoadingEllipsis />
        </p>
      )}
    </div>
  )
}
