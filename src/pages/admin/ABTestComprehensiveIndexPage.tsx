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
        <div className="py-12 text-center text-red-500">
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Comprehensive A/B Tests</h1>
            <p className="mt-2 text-gray-400">
              Provider × Source Strategy comparison with real-time tracking
            </p>
          </div>
          <div className="text-sm text-gray-400">
            Auto-refreshes every 5s while tests are running
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-lg bg-gray-800 p-12 text-center">
            <p className="text-gray-400">
              No comprehensive tests have been run yet. Run{" "}
              <code className="rounded bg-gray-700 px-2 py-1">npm run ab-test:comprehensive</code>{" "}
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
                  className="hover:bg-gray-750 block rounded-lg bg-gray-800 p-6 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-white">{run.testName}</h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
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

                      <div className="mt-4 grid grid-cols-4 gap-6">
                        <div>
                          <div className="text-sm text-gray-400">Actors</div>
                          <div className="text-lg font-medium text-white">
                            {run.completedActors}/{run.totalActors}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">Variants</div>
                          <div className="text-lg font-medium text-white">
                            {run.completedVariants}/{run.totalVariants}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">Cost</div>
                          <div className="text-lg font-medium text-white">
                            ${run.totalCost.toFixed(4)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">Started</div>
                          <div className="text-lg font-medium text-white">
                            {new Date(run.startedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {isRunning && (
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="text-gray-400">Progress</span>
                            <span className="text-white">{progress.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                            <div
                              className="h-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {run.inferences.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium text-gray-300">Latest Inference:</div>
                          <div className="mt-1 text-sm text-gray-400">
                            {run.inferences[run.inferences.length - 1].message}
                          </div>
                        </div>
                      )}
                    </div>

                    <svg
                      className="h-6 w-6 flex-shrink-0 text-gray-400"
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
