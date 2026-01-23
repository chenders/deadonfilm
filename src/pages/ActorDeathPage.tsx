import { useParams, useLocation, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useActorDeathDetails } from "@/hooks/useDeathDetails"
import { usePageViewTracking } from "@/hooks/usePageViewTracking"
import { extractActorId, createActorSlug, createMovieSlug, createShowSlug } from "@/utils/slugify"
import { formatDate } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { getProfileUrl } from "@/services/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema } from "@/utils/schema"
import { PersonIcon, ExternalLinkIcon } from "@/components/icons"
import type { ProjectInfo, SourceEntry, RelatedCelebrity } from "@/types"

// Confidence indicator component
function ConfidenceIndicator({ level }: { level: string | null }) {
  if (!level) return null

  const levels = {
    high: { dots: 4, color: "bg-green-500", label: "High confidence" },
    medium: { dots: 3, color: "bg-yellow-500", label: "Medium confidence" },
    low: { dots: 2, color: "bg-orange-500", label: "Low confidence" },
    disputed: { dots: 1, color: "bg-red-500", label: "Disputed" },
  }

  const config = levels[level as keyof typeof levels] || levels.medium

  return (
    <div
      className="inline-flex items-center gap-1"
      title={config.label}
      data-testid="confidence-indicator"
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${i <= config.dots ? config.color : "bg-gray-300"}`}
        />
      ))}
      <span className="ml-1 text-xs text-text-muted">{config.label}</span>
    </div>
  )
}

// Warning banner for low confidence death information
function LowConfidenceWarning({ level }: { level: string | null }) {
  if (!level || (level !== "low" && level !== "disputed")) return null

  const isDisputed = level === "disputed"

  return (
    <div
      className="mb-6 rounded-lg border-2 border-orange-300 bg-orange-50 p-4"
      data-testid="low-confidence-warning"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <h3 className="font-medium text-orange-800">
            {isDisputed ? "Information Disputed" : "Unverified Information"}
          </h3>
          <p className="mt-1 text-sm text-orange-700">
            {isDisputed
              ? "The circumstances of this death are disputed. Multiple conflicting accounts exist, and the information below may not be accurate."
              : "The information below could not be fully verified. The death date or circumstances may contain inaccuracies."}
          </p>
        </div>
      </div>
    </div>
  )
}

// Notable factor badge
function FactorBadge({ factor }: { factor: string }) {
  const formatted = factor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  return (
    <span
      className="inline-block rounded-full bg-beige px-2 py-0.5 text-xs text-brown-dark"
      data-testid="factor-badge"
    >
      {formatted}
    </span>
  )
}

// Project link component
function ProjectLink({ project }: { project: ProjectInfo }) {
  // Generate link if we have tmdb_id
  const getProjectUrl = () => {
    if (!project.tmdb_id) return null
    if (project.type === "movie") {
      return `/movie/${createMovieSlug(project.title, project.year?.toString() || "unknown", project.tmdb_id)}`
    } else if (project.type === "show") {
      return `/show/${createShowSlug(project.title, project.year ? `${project.year}-01-01` : null, project.tmdb_id)}`
    }
    return null
  }

  const url = getProjectUrl()
  const displayText = `${project.title}${project.year ? ` (${project.year})` : ""}`

  if (url) {
    return (
      <Link to={url} className="text-brown-dark underline hover:text-brown-medium">
        {displayText}
      </Link>
    )
  }

  // Fallback to IMDB if available
  if (project.imdb_id) {
    return (
      <a
        href={`https://www.imdb.com/title/${project.imdb_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brown-dark underline hover:text-brown-medium"
      >
        {displayText}
        <ExternalLinkIcon size={12} className="ml-1 inline" />
      </a>
    )
  }

  return <span>{displayText}</span>
}

