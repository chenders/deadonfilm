/**
 * Admin page for starting both death and biography enrichment runs
 * for a set of pre-selected actors. Shows skip status per actor and
 * submits both run types via Promise.allSettled.
 */

import { useState, useMemo } from "react"
import { Link, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
import AdminTabs from "../../components/admin/ui/AdminTabs"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useStartEnrichmentRun } from "../../hooks/admin/useEnrichmentRuns"
import { useStartBioEnrichmentRun } from "../../hooks/admin/useBioEnrichmentRuns"

interface ActorWithVersions {
  id: number
  name: string
  popularity: number | null
  tmdb_id: number | null
  enrichment_version: string | null
  biography_version: number | null
}

// Skip logic: death enrichment already done at v4.0.0, bio done at version >= 1
function shouldSkipDeath(actor: ActorWithVersions): boolean {
  return actor.enrichment_version === "4.0.0"
}
function shouldSkipBio(actor: ActorWithVersions, allowRegeneration: boolean): boolean {
  if (allowRegeneration) return false
  return actor.biography_version != null && actor.biography_version >= 1
}

export default function CombinedEnrichmentPage(): React.JSX.Element {
  const location = useLocation()
  const preSelectedActorIds = (location.state?.selectedActorIds as number[]) || []

  const startDeathEnrichment = useStartEnrichmentRun()
  const startBioEnrichment = useStartBioEnrichmentRun()

  const [activeTab, setActiveTab] = useState("death")
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<{
    death?: { success: boolean; runId?: number; error?: string }
    bio?: { success: boolean; runId?: number; error?: string }
  } | null>(null)

  // ── Death enrichment options ──────────────────────────────────────────
  const [deathMaxTotalCost, setDeathMaxTotalCost] = useState("10")
  const [deathMaxCostPerActor, setDeathMaxCostPerActor] = useState<number | undefined>(undefined)
  const [deathConfidence, setDeathConfidence] = useState("0.5")
  const [deathFree, setDeathFree] = useState(true)
  const [deathPaid, setDeathPaid] = useState(true)
  const [deathAi, setDeathAi] = useState(true)
  const [deathGatherAllSources, setDeathGatherAllSources] = useState(true)
  const [deathClaudeCleanup, setDeathClaudeCleanup] = useState(true)
  const [deathFollowLinks, setDeathFollowLinks] = useState(true)
  const [deathAiLinkSelection, setDeathAiLinkSelection] = useState(true)
  const [deathAiContentExtraction, setDeathAiContentExtraction] = useState(true)
  const [deathWikiAISection, setDeathWikiAISection] = useState(true)
  const [deathWikiFollowLinked, setDeathWikiFollowLinked] = useState(true)
  const [deathWikiMaxLinked, setDeathWikiMaxLinked] = useState("2")
  const [deathWikiMaxSections, setDeathWikiMaxSections] = useState("10")

  // ── Bio enrichment options ────────────────────────────────────────────
  const [bioConfidence, setBioConfidence] = useState(0.6)
  const [bioMaxCostPerActor, setBioMaxCostPerActor] = useState("0.50")
  const [bioMaxTotalCost, setBioMaxTotalCost] = useState("25")
  const [bioFree, setBioFree] = useState(true)
  const [bioReference, setBioReference] = useState(true)
  const [bioBooks, setBioBooks] = useState(true)
  const [bioWebSearch, setBioWebSearch] = useState(true)
  const [bioNews, setBioNews] = useState(true)
  const [bioObituary, setBioObituary] = useState(true)
  const [bioArchives, setBioArchives] = useState(true)
  const [bioAllowRegeneration, setBioAllowRegeneration] = useState(true)

  // ── Fetch actor details with enrichment versions ──────────────────────
  const {
    data: actors,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin", "actors", "details-combined", preSelectedActorIds],
    queryFn: async () => {
      if (preSelectedActorIds.length === 0) return []
      // Backend limits to 100 IDs per request — chunk if needed
      const CHUNK_SIZE = 100
      const allActors: ActorWithVersions[] = []
      for (let i = 0; i < preSelectedActorIds.length; i += CHUNK_SIZE) {
        const chunk = preSelectedActorIds.slice(i, i + CHUNK_SIZE)
        const params = new URLSearchParams()
        chunk.forEach((id) => params.append("ids", id.toString()))
        const response = await fetch(`/admin/api/coverage/actors/by-ids?${params.toString()}`, {
          credentials: "include",
        })
        if (!response.ok) throw new Error("Failed to fetch actor details")
        const actors = (await response.json()) as ActorWithVersions[]
        allActors.push(...actors)
      }
      return allActors
    },
    enabled: preSelectedActorIds.length > 0,
  })

  // ── Compute skip sets ─────────────────────────────────────────────────
  const { deathActorIds, bioActorIds, deathSkipCount, bioSkipCount } = useMemo(() => {
    if (!actors) return { deathActorIds: [], bioActorIds: [], deathSkipCount: 0, bioSkipCount: 0 }
    const deathIds: number[] = []
    const bioIds: number[] = []
    let dSkip = 0
    let bSkip = 0
    for (const actor of actors) {
      if (shouldSkipDeath(actor)) {
        dSkip++
      } else {
        deathIds.push(actor.id)
      }
      if (shouldSkipBio(actor, bioAllowRegeneration)) {
        bSkip++
      } else {
        bioIds.push(actor.id)
      }
    }
    return {
      deathActorIds: deathIds,
      bioActorIds: bioIds,
      deathSkipCount: dSkip,
      bioSkipCount: bSkip,
    }
  }, [actors, bioAllowRegeneration])

  const tabs = useMemo(
    () => [
      { id: "death", label: "Death Options", badge: deathActorIds.length, testId: "tab-death" },
      { id: "bio", label: "Bio Options", badge: bioActorIds.length, testId: "tab-bio" },
    ],
    [deathActorIds.length, bioActorIds.length]
  )

  // ── Submit both enrichments ───────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    setResults(null)

    const parsedDeathMaxTotalCost = parseFloat(deathMaxTotalCost)
    const parsedDeathConfidence = parseFloat(deathConfidence)
    const parsedDeathWikiMaxLinked = parseInt(deathWikiMaxLinked, 10)
    const parsedDeathWikiMaxSections = parseInt(deathWikiMaxSections, 10)
    const parsedBioMaxCostPerActor = parseFloat(bioMaxCostPerActor)
    const parsedBioMaxTotalCost = parseFloat(bioMaxTotalCost)

    const [deathResult, bioResult] = await Promise.allSettled([
      deathActorIds.length > 0
        ? startDeathEnrichment.mutateAsync({
            actorIds: deathActorIds,
            maxTotalCost: isNaN(parsedDeathMaxTotalCost)
              ? 10
              : Math.max(0.01, parsedDeathMaxTotalCost),
            maxCostPerActor:
              deathMaxCostPerActor != null && !isNaN(deathMaxCostPerActor)
                ? Math.max(0.01, deathMaxCostPerActor)
                : undefined,
            confidence: isNaN(parsedDeathConfidence)
              ? 0.5
              : Math.max(0, Math.min(1, parsedDeathConfidence)),
            free: deathFree,
            paid: deathPaid,
            ai: deathAi,
            gatherAllSources: deathGatherAllSources,
            claudeCleanup: deathClaudeCleanup,
            followLinks: deathFollowLinks,
            aiLinkSelection: deathAiLinkSelection,
            aiContentExtraction: deathAiContentExtraction,
            wikipedia: {
              useAISectionSelection: deathWikiAISection,
              followLinkedArticles: deathWikiFollowLinked,
              maxLinkedArticles: isNaN(parsedDeathWikiMaxLinked)
                ? 2
                : Math.max(1, Math.min(10, parsedDeathWikiMaxLinked)),
              maxSections: isNaN(parsedDeathWikiMaxSections)
                ? 10
                : Math.max(1, Math.min(20, parsedDeathWikiMaxSections)),
            },
          })
        : Promise.resolve(null),
      bioActorIds.length > 0
        ? startBioEnrichment.mutateAsync({
            actorIds: bioActorIds,
            confidenceThreshold: bioConfidence,
            maxCostPerActor: isNaN(parsedBioMaxCostPerActor)
              ? 0.5
              : Math.max(0.01, parsedBioMaxCostPerActor),
            maxTotalCost: isNaN(parsedBioMaxTotalCost) ? 25 : Math.max(0.01, parsedBioMaxTotalCost),
            allowRegeneration: bioAllowRegeneration,
            sourceCategories: {
              free: bioFree,
              reference: bioReference,
              books: bioBooks,
              webSearch: bioWebSearch,
              news: bioNews,
              obituary: bioObituary,
              archives: bioArchives,
            },
          })
        : Promise.resolve(null),
    ])

    const newResults: typeof results = {}

    if (deathActorIds.length > 0) {
      if (deathResult.status === "fulfilled" && deathResult.value) {
        newResults.death = { success: true, runId: deathResult.value.id }
      } else if (deathResult.status === "rejected") {
        newResults.death = {
          success: false,
          error: deathResult.reason instanceof Error ? deathResult.reason.message : "Failed",
        }
      }
    }

    if (bioActorIds.length > 0) {
      if (bioResult.status === "fulfilled" && bioResult.value) {
        newResults.bio = { success: true, runId: bioResult.value.runId }
      } else if (bioResult.status === "rejected") {
        newResults.bio = {
          success: false,
          error: bioResult.reason instanceof Error ? bioResult.reason.message : "Failed",
        }
      }
    }

    setResults(newResults)
    setSubmitting(false)
  }

  // If no actors passed via navigation state, show empty message
  if (preSelectedActorIds.length === 0) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Link
            to="/admin/actors"
            className="inline-block text-sm text-admin-text-muted hover:text-admin-text-primary"
          >
            &larr; Back to Actors
          </Link>
          <p className="text-admin-text-muted">
            No actors selected. Go back and select actors first.
          </p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/actors"
            className="mb-2 inline-block text-sm text-admin-text-muted hover:text-admin-text-primary"
          >
            &larr; Back to Actors
          </Link>
          <h1 className="text-xl font-bold text-admin-text-primary md:text-2xl">
            Combined Enrichment
          </h1>
          <p className="mt-1 text-admin-text-muted">
            Configure and start both death and biography enrichment for selected actors
          </p>
        </div>

        {/* Actor list with skip status */}
        {isLoading ? (
          <LoadingSpinner />
        ) : isError ? (
          <div className="rounded-lg border border-red-700 bg-red-900/20 p-4">
            <p className="text-sm text-red-300">
              Failed to load actor details:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : actors && actors.length > 0 ? (
          <>
            <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-admin-text-primary">
                  {actors.length} Actor{actors.length !== 1 ? "s" : ""} Selected
                </h2>
                <p className="text-sm text-admin-text-muted">
                  {deathSkipCount > 0 && <span>{deathSkipCount} skip death</span>}
                  {deathSkipCount > 0 && bioSkipCount > 0 && <span> · </span>}
                  {bioSkipCount > 0 && <span>{bioSkipCount} skip bio</span>}
                </p>
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm" data-testid="actor-list">
                {actors.map((actor) => (
                  <li
                    key={actor.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-admin-text-secondary hover:bg-admin-surface-base"
                  >
                    <span>
                      {actor.name}
                      {actor.popularity != null && (
                        <span className="ml-1 text-admin-text-muted">
                          (pop: {actor.popularity.toFixed(1)})
                        </span>
                      )}
                    </span>
                    <span className="flex gap-1.5">
                      {shouldSkipDeath(actor) && (
                        <span
                          className="rounded-full bg-green-900/30 px-2 py-0.5 text-xs text-green-400"
                          data-testid={`skip-death-${actor.id}`}
                        >
                          Death ✓
                        </span>
                      )}
                      {shouldSkipBio(actor, bioAllowRegeneration) && (
                        <span
                          className="rounded-full bg-green-900/30 px-2 py-0.5 text-xs text-green-400"
                          data-testid={`skip-bio-${actor.id}`}
                        >
                          Bio ✓
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tabbed options */}
            <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
              <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
                {activeTab === "death" ? (
                  <DeathOptionsForm
                    maxTotalCost={deathMaxTotalCost}
                    setMaxTotalCost={setDeathMaxTotalCost}
                    maxCostPerActor={deathMaxCostPerActor}
                    setMaxCostPerActor={setDeathMaxCostPerActor}
                    confidence={deathConfidence}
                    setConfidence={setDeathConfidence}
                    free={deathFree}
                    setFree={setDeathFree}
                    paid={deathPaid}
                    setPaid={setDeathPaid}
                    ai={deathAi}
                    setAi={setDeathAi}
                    gatherAllSources={deathGatherAllSources}
                    setGatherAllSources={setDeathGatherAllSources}
                    claudeCleanup={deathClaudeCleanup}
                    setClaudeCleanup={setDeathClaudeCleanup}
                    followLinks={deathFollowLinks}
                    setFollowLinks={setDeathFollowLinks}
                    aiLinkSelection={deathAiLinkSelection}
                    setAiLinkSelection={setDeathAiLinkSelection}
                    aiContentExtraction={deathAiContentExtraction}
                    setAiContentExtraction={setDeathAiContentExtraction}
                    wikiAISection={deathWikiAISection}
                    setWikiAISection={setDeathWikiAISection}
                    wikiFollowLinked={deathWikiFollowLinked}
                    setWikiFollowLinked={setDeathWikiFollowLinked}
                    wikiMaxLinked={deathWikiMaxLinked}
                    setWikiMaxLinked={setDeathWikiMaxLinked}
                    wikiMaxSections={deathWikiMaxSections}
                    setWikiMaxSections={setDeathWikiMaxSections}
                    actorCount={deathActorIds.length}
                    skipCount={deathSkipCount}
                  />
                ) : (
                  <BioOptionsForm
                    confidence={bioConfidence}
                    setConfidence={setBioConfidence}
                    maxCostPerActor={bioMaxCostPerActor}
                    setMaxCostPerActor={setBioMaxCostPerActor}
                    maxTotalCost={bioMaxTotalCost}
                    setMaxTotalCost={setBioMaxTotalCost}
                    free={bioFree}
                    setFree={setBioFree}
                    reference={bioReference}
                    setReference={setBioReference}
                    books={bioBooks}
                    setBooks={setBioBooks}
                    webSearch={bioWebSearch}
                    setWebSearch={setBioWebSearch}
                    news={bioNews}
                    setNews={setBioNews}
                    obituary={bioObituary}
                    setObituary={setBioObituary}
                    archives={bioArchives}
                    setArchives={setBioArchives}
                    allowRegeneration={bioAllowRegeneration}
                    setAllowRegeneration={setBioAllowRegeneration}
                    actorCount={bioActorIds.length}
                    skipCount={bioSkipCount}
                  />
                )}
              </AdminTabs>
            </div>

            {/* Results */}
            {results && (
              <div
                className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
                data-testid="enrichment-results"
              >
                <h2 className="mb-3 text-lg font-semibold text-admin-text-primary">Results</h2>
                <div className="space-y-2">
                  {results.death && (
                    <div
                      className={`rounded p-3 ${results.death.success ? "bg-green-900/20" : "bg-red-900/20"}`}
                    >
                      {results.death.success ? (
                        <p className="text-sm text-green-300">
                          Death enrichment started.{" "}
                          <Link
                            to={`/admin/enrichment/runs/${results.death.runId}`}
                            className="underline hover:text-green-200"
                          >
                            View run #{results.death.runId}
                          </Link>
                        </p>
                      ) : (
                        <p className="text-sm text-red-300">
                          Death enrichment failed: {results.death.error}
                        </p>
                      )}
                    </div>
                  )}
                  {results.bio && (
                    <div
                      className={`rounded p-3 ${results.bio.success ? "bg-green-900/20" : "bg-red-900/20"}`}
                    >
                      {results.bio.success ? (
                        <p className="text-sm text-green-300">
                          Bio enrichment started.{" "}
                          <Link
                            to={`/admin/bio-enrichment/runs/${results.bio.runId}`}
                            className="underline hover:text-green-200"
                          >
                            View run #{results.bio.runId}
                          </Link>
                        </p>
                      ) : (
                        <p className="text-sm text-red-300">
                          Bio enrichment failed: {results.bio.error}
                        </p>
                      )}
                    </div>
                  )}
                  {deathActorIds.length === 0 && (
                    <p className="text-sm text-admin-text-muted">
                      Death enrichment skipped — all actors already enriched.
                    </p>
                  )}
                  {bioActorIds.length === 0 && (
                    <p className="text-sm text-admin-text-muted">
                      Bio enrichment skipped — all actors already have biographies.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || (deathActorIds.length === 0 && bioActorIds.length === 0)}
                data-testid="submit-both"
                className="rounded-lg bg-admin-danger px-6 py-3 font-semibold text-admin-text-primary transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Starting..." : "Start Both Enrichments"}
              </button>
              <Link
                to="/admin/actors"
                className="rounded-md border border-admin-border bg-admin-surface-overlay px-6 py-2 text-sm font-semibold text-admin-text-primary shadow-sm hover:bg-admin-interactive-secondary"
              >
                Cancel
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Death Options Form (tab content)
// ════════════════════════════════════════════════════════════════════════════

interface DeathOptionsProps {
  maxTotalCost: string
  setMaxTotalCost: (v: string) => void
  maxCostPerActor: number | undefined
  setMaxCostPerActor: (v: number | undefined) => void
  confidence: string
  setConfidence: (v: string) => void
  free: boolean
  setFree: (v: boolean) => void
  paid: boolean
  setPaid: (v: boolean) => void
  ai: boolean
  setAi: (v: boolean) => void
  gatherAllSources: boolean
  setGatherAllSources: (v: boolean) => void
  claudeCleanup: boolean
  setClaudeCleanup: (v: boolean) => void
  followLinks: boolean
  setFollowLinks: (v: boolean) => void
  aiLinkSelection: boolean
  setAiLinkSelection: (v: boolean) => void
  aiContentExtraction: boolean
  setAiContentExtraction: (v: boolean) => void
  wikiAISection: boolean
  setWikiAISection: (v: boolean) => void
  wikiFollowLinked: boolean
  setWikiFollowLinked: (v: boolean) => void
  wikiMaxLinked: string
  setWikiMaxLinked: (v: string) => void
  wikiMaxSections: string
  setWikiMaxSections: (v: string) => void
  actorCount: number
  skipCount: number
}

function DeathOptionsForm(props: DeathOptionsProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      {props.actorCount === 0 ? (
        <p className="text-sm text-yellow-400">
          All {props.skipCount} actors already have death enrichment (v4.0.0). This step will be
          skipped.
        </p>
      ) : (
        <p className="text-sm text-admin-text-muted">
          {props.actorCount} actor{props.actorCount !== 1 ? "s" : ""} will be death-enriched
          {props.skipCount > 0 && ` (${props.skipCount} skipped)`}.
        </p>
      )}

      {/* Source Selection */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-admin-text-primary">Source Selection</h3>
        <div className="space-y-3">
          {[
            {
              id: "d-free",
              label: "Use free sources",
              checked: props.free,
              onChange: props.setFree,
            },
            {
              id: "d-paid",
              label: "Use paid sources",
              checked: props.paid,
              onChange: props.setPaid,
            },
            { id: "d-ai", label: "Use AI sources", checked: props.ai, onChange: props.setAi },
            {
              id: "d-gather",
              label: "Gather data from all sources",
              checked: props.gatherAllSources,
              onChange: props.setGatherAllSources,
            },
          ].map(({ id, label, checked, onChange }) => (
            <label key={id} className="flex items-center">
              <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              />
              <span className="ml-2 text-sm text-admin-text-secondary">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Advanced Options */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-admin-text-primary">Advanced Options</h3>
        <div className="space-y-3">
          {[
            {
              id: "d-claude",
              label: "Use Claude for data cleanup",
              checked: props.claudeCleanup,
              onChange: props.setClaudeCleanup,
            },
            {
              id: "d-links",
              label: "Follow external links",
              checked: props.followLinks,
              onChange: props.setFollowLinks,
            },
            {
              id: "d-ai-link",
              label: "Use AI for link selection",
              checked: props.aiLinkSelection,
              onChange: props.setAiLinkSelection,
            },
            {
              id: "d-ai-content",
              label: "Use AI for content extraction",
              checked: props.aiContentExtraction,
              onChange: props.setAiContentExtraction,
            },
          ].map(({ id, label, checked, onChange }) => (
            <label key={id} className="flex items-center">
              <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              />
              <span className="ml-2 text-sm text-admin-text-secondary">{label}</span>
            </label>
          ))}
        </div>

        {/* Wikipedia options */}
        <div className="mt-4 border-t border-admin-border pt-4">
          <h4 className="mb-3 text-sm font-semibold text-admin-text-primary">Wikipedia Options</h4>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={props.wikiAISection}
                onChange={(e) => props.setWikiAISection(e.target.checked)}
                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              />
              <span className="ml-2 text-sm text-admin-text-secondary">
                Use AI for section selection
                <span className="ml-1 text-admin-text-muted">(Gemini Flash)</span>
              </span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={props.wikiFollowLinked}
                onChange={(e) => props.setWikiFollowLinked(e.target.checked)}
                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              />
              <span className="ml-2 text-sm text-admin-text-secondary">
                Follow linked Wikipedia articles
              </span>
            </label>

            {props.wikiFollowLinked && (
              <div className="ml-6">
                <label
                  htmlFor="d-wiki-max-linked"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max linked articles
                  <span className="ml-1 text-admin-text-muted">(1-10)</span>
                </label>
                <input
                  id="d-wiki-max-linked"
                  type="number"
                  min="1"
                  max="10"
                  value={props.wikiMaxLinked}
                  onChange={(e) => props.setWikiMaxLinked(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(props.wikiMaxLinked, 10)
                    props.setWikiMaxLinked(String(isNaN(n) ? 2 : Math.max(1, Math.min(10, n))))
                  }}
                  className="mt-1 block w-32 rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="d-wiki-max-sections"
                className="block text-sm font-medium text-admin-text-secondary"
              >
                Max sections to fetch
                <span className="ml-1 text-admin-text-muted">(1-20)</span>
              </label>
              <input
                id="d-wiki-max-sections"
                type="number"
                min="1"
                max="20"
                value={props.wikiMaxSections}
                onChange={(e) => props.setWikiMaxSections(e.target.value)}
                onBlur={() => {
                  const n = parseInt(props.wikiMaxSections, 10)
                  props.setWikiMaxSections(String(isNaN(n) ? 10 : Math.max(1, Math.min(20, n))))
                }}
                className="mt-1 block w-32 rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cost & Quality */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-admin-text-primary">Cost & Quality</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="d-max-total"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Max Total Cost ($)
            </label>
            <input
              id="d-max-total"
              type="number"
              min="0.01"
              step="0.01"
              value={props.maxTotalCost}
              onChange={(e) => props.setMaxTotalCost(e.target.value)}
              onBlur={() => {
                const n = parseFloat(props.maxTotalCost)
                props.setMaxTotalCost(isNaN(n) || n < 0.01 ? "10" : String(n))
              }}
              className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
            />
          </div>
          <div>
            <label
              htmlFor="d-max-per"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Max Per Actor ($)
              <span className="ml-1 text-admin-text-muted">(optional)</span>
            </label>
            <input
              id="d-max-per"
              type="number"
              min="0.01"
              step="0.01"
              value={props.maxCostPerActor || ""}
              onChange={(e) =>
                props.setMaxCostPerActor(e.target.value ? parseFloat(e.target.value) : undefined)
              }
              placeholder="Unlimited"
              className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
            />
          </div>
          <div>
            <label
              htmlFor="d-confidence"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Confidence (0-1)
            </label>
            <input
              id="d-confidence"
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={props.confidence}
              onChange={(e) => props.setConfidence(e.target.value)}
              onBlur={() => {
                const n = parseFloat(props.confidence)
                props.setConfidence(String(isNaN(n) ? 0.5 : Math.max(0, Math.min(1, n))))
              }}
              className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Bio Options Form (tab content)
// ════════════════════════════════════════════════════════════════════════════

interface BioOptionsProps {
  confidence: number
  setConfidence: (v: number) => void
  maxCostPerActor: string
  setMaxCostPerActor: (v: string) => void
  maxTotalCost: string
  setMaxTotalCost: (v: string) => void
  free: boolean
  setFree: (v: boolean) => void
  reference: boolean
  setReference: (v: boolean) => void
  books: boolean
  setBooks: (v: boolean) => void
  webSearch: boolean
  setWebSearch: (v: boolean) => void
  news: boolean
  setNews: (v: boolean) => void
  obituary: boolean
  setObituary: (v: boolean) => void
  archives: boolean
  setArchives: (v: boolean) => void
  allowRegeneration: boolean
  setAllowRegeneration: (v: boolean) => void
  actorCount: number
  skipCount: number
}

function BioOptionsForm(props: BioOptionsProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      {props.actorCount === 0 ? (
        <p className="text-sm text-yellow-400">
          All {props.skipCount} actors already have biographies. This step will be skipped.
        </p>
      ) : (
        <p className="text-sm text-admin-text-muted">
          {props.actorCount} actor{props.actorCount !== 1 ? "s" : ""} will be bio-enriched
          {props.skipCount > 0 && ` (${props.skipCount} skipped)`}.
        </p>
      )}

      {/* Source Categories */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-admin-text-primary">Source Categories</h3>
        <p className="mb-3 text-xs text-admin-text-muted">
          Control which types of data sources are used. Disabling categories reduces cost but may
          lower quality.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            { label: "Free (Wikidata, Wikipedia)", checked: props.free, onChange: props.setFree },
            {
              label: "Reference (Britannica, Bio.com)",
              checked: props.reference,
              onChange: props.setReference,
            },
            {
              label: "Books (Google Books, Open Library)",
              checked: props.books,
              onChange: props.setBooks,
            },
            {
              label: "Web Search (Google, Bing, etc.)",
              checked: props.webSearch,
              onChange: props.setWebSearch,
            },
            { label: "News (Guardian, NYT, etc.)", checked: props.news, onChange: props.setNews },
            {
              label: "Obituary (Legacy, FindAGrave)",
              checked: props.obituary,
              onChange: props.setObituary,
            },
            {
              label: "Archives (Internet Archive, etc.)",
              checked: props.archives,
              onChange: props.setArchives,
            },
          ].map(({ label, checked, onChange }) => (
            <label key={label} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              />
              <span className="text-sm text-admin-text-secondary">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Quality & Cost */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-admin-text-primary">Quality & Cost</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="b-confidence"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Confidence Threshold
              <span className="ml-1 text-admin-text-muted">({props.confidence})</span>
            </label>
            <input
              id="b-confidence"
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={props.confidence}
              onChange={(e) => props.setConfidence(parseFloat(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-admin-text-muted">
              <span>Low (0.1)</span>
              <span>High (1.0)</span>
            </div>
          </div>
          <div>
            <label
              htmlFor="b-max-per"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Max Per Actor ($)
            </label>
            <input
              id="b-max-per"
              type="number"
              min="0.01"
              step="0.01"
              value={props.maxCostPerActor}
              onChange={(e) => props.setMaxCostPerActor(e.target.value)}
              onBlur={() => {
                const n = parseFloat(props.maxCostPerActor)
                props.setMaxCostPerActor(isNaN(n) || n < 0.01 ? "0.50" : String(n))
              }}
              className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
            />
          </div>
          <div>
            <label
              htmlFor="b-max-total"
              className="block text-sm font-medium text-admin-text-secondary"
            >
              Max Total Cost ($)
            </label>
            <input
              id="b-max-total"
              type="number"
              min="0.01"
              step="0.01"
              value={props.maxTotalCost}
              onChange={(e) => props.setMaxTotalCost(e.target.value)}
              onBlur={() => {
                const n = parseFloat(props.maxTotalCost)
                props.setMaxTotalCost(isNaN(n) || n < 0.01 ? "25" : String(n))
              }}
              className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.allowRegeneration}
              onChange={(e) => props.setAllowRegeneration(e.target.checked)}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
            />
            <span className="text-sm text-admin-text-secondary">
              Allow Regeneration
              <span className="ml-1 text-admin-text-muted">
                (re-enrich actors that already have biographies)
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
