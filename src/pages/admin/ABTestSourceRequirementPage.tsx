import { useState } from "react"
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useABTestResults } from "../../hooks/admin/useABTests"

export default function ABTestSourceRequirementPage() {
  const { data, isLoading, error } = useABTestResults()
  const [expandedActorId, setExpandedActorId] = useState<number | null>(null)

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="py-12 text-center text-admin-danger">
          {error instanceof Error ? error.message : "Failed to load A/B test results"}
        </div>
      </AdminLayout>
    )
  }

  if (!data || data.comparisons.length === 0) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              A/B Test: Source Requirement
            </h1>
            <p className="mt-2 text-admin-text-muted">
              No A/B tests have been run yet. Run{" "}
              <code className="rounded bg-admin-surface-elevated px-2 py-1">
                npm run ab-test:sources
              </code>{" "}
              from the server directory to start testing.
            </p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const { summary, comparisons } = data

  const toggleExpand = (actorId: number) => {
    setExpandedActorId(expandedActorId === actorId ? null : actorId)
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            A/B Test: Source Requirement
          </h1>
          <p className="mt-2 text-admin-text-muted">
            Comparing AI enrichment results with and without the source URL requirement
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-5">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              {summary.totalTests}
            </div>
            <div className="text-sm text-admin-text-muted">Total Tests</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-success md:text-3xl">
              {summary.completeTests}
            </div>
            <div className="text-sm text-admin-text-muted">Complete</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-interactive md:text-3xl">
              ${summary.totalCost}
            </div>
            <div className="text-sm text-admin-text-muted">Total Cost</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-warning md:text-3xl">
              {summary.withSourcesFoundData}
            </div>
            <div className="text-sm text-admin-text-muted">With Sources</div>
            <div className="mt-1 text-xs text-admin-text-muted">Found data</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-orange-500 md:text-3xl">
              {summary.withoutSourcesFoundData}
            </div>
            <div className="text-sm text-admin-text-muted">Without Sources</div>
            <div className="mt-1 text-xs text-admin-text-muted">Found data</div>
          </div>
        </div>

        {/* Data Loss Analysis */}
        <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Data Loss Analysis</h2>
          <div className="text-admin-text-secondary">
            <p>
              Requiring sources resulted in{" "}
              <span className="font-bold text-admin-danger">{summary.dataLossPercentage}%</span>{" "}
              data loss
            </p>
            <p className="mt-2 text-sm text-admin-text-muted">
              {summary.withoutSourcesFoundData - summary.withSourcesFoundData} fewer actors had
              death information when sources were required
            </p>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="rounded-lg bg-admin-surface-elevated shadow-admin-sm">
          <div className="border-b border-admin-border px-4 py-4 md:px-6">
            <h2 className="text-xl font-semibold text-admin-text-primary">Test Results</h2>
          </div>
          <div className="divide-y divide-admin-border">
            {comparisons.map((comparison) => {
              const isExpanded = expandedActorId === comparison.actorId
              const hasWithSources = !!comparison.withSources?.circumstances
              const hasWithoutSources = !!comparison.withoutSources?.circumstances

              return (
                <div key={comparison.actorId} className="px-4 py-4 md:px-6">
                  <div
                    className="flex cursor-pointer items-center justify-between hover:bg-admin-interactive-secondary"
                    onClick={() => toggleExpand(comparison.actorId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toggleExpand(comparison.actorId)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <h3 className="text-lg font-medium text-admin-text-primary">
                        {comparison.actorName}
                      </h3>
                      <p className="text-sm text-admin-text-muted">
                        Actor ID: {comparison.actorId} • Tested:{" "}
                        {new Date(comparison.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm text-admin-text-muted">With Sources</div>
                        <div
                          className={`font-medium ${hasWithSources ? "text-admin-success" : "text-admin-danger"}`}
                        >
                          {hasWithSources ? "✓ Found" : "✗ No Data"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-admin-text-muted">Without Sources</div>
                        <div
                          className={`font-medium ${hasWithoutSources ? "text-admin-success" : "text-admin-danger"}`}
                        >
                          {hasWithoutSources ? "✓ Found" : "✗ No Data"}
                        </div>
                      </div>
                      <svg
                        className={`h-5 w-5 text-admin-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-6">
                      {/* Diff View for Circumstances */}
                      {hasWithSources && hasWithoutSources && (
                        <div className="rounded-lg bg-admin-surface-base p-4">
                          <h4 className="mb-3 font-semibold text-admin-text-primary">
                            Circumstances Comparison
                          </h4>
                          <ReactDiffViewer
                            oldValue={comparison.withSources?.circumstances || ""}
                            newValue={comparison.withoutSources?.circumstances || ""}
                            splitView={true}
                            compareMethod={DiffMethod.WORDS}
                            leftTitle="With Sources Required"
                            rightTitle="Without Sources Required"
                            styles={{
                              variables: {
                                dark: {
                                  diffViewerBackground: "#1f2937",
                                  diffViewerColor: "#e5e7eb",
                                  addedBackground: "#065f46",
                                  addedColor: "#d1fae5",
                                  removedBackground: "#7f1d1d",
                                  removedColor: "#fecaca",
                                  wordAddedBackground: "#047857",
                                  wordRemovedBackground: "#991b1b",
                                  addedGutterBackground: "#064e3b",
                                  removedGutterBackground: "#7c2d12",
                                  gutterBackground: "#374151",
                                  gutterBackgroundDark: "#1f2937",
                                  highlightBackground: "#4b5563",
                                  highlightGutterBackground: "#6b7280",
                                },
                              },
                            }}
                            useDarkTheme={true}
                          />
                        </div>
                      )}

                      {/* Side-by-side comparison for when only one has data */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
                        {/* With Sources Column */}
                        <div className="rounded-lg bg-admin-surface-base p-4">
                          <h4 className="mb-3 font-semibold text-admin-success">
                            With Sources Required
                          </h4>
                          {comparison.withSources?.circumstances ? (
                            <>
                              {!hasWithoutSources && (
                                <div className="mb-4">
                                  <div className="text-sm font-medium text-admin-text-secondary">
                                    Circumstances:
                                  </div>
                                  <div className="mt-1 text-sm text-admin-text-muted">
                                    {comparison.withSources.circumstances}
                                  </div>
                                </div>
                              )}
                              {comparison.withSources.rumoredCircumstances && (
                                <div className="mb-4">
                                  <div className="text-sm font-medium text-admin-text-secondary">
                                    Rumored Circumstances:
                                  </div>
                                  <div className="mt-1 text-sm text-admin-text-muted">
                                    {comparison.withSources.rumoredCircumstances}
                                  </div>
                                </div>
                              )}
                              <div className="mb-4">
                                <div className="text-sm font-medium text-admin-text-secondary">
                                  Sources ({comparison.withSources.sources.length}):
                                </div>
                                <div className="mt-1 space-y-1">
                                  {comparison.withSources.sources.map((source, idx) => (
                                    <div
                                      key={idx}
                                      className="break-all text-xs text-admin-interactive"
                                    >
                                      {source}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {comparison.withSources.resolvedSources &&
                                comparison.withSources.resolvedSources.length > 0 && (
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-admin-text-secondary">
                                      Resolved Sources:
                                    </div>
                                    <div className="mt-1 space-y-1">
                                      {comparison.withSources.resolvedSources.map(
                                        (resolved, idx) => (
                                          <div key={idx} className="text-xs text-admin-text-muted">
                                            {resolved.sourceName}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              <div className="text-xs text-admin-text-muted">
                                Cost: ${comparison.withSources.costUsd.toFixed(4)}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-admin-danger">
                              No death information found
                            </div>
                          )}
                        </div>

                        {/* Without Sources Column */}
                        <div className="rounded-lg bg-admin-surface-base p-4">
                          <h4 className="mb-3 font-semibold text-orange-400">
                            Without Sources Required
                          </h4>
                          {comparison.withoutSources?.circumstances ? (
                            <>
                              {!hasWithSources && (
                                <div className="mb-4">
                                  <div className="text-sm font-medium text-admin-text-secondary">
                                    Circumstances:
                                  </div>
                                  <div className="mt-1 text-sm text-admin-text-muted">
                                    {comparison.withoutSources.circumstances}
                                  </div>
                                </div>
                              )}
                              {comparison.withoutSources.rumoredCircumstances && (
                                <div className="mb-4">
                                  <div className="text-sm font-medium text-admin-text-secondary">
                                    Rumored Circumstances:
                                  </div>
                                  <div className="mt-1 text-sm text-admin-text-muted">
                                    {comparison.withoutSources.rumoredCircumstances}
                                  </div>
                                </div>
                              )}
                              <div className="mb-4">
                                <div className="text-sm font-medium text-admin-text-secondary">
                                  Sources ({comparison.withoutSources.sources.length}):
                                </div>
                                <div className="mt-1 space-y-1">
                                  {comparison.withoutSources.sources.map((source, idx) => (
                                    <div
                                      key={idx}
                                      className="break-all text-xs text-admin-interactive"
                                    >
                                      {source}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {comparison.withoutSources.resolvedSources &&
                                comparison.withoutSources.resolvedSources.length > 0 && (
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-admin-text-secondary">
                                      Resolved Sources:
                                    </div>
                                    <div className="mt-1 space-y-1">
                                      {comparison.withoutSources.resolvedSources.map(
                                        (resolved, idx) => (
                                          <div key={idx} className="text-xs text-admin-text-muted">
                                            {resolved.sourceName}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              <div className="text-xs text-admin-text-muted">
                                Cost: ${comparison.withoutSources.costUsd.toFixed(4)}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-admin-danger">
                              No death information found
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
