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
        <div className="py-12 text-center text-red-500">
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
            <h1 className="text-3xl font-bold text-white">A/B Test: Provider Comparison</h1>
            <p className="mt-2 text-gray-400">
              No A/B tests have been run yet. Run{" "}
              <code className="rounded bg-gray-800 px-2 py-1">npm run ab-test:providers</code> from
              the server directory to start testing.
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
          <h1 className="text-3xl font-bold text-white">A/B Test: Provider Comparison</h1>
          <p className="mt-2 text-gray-400">
            Comparing death enrichment quality across different AI providers
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-white">{summary.totalTests}</div>
            <div className="text-sm text-gray-400">Total Tests</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-blue-500">${summary.totalCost}</div>
            <div className="text-sm text-gray-400">Total Cost</div>
          </div>

          {providers.map((provider, idx) => {
            const stats = summary.providerStats[provider]
            const colors = ["text-green-500", "text-orange-500", "text-purple-500", "text-pink-500"]
            const color = colors[idx % colors.length]

            return (
              <div key={provider} className="rounded-lg bg-gray-800 p-6">
                <div className={`text-3xl font-bold ${color}`}>{stats.foundData}</div>
                <div className="text-sm text-gray-400">{provider}</div>
                <div className="mt-1 text-xs text-gray-500">${stats.totalCost.toFixed(4)}</div>
              </div>
            )
          })}
        </div>

        {/* Provider Comparison Summary */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Provider Performance</h2>
          <div className="space-y-4">
            {providers.map((provider) => {
              const stats = summary.providerStats[provider]
              const successRate = ((stats.foundData / summary.totalTests) * 100).toFixed(0)
              const avgCost = (stats.totalCost / summary.totalTests).toFixed(4)

              return (
                <div key={provider} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">{provider}</div>
                    <div className="text-sm text-gray-400">
                      {stats.foundData}/{summary.totalTests} successful ({successRate}%)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-300">${avgCost} per test</div>
                    <div className="text-xs text-gray-500">
                      Total: ${stats.totalCost.toFixed(4)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Comparison Table */}
        <div className="rounded-lg bg-gray-800">
          <div className="border-b border-gray-700 px-6 py-4">
            <h2 className="text-xl font-semibold text-white">Test Results</h2>
          </div>
          <div className="divide-y divide-gray-700">
            {comparisons.map((comparison) => {
              const isExpanded = expandedActorId === comparison.actorId
              const providerKeys = Object.keys(comparison.providers)

              return (
                <div key={comparison.actorId} className="px-6 py-4">
                  <div
                    className="hover:bg-gray-750 flex cursor-pointer items-center justify-between"
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
                      <h3 className="text-lg font-medium text-white">{comparison.actorName}</h3>
                      <p className="text-sm text-gray-400">
                        Actor ID: {comparison.actorId} • Tested:{" "}
                        {new Date(comparison.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      {providerKeys.map((provider) => {
                        const hasData = !!comparison.providers[provider].circumstances
                        return (
                          <div key={provider} className="text-right">
                            <div className="text-sm text-gray-400">{provider}</div>
                            <div
                              className={`font-medium ${hasData ? "text-green-500" : "text-red-500"}`}
                            >
                              {hasData ? "✓ Found" : "✗ No Data"}
                            </div>
                          </div>
                        )
                      })}
                      <svg
                        className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
                          <div className="rounded-lg bg-gray-900 p-4">
                            <h4 className="mb-3 font-semibold text-white">
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
                        className="grid gap-6"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(providerKeys.length, 3)}, minmax(0, 1fr))`,
                        }}
                      >
                        {providerKeys.map((provider) => {
                          const providerData = comparison.providers[provider]
                          const colors = [
                            "text-green-400",
                            "text-orange-400",
                            "text-purple-400",
                            "text-pink-400",
                          ]
                          const color = colors[providerKeys.indexOf(provider) % colors.length]

                          return (
                            <div key={provider} className="rounded-lg bg-gray-900 p-4">
                              <h4 className={`mb-3 font-semibold ${color}`}>{provider}</h4>
                              {providerData.circumstances ? (
                                <>
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-gray-300">
                                      Circumstances:
                                    </div>
                                    <div className="mt-1 text-sm text-gray-400">
                                      {providerData.circumstances}
                                    </div>
                                  </div>
                                  {providerData.rumoredCircumstances && (
                                    <div className="mb-4">
                                      <div className="text-sm font-medium text-gray-300">
                                        Rumored Circumstances:
                                      </div>
                                      <div className="mt-1 text-sm text-gray-400">
                                        {providerData.rumoredCircumstances}
                                      </div>
                                    </div>
                                  )}
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-gray-300">
                                      Sources ({providerData.sources.length}):
                                    </div>
                                    <div className="mt-1 space-y-1">
                                      {providerData.sources.map((source, idx) => (
                                        <div key={idx} className="break-all text-xs text-blue-400">
                                          {source}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {providerData.resolvedSources &&
                                    providerData.resolvedSources.length > 0 && (
                                      <div className="mb-4">
                                        <div className="text-sm font-medium text-gray-300">
                                          Resolved Sources:
                                        </div>
                                        <div className="mt-1 space-y-1">
                                          {providerData.resolvedSources.map((resolved, idx) => (
                                            <div key={idx} className="text-xs text-gray-400">
                                              {resolved.sourceName}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  <div className="text-xs text-gray-500">
                                    Cost: ${providerData.costUsd.toFixed(4)}
                                  </div>
                                </>
                              ) : (
                                <div className="text-sm text-red-400">
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
