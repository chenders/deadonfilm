import { useState, useMemo } from "react"
import type { BiographyDetails } from "@/types/actor"
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
    return biographySources.map((s) => ({
      url: s.url || null,
      archiveUrl: null,
      description: s.articleTitle || s.publication,
    }))
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
  const { narrative, narrativeTeaser, lesserKnownFacts } = biographyDetails

  // Determine if we have expandable content (full narrative beyond the teaser)
  const hasExpandableContent = narrative && narrativeTeaser && narrative.length > 300
  const displayText =
    hasExpandableContent && !isExpanded ? narrativeTeaser : narrative || narrativeTeaser

  return (
    <div className="mb-6 space-y-4" data-testid="biography-section">
      {/* Main Narrative Card */}
      <div className="rounded-lg bg-surface-elevated p-4 sm:p-6">
        {/* Clickable header — single toggle for expand/collapse */}
        {hasExpandableContent ? (
          <h2 className="font-display text-lg text-brown-dark">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              className="flex w-full items-center gap-2 text-left transition-colors hover:text-brown-medium"
              data-testid="biography-toggle"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
                className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
              >
                <path
                  d="M4 2l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Biography</span>
            </button>
          </h2>
        ) : (
          <h2 className="mb-2 font-display text-lg text-brown-dark">Biography</h2>
        )}

        {/* Narrative text with paragraph splitting (always visible) */}
        <div
          className={`space-y-3 leading-relaxed text-text-primary ${hasExpandableContent ? "mt-3" : ""}`}
        >
          {displayText?.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>

      {/* Lesser-Known Facts (visible when expanded, or always if no expandable content) */}
      {(isExpanded || !hasExpandableContent) && lesserKnownFacts && lesserKnownFacts.length > 0 && (
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

      {/* Sources (visible when expanded, or always if no expandable content) */}
      {(isExpanded || !hasExpandableContent) && (
        <SourceList sources={sourceEntries} title="Sources" />
      )}
    </div>
  )
}
