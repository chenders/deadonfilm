import { useParams, Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useComprehensiveTestRunDetail } from "../../hooks/admin/useComprehensiveTestRuns"

export default function ABTestComprehensiveDetailPage() {
  const { runId } = useParams<{ runId: string }>()

  // Validate runId parameter
  const parsedRunId = runId ? parseInt(runId, 10) : 0
  const isValidRunId = !isNaN(parsedRunId) && parsedRunId > 0

  // Use enabled option to avoid unnecessary API requests for invalid IDs
  const { data, isLoading, error } = useComprehensiveTestRunDetail(parsedRunId, {
    enabled: isValidRunId,
  })

  // Now handle invalid runId after hooks are called
  if (!isValidRunId) {
    return (
      <AdminLayout>
        <div className="p-8">
          <h1 className="mb-4 text-2xl font-bold text-red-400">Invalid Run ID</h1>
          <p className="mb-4 text-gray-300">
            The run ID parameter is missing or invalid. Please provide a valid numeric run ID.
          </p>
          <Link to="/admin/ab-tests/comprehensive" className="text-blue-400 hover:text-blue-300">
            ← Back to Comprehensive Tests
          </Link>
        </div>
      </AdminLayout>
    )
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="py-12 text-center text-red-500">
          {error instanceof Error ? error.message : "Failed to load test run"}
        </div>
      </AdminLayout>
    )
  }

  const { run, results } = data
  const progress = (run.completedVariants / run.totalVariants) * 100
  const isRunning = run.status === "running"

  // Calculate success rates per variant
  const variantStats = {} as Record<string, { found: number; total: number }>

  run.providers.forEach((provider) => {
    run.strategies.forEach((strategy) => {
      const key = `${provider}::${strategy}`
      variantStats[key] = { found: 0, total: 0 }
    })
  })

  results.forEach((actor) => {
    Object.entries(actor.variants).forEach(([key, variant]) => {
      // Initialize missing keys (handles partial runs or strategy changes)
      if (!variantStats[key]) {
        variantStats[key] = { found: 0, total: 0 }
      }
      variantStats[key].total++
      if (variant.whatWeKnow || variant.alternativeAccounts || variant.additionalContext) {
        variantStats[key].found++
      }
    })
  })

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header with breadcrumb */}
        <div>
          <Link
            to="/admin/ab-tests/comprehensive"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to all comprehensive tests
          </Link>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{run.testName}</h1>
              <p className="mt-2 text-gray-400">
                Testing {run.providers.join(" vs ")} with {run.strategies.length} source strategies
              </p>
            </div>
            <span
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                run.status === "running"
                  ? "bg-blue-500/20 text-blue-400"
                  : run.status === "completed"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
              }`}
            >
              {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {isRunning && (
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Test Progress</h2>
              <div className="text-sm text-gray-400">Auto-refreshing every 3s</div>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-400">
                {run.completedActors}/{run.totalActors} actors • {run.completedVariants}/
                {run.totalVariants} variants
              </span>
              <span className="font-medium text-white">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-white">{run.totalActors}</div>
            <div className="text-sm text-gray-400">Total Actors</div>
          </div>
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-blue-500">{run.totalVariants}</div>
            <div className="text-sm text-gray-400">Total Variants</div>
          </div>
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-green-500">${run.totalCost.toFixed(4)}</div>
            <div className="text-sm text-gray-400">Total Cost</div>
          </div>
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="text-3xl font-bold text-purple-500">{run.completedActors}</div>
            <div className="text-sm text-gray-400">Completed</div>
          </div>
        </div>

        {/* Variant Performance */}
        <div className="rounded-lg bg-gray-800 p-6">
          <h2 className="mb-6 text-xl font-semibold text-white">Variant Performance</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.entries(variantStats)
              .sort(([, a], [, b]) => {
                const aRate = a.total > 0 ? a.found / a.total : 0
                const bRate = b.total > 0 ? b.found / b.total : 0
                return bRate - aRate
              })
              .map(([variant, stats]) => {
                const [provider, strategy] = variant.split("::")
                const successRate = stats.total > 0 ? (stats.found / stats.total) * 100 : 0

                return (
                  <div key={variant} className="rounded-lg bg-gray-900 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{provider}</div>
                        <div className="text-sm text-gray-400">
                          {strategy?.replace(/_/g, " ") ?? "unknown"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-white">
                          {successRate.toFixed(0)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          {stats.found}/{stats.total} found
                        </div>
                      </div>
                    </div>
                    {stats.total > 0 && (
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-700">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>

        {/* Real-time Inferences */}
        {run.inferences.length > 0 && (
          <div className="rounded-lg bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Inferences & Analysis</h2>
            <div className="space-y-4">
              {[...run.inferences].reverse().map((inference, idx) => (
                <div key={idx} className="rounded-lg bg-gray-900 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium text-white">{inference.message}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(inference.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {inference.data !== undefined && inference.data !== null && (
                    <pre className="mt-2 overflow-x-auto rounded bg-gray-800 p-3 text-xs text-gray-300">
                      {JSON.stringify(inference.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actor Results */}
        {results.length > 0 && (
          <div className="rounded-lg bg-gray-800">
            <div className="border-b border-gray-700 px-6 py-4">
              <h2 className="text-xl font-semibold text-white">
                Test Results ({results.length} actors)
              </h2>
            </div>
            <div className="divide-y divide-gray-700">
              {results.map((actor) => {
                const variantKeys = Object.keys(actor.variants)

                return (
                  <div key={actor.actorId} className="px-6 py-4">
                    <h3 className="mb-3 text-lg font-medium text-white">{actor.actorName}</h3>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {variantKeys.map((key) => {
                        const variant = actor.variants[key]
                        const [provider, strategy] = key.split("::")
                        const hasData =
                          variant.whatWeKnow ||
                          variant.alternativeAccounts ||
                          variant.additionalContext

                        return (
                          <div
                            key={key}
                            className={`rounded-lg p-3 ${hasData ? "border border-green-800 bg-green-900/20" : "bg-gray-900"}`}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-xs font-medium text-gray-400">
                                {provider} / {strategy?.replace(/_/g, " ") ?? "unknown"}
                              </div>
                              <div
                                className={`text-xs font-bold ${hasData ? "text-green-400" : "text-red-400"}`}
                              >
                                {hasData ? "✓" : "✗"}
                              </div>
                            </div>
                            {hasData && (
                              <div className="space-y-2 text-xs text-gray-300">
                                {variant.whatWeKnow && (
                                  <div>
                                    <span className="font-medium">What We Know:</span>{" "}
                                    {variant.whatWeKnow.substring(0, 80)}...
                                  </div>
                                )}
                                {variant.sources && variant.sources.length > 0 && (
                                  <div className="text-gray-500">
                                    {variant.sources.length} sources
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
