import { formatDate, calculateAge } from '@/utils/formatDate'

interface DeathInfoProps {
  deathday: string
  birthday: string | null
  causeOfDeath: string | null
  wikipediaUrl: string | null
}

export default function DeathInfo({
  deathday,
  birthday,
  causeOfDeath,
  wikipediaUrl,
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
        <a
          href={wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brown-medium underline hover:text-brown-dark"
        >
          Wikipedia
        </a>
      )}
    </div>
  )
}
