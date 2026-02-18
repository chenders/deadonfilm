/**
 * Renders the full death details sections: confidence warning, circumstances,
 * alternative accounts, context, and sources.
 *
 * Used inside DeathSummaryCard's expanded state.
 * Career context and related people are rendered on ActorPage directly.
 */

import { useActorDeathDetails } from "@/hooks/useDeathDetails"
import { LinkedText } from "@/components/death/LinkedText"
import ConfidenceIndicator from "@/components/common/ConfidenceIndicator"
import LowConfidenceWarning from "@/components/death/LowConfidenceWarning"
import SourceList from "@/components/death/SourceList"
import type { DeathDetailsResponse, EntityLink, StoredEntityLinks } from "@/types"

function getFieldLinks(
  entityLinks: StoredEntityLinks | undefined,
  fieldName: keyof StoredEntityLinks
): EntityLink[] | undefined {
  return entityLinks?.[fieldName]
}

interface DeathDetailsContentProps {
  slug: string
  /** Pre-fetched data — if provided, skips internal useActorDeathDetails fetch */
  data?: DeathDetailsResponse
  /** If true, hides the "What We Know" heading (parent already shows it) */
  hideOfficialHeading?: boolean
}

export default function DeathDetailsContent({
  slug,
  data: externalData,
  hideOfficialHeading,
}: DeathDetailsContentProps) {
  const { data: fetchedData, isLoading, error } = useActorDeathDetails(externalData ? "" : slug)

  const data = externalData ?? fetchedData

  if (!externalData && isLoading) {
    return (
      <div className="space-y-4 py-4" data-testid="death-details-loading">
        {/* Skeleton loading */}
        <div className="h-4 w-3/4 animate-pulse rounded bg-brown-light/20" />
        <div className="h-4 w-full animate-pulse rounded bg-brown-light/20" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-brown-light/20" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-brown-light/20" />
      </div>
    )
  }

  if (!externalData && (error || !data)) {
    return (
      <p className="py-4 text-sm text-text-muted" data-testid="death-details-error">
        Unable to load death details.
      </p>
    )
  }

  if (!data) return null

  const { circumstances, sources, entityLinks } = data

  return (
    <div className="space-y-5 pt-4" data-testid="death-details-content">
      {/* Low confidence warning */}
      <LowConfidenceWarning level={circumstances.confidence} />

      {/* What We Know */}
      {circumstances.official && (
        <section data-testid="official-section">
          {!hideOfficialHeading && (
            <h3 className="mb-2 font-display text-base text-brown-dark">What We Know</h3>
          )}
          <LinkedText
            text={circumstances.official}
            links={getFieldLinks(entityLinks, "circumstances")}
            className="leading-relaxed text-text-primary"
          />
          {circumstances.confidence && (
            <div className="mt-2">
              <ConfidenceIndicator level={circumstances.confidence} />
            </div>
          )}
          <SourceList sources={sources.circumstances} title="Sources" />
        </section>
      )}

      {/* Alternative Accounts */}
      {circumstances.rumored && (
        <section data-testid="rumored-section">
          <h3 className="mb-2 font-display text-base text-brown-dark">Alternative Accounts</h3>
          <LinkedText
            text={circumstances.rumored}
            links={getFieldLinks(entityLinks, "rumored_circumstances")}
            className="leading-relaxed text-text-primary"
          />
          <SourceList sources={sources.rumored} title="Sources" />
        </section>
      )}

      {/* Additional Context */}
      {circumstances.additionalContext && (
        <section data-testid="context-section">
          <h3 className="mb-2 font-display text-base text-brown-dark">Additional Context</h3>
          <LinkedText
            text={circumstances.additionalContext}
            links={getFieldLinks(entityLinks, "additional_context")}
            className="leading-relaxed text-text-primary"
          />
        </section>
      )}

      {/* Sources */}
      {sources.cause && sources.cause.length > 0 && (
        <section data-testid="sources-section">
          <h3 className="mb-2 font-display text-base text-brown-dark">Sources</h3>
          <SourceList sources={sources.cause} title="Cause of Death" />
        </section>
      )}
    </div>
  )
}
