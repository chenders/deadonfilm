import { useState } from "react"
import type { BiographyDetails } from "@/types/actor"

interface BiographySectionProps {
  biography?: string | null
  biographyDetails?: BiographyDetails | null
  biographySourceUrl?: string | null
  biographySourceType?: "wikipedia" | "tmdb" | "imdb" | null
}

function getSourceDisplayName(type: "wikipedia" | "tmdb" | "imdb" | null): string {
  switch (type) {
    case "wikipedia":
      return "Wikipedia"
    case "tmdb":
      return "TMDB"
    case "imdb":
      return "IMDb"
    default:
      return "source"
  }
}

/**
 * Format a life_notable_factor slug for display.
 * E.g., "military_service" -> "Military Service"
 */
function formatFactor(factor: string): string {
  return factor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export default function BiographySection({
  biography,
  biographyDetails,
  biographySourceUrl,
  biographySourceType,
}: BiographySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Determine which content to show
  const hasEnrichedBio =
    biographyDetails && (biographyDetails.narrative || biographyDetails.narrativeTeaser)

  // If no biography at all, render nothing
  if (!hasEnrichedBio && !biography) return null

  // Fallback to old biography
  if (!hasEnrichedBio) {
    return (
      <div className="mb-6 rounded-lg bg-surface-elevated p-4" data-testid="biography-section">
        <h2 className="mb-2 font-display text-lg text-brown-dark">Biography</h2>
        <p className="leading-relaxed text-text-primary">{biography}</p>
        {biographySourceUrl && (
          <a
            href={biographySourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-brown-medium hover:text-brown-dark hover:underline"
          >
            Read more on {getSourceDisplayName(biographySourceType ?? null)} →
          </a>
        )}
      </div>
    )
  }

  // Enriched biography
  const { narrativeTeaser, narrative, lifeNotableFactors, lesserKnownFacts } = biographyDetails

  // Determine if we need teaser/expand
  const hasLongNarrative = narrative && narrativeTeaser && narrative.length > 300
  const displayText =
    hasLongNarrative && !isExpanded ? narrativeTeaser : narrative || narrativeTeaser

  return (
    <div className="mb-6 space-y-4" data-testid="biography-section">
      {/* Main Narrative Card */}
      <div className="rounded-lg bg-surface-elevated p-4">
        <h2 className="mb-2 font-display text-lg text-brown-dark">Biography</h2>

        {/* Narrative text with paragraph splitting */}
        <div className="space-y-3 leading-relaxed text-text-primary">
          {displayText?.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        {/* Show more/less toggle */}
        {hasLongNarrative && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-sm font-medium text-brown-medium hover:text-brown-dark"
            data-testid="biography-toggle"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Life Notable Factors */}
      {lifeNotableFactors && lifeNotableFactors.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="biography-factors">
          {lifeNotableFactors.map((factor) => (
            <span
              key={factor}
              className="rounded-full bg-brown-light/20 px-3 py-1 text-xs font-medium text-brown-dark"
            >
              {formatFactor(factor)}
            </span>
          ))}
        </div>
      )}

      {/* Lesser-Known Facts */}
      {lesserKnownFacts && lesserKnownFacts.length > 0 && (
        <div className="rounded-lg bg-surface-elevated p-4" data-testid="biography-facts">
          <h3 className="mb-2 text-sm font-semibold text-brown-dark">Lesser-Known Facts</h3>
          <ul className="space-y-1.5">
            {lesserKnownFacts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                <span className="mt-1 text-brown-medium">&bull;</span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
