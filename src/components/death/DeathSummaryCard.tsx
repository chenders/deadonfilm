/**
 * Expandable death summary card for the actor page.
 *
 * Collapsed: shows a teaser with cause, age, and short summary.
 * Expanded: lazy-loads and renders full death details via DeathDetailsContent.
 */

import { useState, useCallback } from "react"
import DeathDetailsContent from "./DeathDetailsContent"

interface DeathSummaryCardProps {
  /** Short cause of death (e.g., "stomach cancer") */
  causeOfDeath: string | null
  /** 1-2 sentence summary from actor profile */
  causeOfDeathDetails: string | null
  /** Age at time of death */
  ageAtDeath: number | null
  /** Years died before life expectancy (positive = early) */
  yearsLost: number | null
  /** Whether full death details are available for expansion */
  hasFullDetails: boolean
  /** Actor slug for lazy-loading death details */
  slug: string
  /** Fires on first expansion (for analytics) */
  onExpand?: () => void
}

export default function DeathSummaryCard({
  causeOfDeath,
  causeOfDeathDetails,
  ageAtDeath,
  yearsLost,
  hasFullDetails,
  slug,
  onExpand,
}: DeathSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasEverExpanded, setHasEverExpanded] = useState(false)

  const handleToggle = useCallback(() => {
    if (!isExpanded && !hasEverExpanded) {
      setHasEverExpanded(true)
      onExpand?.()
    }
    setIsExpanded((prev) => !prev)
  }, [isExpanded, hasEverExpanded, onExpand])

  // Build teaser text
  const teaserParts: string[] = []
  if (causeOfDeath) {
    teaserParts.push(`Died of ${causeOfDeath.toLowerCase()}`)
  }
  if (ageAtDeath) {
    teaserParts.push(`at age ${ageAtDeath}`)
  }
  const teaserLine = teaserParts.length > 0 ? teaserParts.join(" ") + "." : null

  // No death info at all — don't render the card
  if (!causeOfDeath && !causeOfDeathDetails && !ageAtDeath) {
    return null
  }

  return (
    <div
      className="mb-6 rounded-lg bg-surface-elevated p-4 sm:p-6"
      data-testid="death-summary-card"
    >
      {/* Header */}
      <h2 className="font-display text-lg text-brown-dark">
        {hasFullDetails ? (
          <button
            onClick={handleToggle}
            aria-expanded={isExpanded}
            className="flex w-full items-center gap-2 text-left transition-colors hover:text-brown-medium"
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
            <span>Death Circumstances</span>
          </button>
        ) : (
          <span>Death Circumstances</span>
        )}
      </h2>

      {/* Teaser content (always visible) */}
      <div className="mt-3 text-sm leading-relaxed text-text-primary">
        {teaserLine && <p>{teaserLine}</p>}
        {causeOfDeathDetails && <p className="mt-1">{causeOfDeathDetails}</p>}
        {yearsLost !== null && yearsLost > 0 && (
          <p className="mt-1 text-text-muted">
            Died {yearsLost.toFixed(1)} years before life expectancy.
          </p>
        )}
      </div>

      {/* Expand/Collapse button */}
      {hasFullDetails && (
        <button
          onClick={handleToggle}
          aria-expanded={isExpanded}
          className="mt-3 w-full rounded-md py-2 text-center text-sm font-medium text-brown-dark transition-colors hover:bg-cream"
          data-testid="death-details-toggle"
        >
          {isExpanded ? "Collapse" : "Read full story"}
        </button>
      )}

      {/* Expanded content (lazy-loaded) */}
      {isExpanded && (
        <div data-testid="death-details-expanded">
          <div className="my-3 border-t border-brown-light/20" />
          <DeathDetailsContent slug={slug} />
        </div>
      )}
    </div>
  )
}
