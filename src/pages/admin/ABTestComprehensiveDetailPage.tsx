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
        <div className="p-4 md:p-8">
          <h1 className="mb-4 text-2xl font-bold text-admin-danger">Invalid Run ID</h1>
          <p className="mb-4 text-admin-text-secondary">
            The run ID parameter is missing or invalid. Please provide a valid numeric run ID.
          </p>
          <Link
            to="/admin/ab-tests/comprehensive"
            className="text-admin-interactive hover:text-admin-interactive-hover"
          >
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
        <div className="py-12 text-center text-admin-danger">
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
            className="text-sm text-admin-interactive hover:text-admin-interactive-hover"
          >
            ← Back to all comprehensive tests
          </Link>
          <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
                {run.testName}
              </h1>
              <p className="mt-2 text-admin-text-muted">
                Testing {run.providers.join(" vs ")} with {run.strategies.length} source strategies
              </p>
            </div>
            <span
              className={`self-start rounded-full px-4 py-2 text-sm font-medium sm:self-auto ${
                run.status === "running"
                  ? "bg-admin-interactive/20 text-admin-interactive"
                  : run.status === "completed"
                    ? "bg-admin-success/20 text-admin-success"
                    : "bg-admin-danger/20 text-admin-danger"
              }`}
            >
              {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {isRunning && (
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <h2 className="text-xl font-semibold text-admin-text-primary">Test Progress</h2>
              <div className="text-sm text-admin-text-muted">Auto-refreshing every 3s</div>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-admin-text-muted">
                {run.completedActors}/{run.totalActors} actors • {run.completedVariants}/
                {run.totalVariants} variants
              </span>
              <span className="font-medium text-admin-text-primary">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-admin-surface-overlay">
              <div
                className="h-full bg-admin-interactive transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              {run.totalActors}
            </div>
            <div className="text-sm text-admin-text-muted">Total Actors</div>
          </div>
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-interactive md:text-3xl">
              {run.totalVariants}
            </div>
            <div className="text-sm text-admin-text-muted">Total Variants</div>
          </div>
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-admin-success md:text-3xl">
              ${run.totalCost.toFixed(4)}
            </div>
            <div className="text-sm text-admin-text-muted">Total Cost</div>
          </div>
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <div className="text-2xl font-bold text-purple-500 md:text-3xl">
              {run.completedActors}
            </div>
            <div className="text-sm text-admin-text-muted">Completed</div>
          </div>
        </div>

        {/* Variant Performance */}
        <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-6 text-xl font-semibold text-admin-text-primary">
            Variant Performance
          </h2>
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
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
                  <div key={variant} className="rounded-lg bg-admin-surface-base p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-admin-text-primary">{provider}</div>
                        <div className="text-sm text-admin-text-muted">
                          {strategy?.replace(/_/g, " ") ?? "unknown"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-admin-text-primary">
                          {successRate.toFixed(0)}%
                        </div>
                        <div className="text-xs text-admin-text-muted">
                          {stats.found}/{stats.total} found
                        </div>
                      </div>
                    </div>
                    {stats.total > 0 && (
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-admin-surface-overlay">
                        <div
                          className="h-full bg-admin-success transition-all"
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
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">
              Inferences & Analysis
            </h2>
            <div className="space-y-4">
              {[...run.inferences].reverse().map((inference, idx) => (
                <div key={idx} className="rounded-lg bg-admin-surface-base p-4">
                  <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="font-medium text-admin-text-primary">{inference.message}</div>
                    <div className="text-xs text-admin-text-muted">
                      {new Date(inference.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {inference.data !== undefined && inference.data !== null && (
                    <pre className="mt-2 overflow-x-auto rounded bg-admin-surface-elevated p-3 text-xs text-admin-text-secondary">
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
          <div className="rounded-lg bg-admin-surface-elevated shadow-admin-sm">
            <div className="border-b border-admin-border px-4 py-4 md:px-6">
              <h2 className="text-xl font-semibold text-admin-text-primary">
                Test Results ({results.length} actors)
              </h2>
            </div>
            <div className="divide-y divide-admin-border">
              {results.map((actor) => {
                const variantKeys = Object.keys(actor.variants)

                return (
                  <div key={actor.actorId} className="px-4 py-4 md:px-6">
                    <h3 className="mb-3 text-lg font-medium text-admin-text-primary">
                      {actor.actorName}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                            className={`rounded-lg p-3 ${hasData ? "border border-green-800 bg-green-900/20" : "bg-admin-surface-base"}`}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-xs font-medium text-admin-text-muted">
                                {provider} / {strategy?.replace(/_/g, " ") ?? "unknown"}
                              </div>
                              <div
                                className={`text-xs font-bold ${hasData ? "text-admin-success" : "text-admin-danger"}`}
                              >
                                {hasData ? "✓" : "✗"}
                              </div>
                            </div>
                            {hasData && (
                              <div className="space-y-2 text-xs text-admin-text-secondary">
                                {variant.whatWeKnow && (
                                  <div>
                                    <span className="font-medium">What We Know:</span>{" "}
                                    {variant.whatWeKnow.substring(0, 80)}...
                                  </div>
                                )}
                                {variant.sources && variant.sources.length > 0 && (
                                  <div className="text-admin-text-muted">
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
