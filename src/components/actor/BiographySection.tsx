import { useState, useMemo } from "react"
import type { BiographyDetails } from "@/types/actor"
import ExpandableSection from "@/components/common/ExpandableSection"
import SourceList from "@/components/death/SourceList"
import type { SourceEntry } from "@/types"

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

export default function BiographySection({
  biography,
  biographyDetails,
  biographySourceUrl,
  biographySourceType,
}: BiographySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Convert biography sources to SourceEntry format for SourceList
  const biographySources = biographyDetails?.sources
  const sourceEntries: SourceEntry[] | null = useMemo(() => {
    if (!Array.isArray(biographySources) || biographySources.length === 0) return null
    const entries: SourceEntry[] = biographySources
      .map((s): SourceEntry | null => {
        const description = (s.articleTitle || s.publication || "").trim()
        if (!description) return null
        return {
          url: s.url || null,
          archiveUrl: null,
          description,
        }
      })
      .filter((entry): entry is SourceEntry => entry !== null)

    return entries.length > 0 ? entries : null
  }, [biographySources])

  // Determine which content to show
  const hasEnrichedBio =
    biographyDetails && (biographyDetails.narrative || biographyDetails.narrativeTeaser)

  // If no biography at all, render nothing
  if (!hasEnrichedBio && !biography) return null

  // Fallback to old biography (not enriched — no collapsible behavior)
  if (!hasEnrichedBio) {
    return (
      <div className="mb-6 rounded-lg bg-surface-elevated p-4" data-testid="biography-section">
        <h2 className="mb-2 font-display text-lg text-brown-dark">Life</h2>
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
  const { narrative, narrativeTeaser, lesserKnownFacts } = biographyDetails
  const displayText = narrative || narrativeTeaser

  // If narrative is short (< 300 chars) or no narrative (teaser only), show static card
  const hasExpandableContent = !!narrative && narrative.length > 300

  if (!hasExpandableContent) {
    return (
      <div className="mb-6 space-y-4" data-testid="biography-section">
        <div className="rounded-lg bg-surface-elevated p-4 sm:p-6">
          <h2 className="mb-2 font-display text-lg text-brown-dark">Life</h2>
          <div className="space-y-3 leading-relaxed text-text-primary">
            {displayText?.split("\n\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </div>

        {/* Lesser-Known Facts (always visible when not expandable) */}
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

        {/* Sources (always visible when not expandable) */}
        <SourceList sources={sourceEntries} title="Sources" />
      </div>
    )
  }

  // Expandable: full narrative with gradient truncation
  return (
    <div className="mb-6 space-y-4" data-testid="biography-section">
      <ExpandableSection
        title="Life"
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((prev) => !prev)}
      >
        {/* Full narrative — gradient truncation handles collapsed preview */}
        <div className="space-y-3 leading-relaxed text-text-primary">
          {narrative.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        {/* Lesser-Known Facts (visible when expanded) */}
        {isExpanded && lesserKnownFacts && lesserKnownFacts.length > 0 && (
          <div className="mt-4 rounded-lg bg-surface-inset p-4" data-testid="biography-facts">
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

        {/* Sources (visible when expanded) */}
        {isExpanded && <SourceList sources={sourceEntries} title="Sources" />}
      </ExpandableSection>
    </div>
  )
}
