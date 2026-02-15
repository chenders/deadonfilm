/**
 * Renders the full death details sections: confidence warning, circumstances,
 * alternative accounts, context, career, related people, and sources.
 *
 * Used inside DeathSummaryCard's expanded state.
 */

import { useActorDeathDetails } from "@/hooks/useDeathDetails"
import { LinkedText } from "@/components/death/LinkedText"
import ConfidenceIndicator from "@/components/common/ConfidenceIndicator"
import LowConfidenceWarning from "@/components/death/LowConfidenceWarning"
import ProjectLink from "@/components/death/ProjectLink"
import SourceList from "@/components/death/SourceList"
import RelatedCelebrityCard from "@/components/death/RelatedCelebrityCard"
import type { EntityLink, StoredEntityLinks } from "@/types"

function getFieldLinks(
  entityLinks: StoredEntityLinks | undefined,
  fieldName: keyof StoredEntityLinks
): EntityLink[] | undefined {
  return entityLinks?.[fieldName]
}

function formatCareerStatus(status: string | null): string | null {
  if (!status) return null
  return status
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

interface DeathDetailsContentProps {
  slug: string
}

export default function DeathDetailsContent({ slug }: DeathDetailsContentProps) {
  const { data, isLoading, error } = useActorDeathDetails(slug)

  if (isLoading) {
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

  if (error || !data) {
    return (
      <p className="py-4 text-sm text-text-muted" data-testid="death-details-error">
        Unable to load death details.
      </p>
    )
  }

  const { circumstances, career, relatedCelebrities, sources, entityLinks } = data

  return (
    <div className="space-y-5 pt-4" data-testid="death-details-content">
      {/* Low confidence warning */}
      <LowConfidenceWarning level={circumstances.confidence} />

      {/* What We Know */}
      {circumstances.official && (
        <section data-testid="official-section">
          <h3 className="mb-2 font-display text-base text-brown-dark">What We Know</h3>
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

      {/* Career Context */}
      {(career.statusAtDeath || career.lastProject || career.posthumousReleases?.length) && (
        <section data-testid="career-section">
          <h3 className="mb-2 font-display text-base text-brown-dark">Career Context</h3>
          <div className="space-y-2 text-sm text-text-primary">
            {career.statusAtDeath && (
              <p>
                <span className="font-medium">Status at Death:</span>{" "}
                {formatCareerStatus(career.statusAtDeath)}
              </p>
            )}
            {career.lastProject && (
              <p>
                <span className="font-medium">Last Project:</span>{" "}
                <ProjectLink project={career.lastProject} />
              </p>
            )}
            {career.posthumousReleases && career.posthumousReleases.length > 0 && (
              <div>
                <span className="font-medium">Posthumous Releases:</span>
                <ul className="ml-4 mt-1 list-disc">
                  {career.posthumousReleases.map((project, idx) => (
                    <li key={idx}>
                      <ProjectLink project={project} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Related People */}
      {relatedCelebrities.length > 0 && (
        <section data-testid="related-section">
          <h3 className="mb-2 font-display text-base text-brown-dark">Related People</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {relatedCelebrities.map((celebrity, idx) => (
              <RelatedCelebrityCard key={idx} celebrity={celebrity} />
            ))}
          </div>
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
