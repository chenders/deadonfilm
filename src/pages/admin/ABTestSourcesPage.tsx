import { useState } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useABTestResults } from "../../hooks/admin/useABTests"

export default function ABTestSourcesPage() {
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
            <h1 className="text-3xl font-bold text-white">A/B Test: Source Requirement</h1>
            <p className="mt-2 text-gray-400">
              No A/B tests have been run yet. Run <code className="rounded bg-gray-800 px-2 py-1">npm run ab-test:sources</code> from the server directory to start testing.
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
          <h1 className="text-3xl font-bold text-white">A/B Test: Source Requirement</h1>
          <p className="mt-2 text-gray-400">
            Comparing AI enrichment results with and without the source URL requirement
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-white">{summary.totalTests}</div>
            <div className="text-sm text-gray-400">Total Tests</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-green-500">{summary.completeTests}</div>
            <div className="text-sm text-gray-400">Complete</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-blue-500">${summary.totalCost}</div>
            <div className="text-sm text-gray-400">Total Cost</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-yellow-500">{summary.withSourcesFoundData}</div>
            <div className="text-sm text-gray-400">With Sources</div>
            <div className="text-xs text-gray-500 mt-1">Found data</div>
          </div>

          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-orange-500">{summary.withoutSourcesFoundData}</div>
            <div className="text-sm text-gray-400">Without Sources</div>
            <div className="text-xs text-gray-500 mt-1">Found data</div>
          </div>
        </div>

        {/* Data Loss Analysis */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Data Loss Analysis</h2>
          <div className="text-gray-300">
            <p>
              Requiring sources resulted in <span className="font-bold text-red-500">{summary.dataLossPercentage}%</span> data loss
            </p>
            <p className="mt-2 text-sm text-gray-400">
              {summary.withoutSourcesFoundData - summary.withSourcesFoundData} fewer actors had death information when sources were required
            </p>
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
              const hasWithSources = !!comparison.withSources?.circumstances
              const hasWithoutSources = !!comparison.withoutSources?.circumstances

              return (
                <div key={comparison.actorId} className="px-6 py-4">
                  <div
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-750"
                    onClick={() => toggleExpand(comparison.actorId)}
                  >
                    <div>
                      <h3 className="text-lg font-medium text-white">{comparison.actorName}</h3>
                      <p className="text-sm text-gray-400">
                        Actor ID: {comparison.actorId} • Tested: {new Date(comparison.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-400">With Sources</div>
                        <div className={`font-medium ${hasWithSources ? "text-green-500" : "text-red-500"}`}>
                          {hasWithSources ? "✓ Found" : "✗ No Data"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Without Sources</div>
                        <div className={`font-medium ${hasWithoutSources ? "text-green-500" : "text-red-500"}`}>
                          {hasWithoutSources ? "✓ Found" : "✗ No Data"}
                        </div>
                      </div>
                      <svg
                        className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 grid grid-cols-2 gap-6">
                      {/* With Sources Column */}
                      <div className="rounded-lg bg-gray-900 p-4">
                        <h4 className="mb-3 font-semibold text-green-400">With Sources Required</h4>
                        {comparison.withSources?.circumstances ? (
                          <>
                            <div className="mb-4">
                              <div className="text-sm font-medium text-gray-300">Circumstances:</div>
                              <div className="mt-1 text-sm text-gray-400">{comparison.withSources.circumstances}</div>
                            </div>
                            {comparison.withSources.rumoredCircumstances && (
                              <div className="mb-4">
                                <div className="text-sm font-medium text-gray-300">Rumored Circumstances:</div>
                                <div className="mt-1 text-sm text-gray-400">{comparison.withSources.rumoredCircumstances}</div>
                              </div>
                            )}
                            <div className="mb-4">
                              <div className="text-sm font-medium text-gray-300">Sources ({comparison.withSources.sources.length}):</div>
                              <div className="mt-1 space-y-1">
                                {comparison.withSources.sources.map((source, idx) => (
                                  <div key={idx} className="text-xs text-blue-400 break-all">{source}</div>
                                ))}
                              </div>
                            </div>
                            {comparison.withSources.resolvedSources && comparison.withSources.resolvedSources.length > 0 && (
                              <div className="mb-4">
                                <div className="text-sm font-medium text-gray-300">Resolved Sources:</div>
                                <div className="mt-1 space-y-1">
                                  {comparison.withSources.resolvedSources.map((resolved, idx) => (
                                    <div key={idx} className="text-xs text-gray-400">
                                      {resolved.sourceName}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="text-xs text-gray-500">Cost: ${comparison.withSources.costUsd.toFixed(4)}</div>
                          </>
                        ) : (
                          <div className="text-sm text-red-400">No death information found</div>
                        )}
                      </div>

                      {/* Without Sources Column */}
                      <div className="rounded-lg bg-gray-900 p-4">
                        <h4 className="mb-3 font-semibold text-orange-400">Without Sources Required</h4>
                        {comparison.withoutSources?.circumstances ? (
                          <>
                            <div className="mb-4">
                              <div className="text-sm font-medium text-gray-300">Circumstances:</div>
                              <div className="mt-1 text-sm text-gray-400">{comparison.withoutSources.circumstances}</div>
                            </div>
                            {comparison.withoutSources.rumoredCircumstances && (
                              <div className="mb-4">
                                <div className="text-sm font-medium text-gray-300">Rumored Circumstances:</div>
                                <div className="mt-1 text-sm text-gray-400">{comparison.withoutSources.rumoredCircumstances}</div>
                              </div>
                            )}
                            <div className="mb-4">
                              <div className="text-sm font-medium text-gray-300">Sources ({comparison.withoutSources.sources.length}):</div>
                              <div className="mt-1 space-y-1">
                                {comparison.withoutSources.sources.map((source, idx) => (
                                  <div key={idx} className="text-xs text-blue-400 break-all">{source}</div>
                                ))}
                              </div>
                            </div>
                            {comparison.withoutSources.resolvedSources && comparison.withoutSources.resolvedSources.length > 0 && (
                              <div className="mb-4">
                                <div className="text-sm font-medium text-gray-300">Resolved Sources:</div>
                                <div className="mt-1 space-y-1">
                                  {comparison.withoutSources.resolvedSources.map((resolved, idx) => (
                                    <div key={idx} className="text-xs text-gray-400">
                                      {resolved.sourceName}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="text-xs text-gray-500">Cost: ${comparison.withoutSources.costUsd.toFixed(4)}</div>
                          </>
                        ) : (
                          <div className="text-sm text-red-400">No death information found</div>
                        )}
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
