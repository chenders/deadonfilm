import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import LoadingSpinner from "../../components/common/LoadingSpinner"
import { useComprehensiveTestRuns } from "../../hooks/admin/useComprehensiveTestRuns"

export default function ABTestComprehensiveIndexPage() {
  const { data, isLoading, error } = useComprehensiveTestRuns()

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
          {error instanceof Error ? error.message : "Failed to load comprehensive test runs"}
        </div>
      </AdminLayout>
    )
  }

  const runs = data?.runs || []

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
              Comprehensive A/B Tests
            </h1>
            <p className="mt-2 text-admin-text-muted">
              Provider × Source Strategy comparison with real-time tracking
            </p>
          </div>
          <div className="text-sm text-admin-text-muted">
            Auto-refreshes every 5s while tests are running
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
            <p className="text-admin-text-muted">
              No comprehensive tests have been run yet. Run{" "}
              <code className="rounded bg-admin-surface-overlay px-2 py-1">
                npm run ab-test:comprehensive
              </code>{" "}
              from the server directory to start testing.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => {
              const progress = (run.completedVariants / run.totalVariants) * 100
              const isRunning = run.status === "running"

              return (
                <Link
                  key={run.id}
                  to={`/admin/ab-tests/comprehensive/${run.id}`}
                  className="block rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm transition-colors hover:bg-admin-interactive-secondary md:p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-admin-text-primary">
                          {run.testName}
                        </h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
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

                      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
                        <div>
                          <div className="text-sm text-admin-text-muted">Actors</div>
                          <div className="text-lg font-medium text-admin-text-primary">
                            {run.completedActors}/{run.totalActors}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-admin-text-muted">Variants</div>
                          <div className="text-lg font-medium text-admin-text-primary">
                            {run.completedVariants}/{run.totalVariants}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-admin-text-muted">Cost</div>
                          <div className="text-lg font-medium text-admin-text-primary">
                            ${run.totalCost.toFixed(4)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-admin-text-muted">Started</div>
                          <div className="text-lg font-medium text-admin-text-primary">
                            {new Date(run.startedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {isRunning && (
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="text-admin-text-muted">Progress</span>
                            <span className="text-admin-text-primary">{progress.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-admin-surface-overlay">
                            <div
                              className="h-full bg-admin-interactive transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {run.inferences.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium text-admin-text-secondary">
                            Latest Inference:
                          </div>
                          <div className="mt-1 text-sm text-admin-text-muted">
                            {run.inferences[run.inferences.length - 1].message}
                          </div>
                        </div>
                      )}
                    </div>

                    <svg
                      className="h-6 w-6 flex-shrink-0 text-admin-text-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
