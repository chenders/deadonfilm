/**
 * Expandable death summary card for the actor page.
 *
 * Collapsed: shows "What We Know" narrative truncated with gradient fade.
 * Expanded: shows full death details (alternative accounts, context, sources).
 * Falls back to static teaser when no full details are available.
 */

import { useState, useCallback } from "react"
import { useActorDeathDetails } from "@/hooks/useDeathDetails"
import { LinkedText } from "@/components/death/LinkedText"
import ExpandableSection from "@/components/common/ExpandableSection"
import DeathDetailsContent from "./DeathDetailsContent"
import type { StoredEntityLinks, EntityLink } from "@/types"

function getFieldLinks(
  entityLinks: StoredEntityLinks | undefined,
  fieldName: keyof StoredEntityLinks
): EntityLink[] | undefined {
  return entityLinks?.[fieldName]
}

interface DeathSummaryCardProps {
  /** Short cause of death (e.g., "stomach cancer") */
  causeOfDeath: string | null
  /** Age at time of death */
  ageAtDeath: number | null
  /** Years died before life expectancy (positive = early) */
  yearsLost: number | null
  /** Whether full death details are available for expansion */
  hasFullDetails: boolean
  /** Actor slug for loading death details */
  slug: string
  /** Fires on first expansion (for analytics) */
  onExpand?: () => void
}

export default function DeathSummaryCard({
  causeOfDeath,
  ageAtDeath,
  yearsLost,
  hasFullDetails,
  slug,
  onExpand,
}: DeathSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasEverExpanded, setHasEverExpanded] = useState(false)

  // Eager-fetch death details when hasFullDetails is true
  const { data, isLoading } = useActorDeathDetails(hasFullDetails ? slug : "")

  const handleToggle = useCallback(() => {
    if (!isExpanded && !hasEverExpanded) {
      setHasEverExpanded(true)
      onExpand?.()
    }
    setIsExpanded((prev) => !prev)
  }, [isExpanded, hasEverExpanded, onExpand])

  // No death info at all — don't render the card
  if (!causeOfDeath && !ageAtDeath && !hasFullDetails) {
    return null
  }

  // Non-expandable fallback: static card with teaser content
  if (!hasFullDetails) {
    let teaserLine: string | null = null
    if (causeOfDeath && ageAtDeath !== null) {
      teaserLine = `Died of ${causeOfDeath.toLowerCase()} at age ${ageAtDeath}.`
    } else if (causeOfDeath) {
      teaserLine = `Died of ${causeOfDeath.toLowerCase()}.`
    } else if (ageAtDeath !== null) {
      teaserLine = `Died at age ${ageAtDeath}.`
    }

    return (
      <div
        className="mb-6 rounded-lg bg-surface-elevated p-4 sm:p-6"
        data-testid="death-summary-card"
      >
        <h2 className="font-display text-lg text-brown-dark">Death</h2>
        <div className="mt-3 leading-relaxed text-text-primary">
          {teaserLine && <p>{teaserLine}</p>}
          {yearsLost !== null && yearsLost > 0 && (
            <p className="mt-1 text-text-muted">
              Died {yearsLost.toFixed(1)} years before life expectancy.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Loading skeleton while death details are being fetched
  if (isLoading || !data) {
    return (
      <div
        className="mb-6 rounded-lg bg-surface-elevated p-4 sm:p-6"
        data-testid="death-summary-card"
      >
        <h2 className="font-display text-lg text-brown-dark">Death</h2>
        <div className="mt-3 space-y-3" data-testid="death-details-loading">
          <div className="h-4 w-3/4 animate-pulse rounded bg-brown-light/20" />
          <div className="h-4 w-full animate-pulse rounded bg-brown-light/20" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-brown-light/20" />
        </div>
      </div>
    )
  }

  // Expandable: show What We Know narrative with gradient truncation
  const { circumstances, entityLinks } = data

  return (
    <div className="mb-6" data-testid="death-summary-card">
      <ExpandableSection
        title="Death"
        isExpanded={isExpanded}
        onToggle={handleToggle}
        collapsedMaxHeight="13rem"
      >
        {/* What We Know narrative (always visible, gradient-truncated when collapsed) */}
        {circumstances.official ? (
          <LinkedText
            text={circumstances.official}
            links={getFieldLinks(entityLinks, "circumstances")}
            className="leading-relaxed text-text-primary"
          />
        ) : (
          <p className="leading-relaxed text-text-primary">
            {causeOfDeath && ageAtDeath !== null
              ? `Died of ${causeOfDeath.toLowerCase()} at age ${ageAtDeath}.`
              : causeOfDeath
                ? `Died of ${causeOfDeath.toLowerCase()}.`
                : ageAtDeath !== null
                  ? `Died at age ${ageAtDeath}.`
                  : "Death details available."}
          </p>
        )}

        {/* Full death details (visible when expanded, below the narrative) */}
        {isExpanded && (
          <div data-testid="death-details-expanded" className="mt-4">
            <DeathDetailsContent slug={slug} data={data} hideOfficialNarrative />
          </div>
        )}
      </ExpandableSection>
    </div>
  )
}
