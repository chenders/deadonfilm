import { useState } from "react"
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useABTestProviderComparison } from "../../hooks/admin/useABTestProviderComparison"

export default function ABTestProviderComparisonPage() {
  const { data, isLoading, error } = useABTestProviderComparison()
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
              A/B Test: Provider Comparison
            </h1>
            <p className="mt-2 text-admin-text-muted">
              No A/B tests have been run yet. Run{" "}
              <code className="rounded bg-admin-surface-elevated px-2 py-1">
                npm run ab-test:comprehensive
              </code>{" "}
              from the server directory to start testing.
            </p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const { summary, comparisons } = data
  const providers = Object.keys(summary.providerStats)

  const toggleExpand = (actorId: number) => {
    setExpandedActorId(expandedActorId === actorId ? null : actorId)
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            A/B Test: Provider Comparison
          </h1>
          <p className="mt-2 text-admin-text-muted">
            Comparing death enrichment quality across different AI providers
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              {summary.totalTests}
            </div>
            <div className="text-sm text-admin-text-muted">Total Tests</div>
          </div>

          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-interactive md:text-3xl">
              ${summary.totalCost}
            </div>
            <div className="text-sm text-admin-text-muted">Total Cost</div>
          </div>

          {providers.map((provider, idx) => {
            const stats = summary.providerStats[provider]
            const colors = [
              "text-admin-success",
              "text-orange-500",
              "text-purple-500",
              "text-pink-500",
            ]
            const color = colors[idx % colors.length]

            return (
              <div
                key={provider}
                className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
              >
                <div className={`text-2xl font-bold md:text-3xl ${color}`}>{stats.foundData}</div>
                <div className="text-sm text-admin-text-muted">{provider}</div>
                <div className="mt-1 text-xs text-admin-text-muted">
                  ${stats.totalCost.toFixed(4)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Provider Comparison Summary */}
        <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">
            Provider Performance
          </h2>
          <div className="space-y-4">
            {providers.map((provider) => {
              const stats = summary.providerStats[provider]
              const successRate = ((stats.foundData / stats.totalTests) * 100).toFixed(0)
              const avgCost = (stats.totalCost / stats.totalTests).toFixed(4)

              return (
                <div key={provider} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-admin-text-primary">{provider}</div>
                    <div className="text-sm text-admin-text-muted">
                      {stats.foundData}/{stats.totalTests} successful ({successRate}%)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-admin-text-secondary">
                      ${avgCost} per test
                    </div>
                    <div className="text-xs text-admin-text-muted">
                      Total: ${stats.totalCost.toFixed(4)}
                    </div>
                  </div>
                </div>
              )
            })}
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
              const providerKeys = Object.keys(comparison.providers)

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
                      {providerKeys.map((provider) => {
                        const hasData = !!comparison.providers[provider].circumstances
                        return (
                          <div key={provider} className="text-right">
                            <div className="text-sm text-admin-text-muted">{provider}</div>
                            <div
                              className={`font-medium ${hasData ? "text-admin-success" : "text-admin-danger"}`}
                            >
                              {hasData ? "✓ Found" : "✗ No Data"}
                            </div>
                          </div>
                        )
                      })}
                      <svg
                        className={`h-5 w-5 flex-shrink-0 text-admin-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
                      {/* Diff View if we have exactly 2 providers with data */}
                      {providerKeys.length === 2 &&
                        comparison.providers[providerKeys[0]].circumstances &&
                        comparison.providers[providerKeys[1]].circumstances && (
                          <div className="rounded-lg bg-admin-surface-base p-4">
                            <h4 className="mb-3 font-semibold text-admin-text-primary">
                              Circumstances Comparison
                            </h4>
                            <ReactDiffViewer
                              oldValue={comparison.providers[providerKeys[0]].circumstances || ""}
                              newValue={comparison.providers[providerKeys[1]].circumstances || ""}
                              splitView={true}
                              compareMethod={DiffMethod.WORDS}
                              leftTitle={providerKeys[0]}
                              rightTitle={providerKeys[1]}
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

                      {/* Side-by-side comparison for all providers */}
                      <div
                        className="grid gap-4 md:gap-6"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(providerKeys.length, 3)}, minmax(0, 1fr))`,
                        }}
                      >
                        {providerKeys.map((provider) => {
                          const providerData = comparison.providers[provider]
                          const colors = [
                            "text-admin-success",
                            "text-orange-400",
                            "text-purple-400",
                            "text-pink-400",
                          ]
                          const color = colors[providerKeys.indexOf(provider) % colors.length]

                          return (
                            <div key={provider} className="rounded-lg bg-admin-surface-base p-4">
                              <h4 className={`mb-3 font-semibold ${color}`}>{provider}</h4>
                              {providerData.circumstances ? (
                                <>
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-admin-text-secondary">
                                      Circumstances:
                                    </div>
                                    <div className="mt-1 text-sm text-admin-text-muted">
                                      {providerData.circumstances}
                                    </div>
                                  </div>
                                  {providerData.rumoredCircumstances && (
                                    <div className="mb-4">
                                      <div className="text-sm font-medium text-admin-text-secondary">
                                        Rumored Circumstances:
                                      </div>
                                      <div className="mt-1 text-sm text-admin-text-muted">
                                        {providerData.rumoredCircumstances}
                                      </div>
                                    </div>
                                  )}
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-admin-text-secondary">
                                      Sources ({providerData.sources.length}):
                                    </div>
                                    <div className="mt-1 space-y-1">
                                      {providerData.sources.map((source, idx) => (
                                        <div
                                          key={idx}
                                          className="break-all text-xs text-admin-interactive"
                                        >
                                          {source}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {providerData.resolvedSources &&
                                    providerData.resolvedSources.length > 0 && (
                                      <div className="mb-4">
                                        <div className="text-sm font-medium text-admin-text-secondary">
                                          Resolved Sources:
                                        </div>
                                        <div className="mt-1 space-y-1">
                                          {providerData.resolvedSources.map((resolved, idx) => (
                                            <div
                                              key={idx}
                                              className="text-xs text-admin-text-muted"
                                            >
                                              {resolved.sourceName}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  <div className="text-xs text-admin-text-muted">
                                    Cost: ${providerData.costUsd.toFixed(4)}
                                  </div>
                                </>
                              ) : (
                                <div className="text-sm text-admin-danger">
                                  No death information found
                                </div>
                              )}
                            </div>
                          )
                        })}
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
