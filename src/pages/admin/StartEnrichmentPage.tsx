/**
 * Admin page for starting a new enrichment run.
 */

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { useStartEnrichmentRun } from "../../hooks/admin/useEnrichmentRuns"

export default function StartEnrichmentPage() {
  const navigate = useNavigate()
  const startEnrichment = useStartEnrichmentRun()

  const [limit, setLimit] = useState<number>(100)
  const [maxTotalCost, setMaxTotalCost] = useState<number>(10)
  const [maxCostPerActor, setMaxCostPerActor] = useState<number | undefined>(undefined)
  const [minPopularity, setMinPopularity] = useState<number>(0)
  const [confidence, setConfidence] = useState<number>(0.5)
  const [recentOnly, setRecentOnly] = useState<boolean>(false)
  const [usActorsOnly, setUsActorsOnly] = useState<boolean>(false)

  // Source selection flags
  const [free, setFree] = useState<boolean>(false)
  const [paid, setPaid] = useState<boolean>(false)
  const [ai, setAi] = useState<boolean>(false)
  const [stopOnMatch, setStopOnMatch] = useState<boolean>(false)
  const [gatherAllSources, setGatherAllSources] = useState<boolean>(false)

  // Advanced options
  const [claudeCleanup, setClaudeCleanup] = useState<boolean>(false)
  const [followLinks, setFollowLinks] = useState<boolean>(false)
  const [aiLinkSelection, setAiLinkSelection] = useState<boolean>(false)
  const [aiContentExtraction, setAiContentExtraction] = useState<boolean>(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const result = await startEnrichment.mutateAsync({
        limit,
        maxTotalCost,
        maxCostPerActor,
        minPopularity,
        confidence,
        recentOnly,
        usActorsOnly,
        free,
        paid,
        ai,
        stopOnMatch,
        gatherAllSources,
        claudeCleanup,
        followLinks,
        aiLinkSelection,
        aiContentExtraction,
      })

      // Navigate to the run details page
      navigate(`/admin/enrichment/runs/${result.id}`)
    } catch (error) {
      console.error("Failed to start enrichment:", error)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/enrichment/runs"
            className="mb-2 inline-block text-sm text-admin-text-muted hover:text-admin-text-primary"
          >
            &larr; Back to Runs
          </Link>
          <h1 className="text-xl font-bold text-admin-text-primary md:text-2xl">
            Start Enrichment Run
          </h1>
          <p className="mt-1 text-admin-text-muted">
            Configure and start a new death information enrichment run
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Actor Limits */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Actor Selection</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="limit"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Number of Actors
                  <span className="ml-1 text-admin-text-muted">(1-1000)</span>
                </label>
                <input
                  id="limit"
                  type="number"
                  min="1"
                  max="1000"
                  value={limit}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    setLimit(isNaN(value) ? 1 : value)
                  }}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  required
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Maximum number of actors to process in this run
                </p>
              </div>

              <div>
                <label
                  htmlFor="minPopularity"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Minimum Popularity
                  <span className="ml-1 text-admin-text-muted">(0-100)</span>
                </label>
                <input
                  id="minPopularity"
                  type="number"
                  min="0"
                  max="100"
                  value={minPopularity}
                  onChange={(e) => {
                    const rawValue = e.target.value
                    if (rawValue === "") {
                      setMinPopularity(0)
                      return
                    }
                    const parsed = parseInt(rawValue, 10)
                    setMinPopularity(Number.isNaN(parsed) ? 0 : parsed)
                  }}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Only process actors with popularity score above this threshold
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="recentOnly"
                  checked={recentOnly}
                  onChange={(e) => setRecentOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="recentOnly"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Recent deaths only (last 2 years)
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="usActorsOnly"
                  checked={usActorsOnly}
                  onChange={(e) => setUsActorsOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="usActorsOnly"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  US actors only
                </label>
              </div>
            </div>
          </div>

          {/* Source Selection */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Source Selection</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="free"
                  checked={free}
                  onChange={(e) => setFree(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="free" className="ml-2 block text-sm text-admin-text-secondary">
                  Use free sources only
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="paid"
                  checked={paid}
                  onChange={(e) => setPaid(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="paid" className="ml-2 block text-sm text-admin-text-secondary">
                  Use paid sources
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ai"
                  checked={ai}
                  onChange={(e) => setAi(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label htmlFor="ai" className="ml-2 block text-sm text-admin-text-secondary">
                  Use AI sources
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="stopOnMatch"
                  checked={stopOnMatch}
                  onChange={(e) => setStopOnMatch(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="stopOnMatch"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Stop on first match
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="gatherAllSources"
                  checked={gatherAllSources}
                  onChange={(e) => setGatherAllSources(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="gatherAllSources"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Gather data from all sources
                </label>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Advanced Options</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="claudeCleanup"
                  checked={claudeCleanup}
                  onChange={(e) => setClaudeCleanup(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="claudeCleanup"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Use Claude for data cleanup
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="followLinks"
                  checked={followLinks}
                  onChange={(e) => setFollowLinks(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="followLinks"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Follow external links
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="aiLinkSelection"
                  checked={aiLinkSelection}
                  onChange={(e) => setAiLinkSelection(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="aiLinkSelection"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Use AI for link selection
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="aiContentExtraction"
                  checked={aiContentExtraction}
                  onChange={(e) => setAiContentExtraction(e.target.checked)}
                  className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                />
                <label
                  htmlFor="aiContentExtraction"
                  className="ml-2 block text-sm text-admin-text-secondary"
                >
                  Use AI for content extraction
                </label>
              </div>
            </div>
          </div>

          {/* Cost Limits */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Cost Limits</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="maxTotalCost"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max Total Cost (USD)
                </label>
                <input
                  id="maxTotalCost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxTotalCost}
                  onChange={(e) => {
                    const value = e.target.value
                    const parsed = parseFloat(value)
                    setMaxTotalCost((prev) =>
                      value === "" || Number.isNaN(parsed) ? prev : parsed
                    )
                  }}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  required
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Maximum total cost for the entire enrichment run
                </p>
              </div>

              <div>
                <label
                  htmlFor="maxCostPerActor"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Max Cost Per Actor (USD)
                  <span className="ml-1 text-admin-text-muted">(optional)</span>
                </label>
                <input
                  id="maxCostPerActor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxCostPerActor || ""}
                  onChange={(e) =>
                    setMaxCostPerActor(e.target.value ? parseFloat(e.target.value) : undefined)
                  }
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                  placeholder="Unlimited"
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Maximum cost per individual actor (leave empty for no limit)
                </p>
              </div>
            </div>
          </div>

          {/* Quality Settings */}
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Quality Settings</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="confidence"
                  className="block text-sm font-medium text-admin-text-secondary"
                >
                  Confidence Threshold
                  <span className="ml-1 text-admin-text-muted">(0.0-1.0)</span>
                </label>
                <input
                  id="confidence"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={confidence}
                  onChange={(e) => {
                    const rawValue = e.target.value
                    const parsed = parseFloat(rawValue)
                    if (Number.isNaN(parsed)) {
                      // Fallback to default confidence if input is empty or invalid
                      setConfidence(0.5)
                    } else {
                      // Clamp to allowed range just in case
                      const clamped = Math.min(1, Math.max(0, parsed))
                      setConfidence(clamped)
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-admin-border bg-admin-surface-overlay px-3 py-2 text-admin-text-primary shadow-sm focus:border-admin-interactive focus:outline-none focus:ring-1 focus:ring-admin-interactive"
                />
                <p className="mt-1 text-sm text-admin-text-muted">
                  Minimum confidence score required to accept enrichment results
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={startEnrichment.isPending}
              className="rounded-md bg-admin-interactive px-6 py-2 text-sm font-semibold text-admin-text-primary shadow-sm hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startEnrichment.isPending ? "Starting..." : "Start Enrichment Run"}
            </button>
            <Link
              to="/admin/enrichment/runs"
              className="rounded-md border border-admin-border bg-admin-surface-overlay px-6 py-2 text-sm font-semibold text-admin-text-primary shadow-sm hover:bg-admin-interactive-secondary"
            >
              Cancel
            </Link>
          </div>

          {/* Error Display */}
          {startEnrichment.isError && (
            <div className="rounded-md border border-red-700 bg-red-900 p-4 shadow-admin-sm">
              <p className="text-sm text-red-200">
                {startEnrichment.error instanceof Error
                  ? startEnrichment.error.message
                  : "Failed to start enrichment run"}
              </p>
            </div>
          )}
        </form>

        {/* CLI Reference */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">CLI Reference</h2>
          <p className="mb-4 text-admin-text-secondary">
            Equivalent CLI command for this configuration:
          </p>
          <div className="overflow-x-auto rounded bg-admin-surface-base p-4 font-mono text-sm text-admin-text-secondary">
            cd server && npm run enrich:death-details -- --limit {limit} --max-total-cost{" "}
            {maxTotalCost}
            {maxCostPerActor ? ` --max-cost-per-actor ${maxCostPerActor}` : ""}
            {minPopularity > 0 ? ` --min-popularity ${minPopularity}` : ""}
            {recentOnly ? " --recent-only" : ""}
            {usActorsOnly ? " --us-actors-only" : ""}
            {free ? " --free" : ""}
            {paid ? " --paid" : ""}
            {ai ? " --ai" : ""}
            {stopOnMatch ? " --stop-on-match" : ""}
            {gatherAllSources ? " --gather-all-sources" : ""}
            {claudeCleanup ? " --claude-cleanup" : ""}
            {followLinks ? " --follow-links" : ""}
            {aiLinkSelection ? " --ai-link-selection" : ""}
            {aiContentExtraction ? " --ai-content-extraction" : ""}
            {confidence !== 0.5 ? ` --confidence ${confidence}` : ""}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
