import { formatDate, calculateAge } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { InfoIcon } from "@/components/icons"
import HoverTooltip from "@/components/common/HoverTooltip"
import { trackPageAction } from "@/hooks/useNewRelicBrowser"

interface DeathInfoProps {
  actorName: string
  deathday: string
  birthday: string | null
  ageAtDeath: number | null
  yearsLost: number | null
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  wikipediaUrl: string | null
  tmdbUrl: string
  isLoading?: boolean
}

/**
 * Format years lost/gained into human-readable text
 * Positive yearsLost = died early, negative = lived longer than expected
 */
function formatYearsLost(yearsLost: number): string {
  const absYears = Math.abs(yearsLost)
  const roundedYears = Math.round(absYears)

  if (roundedYears === 0) {
    return "around expected"
  }

  const yearWord = roundedYears === 1 ? "year" : "years"
  if (yearsLost > 0) {
    return `${roundedYears} ${yearWord} early`
  } else {
    return `${roundedYears} ${yearWord} longer`
  }
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

// Get the best profile link with fallback priority: Wikipedia > TMDB
function getProfileLink(
  wikipediaUrl: string | null,
  tmdbUrl: string
): { url: string; label: string } {
  if (wikipediaUrl) {
    return { url: wikipediaUrl, label: "Wikipedia" }
  }
  // TMDB is always available since we have the person ID
  return { url: tmdbUrl, label: "TMDB" }
}

export default function DeathInfo({
  actorName,
  deathday,
  birthday,
  ageAtDeath: ageAtDeathProp,
  yearsLost,
  causeOfDeath,
  causeOfDeathDetails,
  wikipediaUrl,
  tmdbUrl,
  isLoading = false,
}: DeathInfoProps) {
  // Use prop if available, otherwise calculate from dates
  const ageAtDeath = ageAtDeathProp ?? calculateAge(birthday, deathday)
  const hasDetails = causeOfDeathDetails && causeOfDeathDetails.trim().length > 0

  // Calculate expected lifespan for the visualization
  // expectedLifespan = ageAtDeath + yearsLost (since yearsLost = expected - actual)
  // Note: yearsLost may come as a string from API, so ensure it's a number
  const yearsLostNum = yearsLost !== null ? Number(yearsLost) : null
  const expectedLifespan =
    ageAtDeath !== null && yearsLostNum !== null ? ageAtDeath + yearsLostNum : null
  const profileLink = getProfileLink(wikipediaUrl, tmdbUrl)

  return (
    <div data-testid="death-info" className="text-right sm:text-right">
      <p data-testid="death-date" className="font-medium text-accent">
        {formatDate(deathday)}
      </p>

      {ageAtDeath !== null && (
        <p data-testid="age-at-death" className="text-sm text-text-muted">
          Age {ageAtDeath}
          {yearsLostNum !== null && (
            <span
              className={yearsLostNum > 0 ? "text-accent" : "text-green-700"}
              title={
                yearsLostNum > 0
                  ? `Died ${Math.abs(yearsLostNum).toFixed(1)} years earlier than expected for their birth year`
                  : yearsLostNum < 0
                    ? `Lived ${Math.abs(yearsLostNum).toFixed(1)} years longer than expected for their birth year`
                    : "Died around expected age for their birth year"
              }
            >
              {" "}
              ({formatYearsLost(yearsLostNum)})
            </span>
          )}
        </p>
      )}

      {/* Lifespan visualization bar */}
      {expectedLifespan !== null && ageAtDeath !== null && yearsLostNum !== null && (
        <div
          className="ml-auto mt-1.5 w-40"
          title={
            yearsLostNum > 0
              ? `Lived ${ageAtDeath} of ${Math.round(expectedLifespan)} expected years`
              : `Lived ${ageAtDeath} years, ${Math.abs(Math.round(yearsLostNum))} more than expected`
          }
        >
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
            {yearsLostNum > 0 ? (
              <>
                {/* Life lived (solid) - died early */}
                <div
                  className="bg-brown-medium"
                  style={{ width: `${(ageAtDeath / expectedLifespan) * 100}%` }}
                />
                {/* Life lost (striped/faded) */}
                <div
                  className="bg-accent/40"
                  style={{
                    width: `${(yearsLostNum / expectedLifespan) * 100}%`,
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)",
                  }}
                />
              </>
            ) : (
              /* Lived longer than expected - full bar */
              <div className="w-full bg-green-600" />
            )}
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-text-muted">
            <span>0</span>
            <span>{yearsLostNum > 0 ? Math.round(expectedLifespan) : ageAtDeath} yrs</span>
          </div>
        </div>
      )}

      {causeOfDeath && (
        <p className="mt-1 text-sm text-text-muted">
          {hasDetails ? (
            <HoverTooltip
              content={causeOfDeathDetails}
              testId="death-details-tooltip"
              className="underline decoration-dotted"
              onOpen={() =>
                trackPageAction("view_death_details", {
                  actorName,
                  causeOfDeath,
                })
              }
            >
              <span data-testid="death-details-trigger">
                {toTitleCase(causeOfDeath)}
                <InfoIcon
                  size={14}
                  className="ml-1 inline-block align-text-bottom text-brown-medium"
                />
              </span>
            </HoverTooltip>
          ) : (
            <a
              href={profileLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brown-dark"
            >
              {toTitleCase(causeOfDeath)}
            </a>
          )}
        </p>
      )}

      {!causeOfDeath && (wikipediaUrl || !isLoading) && (
        <p className="mt-1 text-sm text-text-muted">
          <span className="italic">(cause unknown)</span>
          {" - "}
          <a
            href={profileLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brown-medium underline hover:text-brown-dark"
          >
            {profileLink.label}
          </a>
        </p>
      )}

      {!causeOfDeath && !wikipediaUrl && isLoading && (
        <p className="mt-1 text-sm italic text-brown-medium">
          Looking up cause
          <LoadingEllipsis />
        </p>
      )}
    </div>
  )
}