// Source list component
function SourceList({ sources, title }: { sources: SourceEntry[] | null; title: string }) {
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-2" data-testid={`sources-${title.toLowerCase()}`}>
      <h4 className="text-xs font-medium text-text-muted">{title}:</h4>
      <ul className="mt-1 space-y-1">
        {sources.map((source, idx) => (
          <li key={idx} className="text-xs text-text-muted">
            {source.url || source.archiveUrl ? (
              <a
                href={source.archiveUrl || source.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-brown-dark"
              >
                {source.description}
                <ExternalLinkIcon size={10} className="ml-1 inline" />
              </a>
            ) : (
              <span>{source.description}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Related celebrity component
function RelatedCelebrityCard({ celebrity }: { celebrity: RelatedCelebrity }) {
  const content = (
    <div className="rounded-lg bg-white p-3">
      <p className="font-medium text-brown-dark">{celebrity.name}</p>
      <p className="mt-1 text-sm text-text-muted">{celebrity.relationship}</p>
    </div>
  )

  if (celebrity.slug) {
    return (
      <Link
        to={`/actor/${celebrity.slug}`}
        className="block transition-colors hover:bg-cream"
        data-testid="related-celebrity"
      >
        {content}
      </Link>
    )
  }

  return <div data-testid="related-celebrity">{content}</div>
}

export default function ActorDeathPage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const actorId = slug ? extractActorId(slug) : 0
  const { data, isLoading, error } = useActorDeathDetails(actorId)

  // Track page view for analytics
  usePageViewTracking("actor_death", data?.actor?.id ?? null, location.pathname)

  // Error states
  if (!actorId) {
    return <ErrorMessage message="Invalid actor URL" />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading death details..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="No detailed death information available for this actor" />
  }

  const { actor, circumstances, career, relatedCelebrities, sources } = data
  const profileUrl = getProfileUrl(actor.profilePath, "w185")
  const actorSlug = createActorSlug(actor.name, actor.tmdbId)

  // Format career status for display
  const formatCareerStatus = (status: string | null) => {
    if (!status) return null
    return status
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  // Build breadcrumb schema
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", url: "https://deadonfilm.com" },
    { name: actor.name, url: `https://deadonfilm.com/actor/${actorSlug}` },
    { name: "Death Details", url: `https://deadonfilm.com/actor/${actorSlug}/death` },
  ])

  return (
    <>
      <Helmet>
        <title>{actor.name} - Death Details | Dead on Film</title>
        <meta
          name="description"
          content={`Detailed information about ${actor.name}'s death${actor.causeOfDeath ? `: ${actor.causeOfDeath}` : ""}`}
        />
        <link rel="canonical" href={`https://deadonfilm.com/actor/${actorSlug}/death`} />
      </Helmet>

      <JsonLd data={breadcrumbSchema} />

      <div data-testid="actor-death-page" className="mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          to={`/actor/${actorSlug}`}
          className="mb-4 inline-flex items-center text-sm text-text-muted hover:text-brown-dark"
          data-testid="back-to-actor"
        >
          &larr; Back to {actor.name}
        </Link>

        {/* Header section */}
        <div className="mb-6 rounded-lg bg-white p-4 sm:p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* Profile photo */}
            {profileUrl ? (
              <img
                src={profileUrl}
                alt={actor.name}
                width={100}
                height={133}
                className="h-[133px] w-[100px] flex-shrink-0 rounded-lg object-cover shadow-md"
                data-testid="actor-photo"
              />
            ) : (
              <div className="flex h-[133px] w-[100px] flex-shrink-0 items-center justify-center rounded-lg bg-beige shadow-md">
                <PersonIcon size={48} className="text-text-muted" />
              </div>
            )}

            {/* Basic info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="font-display text-2xl text-accent">{actor.name}</h1>

              <div className="mt-2 space-y-1 text-sm text-text-muted">
                {actor.birthday && (
                  <p>
                    <span className="font-medium">Born:</span> {formatDate(actor.birthday)}
                  </p>
                )}
                <p>
                  <span className="font-medium">Died:</span> {formatDate(actor.deathday)}
                  {actor.ageAtDeath && ` (age ${actor.ageAtDeath})`}
                </p>
                {circumstances.locationOfDeath && (
                  <p>
                    <span className="font-medium">Location:</span> {circumstances.locationOfDeath}
                  </p>
                )}
                {actor.causeOfDeath && (
                  <p>
                    <span className="font-medium">Cause:</span> {toTitleCase(actor.causeOfDeath)}
                  </p>
                )}
              </div>

              {/* Notable factors badges */}
              {circumstances.notableFactors && circumstances.notableFactors.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1 sm:justify-start">
                  {circumstances.notableFactors.map((factor) => (
                    <FactorBadge key={factor} factor={factor} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Low confidence warning banner */}
        <LowConfidenceWarning level={circumstances.confidence} />

        {/* What We Know section */}
        {circumstances.official && (
          <section className="mb-6 rounded-lg bg-white p-4 sm:p-6" data-testid="official-section">
            <h2 className="mb-3 font-display text-lg text-brown-dark">What We Know</h2>
            <p className="leading-relaxed text-text-muted">{circumstances.official}</p>
            {circumstances.confidence && (
              <div className="mt-3">
                <ConfidenceIndicator level={circumstances.confidence} />
              </div>
            )}
            <SourceList sources={sources.circumstances} title="Sources" />
          </section>
        )}

        {/* Disputed/Alternative Accounts section */}
        {circumstances.rumored && (
          <section className="mb-6 rounded-lg bg-white p-4 sm:p-6" data-testid="rumored-section">
            <h2 className="mb-3 font-display text-lg text-brown-dark">Alternative Accounts</h2>
            <p className="leading-relaxed text-text-muted">{circumstances.rumored}</p>
            <SourceList sources={sources.rumored} title="Sources" />
          </section>
        )}

        {/* Additional Context */}
        {circumstances.additionalContext && (
          <section className="mb-6 rounded-lg bg-white p-4 sm:p-6" data-testid="context-section">
            <h2 className="mb-3 font-display text-lg text-brown-dark">Additional Context</h2>
            <p className="leading-relaxed text-text-muted">{circumstances.additionalContext}</p>
          </section>
        )}

        {/* Career Context section */}
        {(career.statusAtDeath || career.lastProject || career.posthumousReleases?.length) && (
          <section className="mb-6 rounded-lg bg-white p-4 sm:p-6" data-testid="career-section">
            <h2 className="mb-3 font-display text-lg text-brown-dark">Career Context</h2>
            <div className="space-y-2 text-sm text-text-muted">
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

        {/* Related People section */}
        {relatedCelebrities.length > 0 && (
          <section className="mb-6" data-testid="related-section">
            <h2 className="mb-3 font-display text-lg text-brown-dark">Related People</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {relatedCelebrities.map((celebrity, idx) => (
                <RelatedCelebrityCard key={idx} celebrity={celebrity} />
              ))}
            </div>
          </section>
        )}

        {/* Sources section */}
        {sources.cause && sources.cause.length > 0 && (
          <section className="mb-6 rounded-lg bg-white p-4 sm:p-6" data-testid="sources-section">
            <h2 className="mb-3 font-display text-lg text-brown-dark">Sources</h2>
            <SourceList sources={sources.cause} title="Cause of Death" />
          </section>
        )}
      </div>
    </>
  )
}
