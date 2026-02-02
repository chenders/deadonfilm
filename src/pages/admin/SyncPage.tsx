import { useState, useEffect, Fragment } from "react"
import AdminLayout from "../../components/admin/AdminLayout"
import {
  useSyncStatus,
  useSyncHistory,
  useTriggerSync,
  useSyncDetails,
  useCancelSync,
} from "../../hooks/admin/useAdminSync"

export default function SyncPage() {
  // Form state
  const [syncDays, setSyncDays] = useState(1)
  const [syncPeople, setSyncPeople] = useState(true)
  const [syncMovies, setSyncMovies] = useState(true)
  const [syncShows, setSyncShows] = useState(true)
  const [dryRun, setDryRun] = useState(false)

  // UI state
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const status = useSyncStatus()
  const history = useSyncHistory(20)
  const triggerMutation = useTriggerSync()
  const cancelMutation = useCancelSync()

  // Fetch live details for running sync
  const syncDetails = useSyncDetails(status.data?.currentSyncId ?? null, {
    enabled: status.data?.isRunning ?? false,
  })

  // Timer for elapsed time display
  useEffect(() => {
    if (!status.data?.isRunning || !status.data?.currentSyncStartedAt) {
      setElapsedSeconds(0)
      return
    }

    const startTime = new Date(status.data.currentSyncStartedAt).getTime()

    // Handle invalid date or future timestamp (clock skew)
    if (isNaN(startTime)) {
      setElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      // Clamp to 0 if negative (future timestamp due to clock skew)
      setElapsedSeconds(Math.max(0, elapsed))
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [status.data?.isRunning, status.data?.currentSyncStartedAt])

  // Ensure cancel confirmation dialog state is cleared when sync stops
  useEffect(() => {
    if (!status.data?.isRunning) {
      setShowCancelConfirm(false)
    }
  }, [status.data?.isRunning])

  const handleTriggerSync = () => {
    const types: ("people" | "movies" | "shows")[] = []
    if (syncPeople) types.push("people")
    if (syncMovies) types.push("movies")
    if (syncShows) types.push("shows")

    if (types.length === 0) {
      return
    }

    triggerMutation.mutate({
      days: syncDays,
      types,
      dryRun,
    })
  }

  const formatDuration = (startedAt: string, completedAt: string | null): string => {
    if (!completedAt) return "In progress"
    const start = new Date(startedAt).getTime()
    const end = new Date(completedAt).getTime()
    if (Number.isNaN(start) || Number.isNaN(end)) return "Invalid dates"
    const durationMs = end - start
    if (durationMs < 0) return "Invalid duration"
    const seconds = Math.round(durationMs / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return "Invalid date"
    return date.toLocaleString()
  }

  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`
  }

  const handleCancelSync = () => {
    if (status.data?.currentSyncId) {
      cancelMutation.mutate(status.data.currentSyncId, {
        onSuccess: () => {
          setShowCancelConfirm(false)
        },
      })
    }
  }

  const toggleExpandedRow = (id: number) => {
    setExpandedRowId(expandedRowId === id ? null : id)
  }

  const getStatusBadgeClass = (syncStatus: string): string => {
    switch (syncStatus) {
      case "completed":
        return "bg-admin-success/20 text-admin-success"
      case "running":
        return "bg-admin-warning/20 text-admin-warning"
      case "failed":
        return "bg-admin-danger/20 text-admin-danger"
      default:
        return "bg-admin-text-muted/20 text-admin-text-muted"
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">TMDB Sync</h1>
          <p className="mt-2 text-admin-text-muted">
            Sync changes from TMDB to keep actor and content data current
          </p>
        </div>

        {/* Status Card */}
        <div
          className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm"
          data-testid="sync-status-card"
        >
          <h2 className="text-lg font-semibold text-admin-text-primary">Sync Status</h2>

          {status.isLoading && <div className="mt-4 text-admin-text-muted">Loading status...</div>}

          {status.data && (
            <div className="mt-4 space-y-4">
              {status.data.isRunning ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 animate-pulse rounded-full bg-admin-warning"></div>
                      <span className="font-medium text-admin-warning">Sync in progress</span>
                      <span className="text-sm text-admin-text-muted">
                        Running for {formatElapsedTime(elapsedSeconds)}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={cancelMutation.isPending}
                      className="hover:bg-admin-danger/90 rounded-md bg-admin-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {cancelMutation.isPending ? "Stopping..." : "Force Stop"}
                    </button>
                  </div>

                  {/* Live progress */}
                  {syncDetails.data && (
                    <div className="rounded-md bg-admin-surface-overlay p-4">
                      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                        <div>
                          <span className="text-admin-text-muted">Checked:</span>
                          <span className="ml-2 font-medium text-admin-text-primary">
                            {syncDetails.data.itemsChecked.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-admin-text-muted">Updated:</span>
                          <span className="ml-2 font-medium text-admin-text-primary">
                            {syncDetails.data.itemsUpdated.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-admin-text-muted">New Deaths:</span>
                          <span className="ml-2 font-medium text-admin-text-primary">
                            {syncDetails.data.newDeathsFound.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cancel confirmation dialog */}
                  {showCancelConfirm && (
                    <div className="border-admin-danger/50 bg-admin-danger/10 rounded-md border p-4">
                      <p className="text-sm text-admin-text-primary">
                        Are you sure you want to stop this sync? It will be marked as failed.
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          onClick={handleCancelSync}
                          disabled={cancelMutation.isPending}
                          className="hover:bg-admin-danger/90 rounded-md bg-admin-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {cancelMutation.isPending ? "Stopping..." : "Yes, Stop Sync"}
                        </button>
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          disabled={cancelMutation.isPending}
                          className="rounded-md bg-admin-surface-overlay px-3 py-1.5 text-sm font-medium text-admin-text-secondary hover:bg-admin-surface-elevated"
                        >
                          Cancel
                        </button>
                      </div>
                      {cancelMutation.isError && (
                        <p className="mt-2 text-sm text-admin-danger">
                          {cancelMutation.error instanceof Error
                            ? cancelMutation.error.message
                            : "Failed to cancel sync"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-admin-success"></div>
                  <span className="font-medium text-admin-success">Ready</span>
                </div>
              )}

              {status.data.lastSync && (
                <div className="rounded-md bg-admin-surface-overlay p-4">
                  <h3 className="text-sm font-medium text-admin-text-secondary">
                    Last Completed Sync
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                    <div>
                      <span className="text-admin-text-muted">Type:</span>
                      <span className="ml-2 font-medium text-admin-text-primary">
                        {status.data.lastSync.type}
                      </span>
                    </div>
                    <div>
                      <span className="text-admin-text-muted">Completed:</span>
                      <span className="ml-2 font-medium text-admin-text-primary">
                        {formatDate(status.data.lastSync.completedAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-admin-text-muted">Items Checked:</span>
                      <span className="ml-2 font-medium text-admin-text-primary">
                        {status.data.lastSync.itemsChecked.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-admin-text-muted">Updated:</span>
                      <span className="ml-2 font-medium text-admin-text-primary">
                        {status.data.lastSync.itemsUpdated.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trigger Sync Form */}
        <div
          className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm"
          data-testid="sync-trigger-form"
        >
          <h2 className="text-lg font-semibold text-admin-text-primary">Trigger Sync</h2>
          <p className="mt-1 text-sm text-admin-text-muted">
            Fetch recent changes from TMDB and update our database
          </p>

          <div className="mt-6 space-y-6">
            {/* Days input */}
            <div>
              <label
                htmlFor="syncDays"
                className="block text-sm font-medium text-admin-text-secondary"
              >
                Days to sync
              </label>
              <input
                type="number"
                id="syncDays"
                min="1"
                max="14"
                value={syncDays}
                onChange={(e) =>
                  setSyncDays(Math.max(1, Math.min(14, parseInt(e.target.value) || 1)))
                }
                data-testid="sync-days-input"
                className="mt-2 w-32 rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive"
              />
              <p className="mt-1 text-xs text-admin-text-muted">
                How many days of changes to fetch (1-14)
              </p>
            </div>

            {/* Type checkboxes */}
            <div>
              <span className="block text-sm font-medium text-admin-text-secondary">
                Content types to sync
              </span>
              <div className="mt-3 flex flex-wrap gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={syncPeople}
                    onChange={(e) => setSyncPeople(e.target.checked)}
                    data-testid="sync-type-people-checkbox"
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <span className="ml-2 text-sm text-admin-text-secondary">People</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={syncMovies}
                    onChange={(e) => setSyncMovies(e.target.checked)}
                    data-testid="sync-type-movies-checkbox"
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <span className="ml-2 text-sm text-admin-text-secondary">Movies</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={syncShows}
                    onChange={(e) => setSyncShows(e.target.checked)}
                    data-testid="sync-type-shows-checkbox"
                    className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
                  />
                  <span className="ml-2 text-sm text-admin-text-secondary">TV Shows</span>
                </label>
              </div>
            </div>

            {/* Dry run toggle */}
            <div className="flex items-center" data-testid="sync-dry-run-toggle">
              <input
                type="checkbox"
                id="syncDryRun"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-2 focus:ring-admin-interactive"
              />
              <label htmlFor="syncDryRun" className="ml-2 text-sm text-admin-text-secondary">
                Dry run (preview without making changes)
              </label>
            </div>

            {/* Submit button */}
            <div>
              <button
                onClick={handleTriggerSync}
                disabled={
                  triggerMutation.isPending ||
                  status.data?.isRunning ||
                  (!syncPeople && !syncMovies && !syncShows)
                }
                data-testid="sync-submit-button"
                className="hover:bg-admin-interactive/90 rounded-md bg-admin-interactive px-6 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {triggerMutation.isPending
                  ? "Starting..."
                  : status.data?.isRunning
                    ? "Sync in Progress"
                    : dryRun
                      ? "Start Preview"
                      : "Start Sync"}
              </button>
            </div>

            {/* Success message */}
            {triggerMutation.isSuccess && triggerMutation.data && (
              <div className="border-admin-success/50 bg-admin-success/20 rounded-md border p-4">
                <h4 className="font-semibold text-admin-success">
                  {triggerMutation.data.dryRun ? "Preview Started" : "Sync Started"}
                </h4>
                <p className="mt-1 text-sm text-admin-text-primary">
                  {triggerMutation.data.message} (ID: {triggerMutation.data.syncId})
                </p>
              </div>
            )}

            {/* Error message */}
            {triggerMutation.isError && (
              <div className="border-admin-danger/50 bg-admin-danger/20 rounded-md border p-3 text-admin-danger">
                {triggerMutation.error instanceof Error
                  ? triggerMutation.error.message
                  : "Failed to start sync"}
              </div>
            )}
          </div>
        </div>

        {/* Sync History */}
        <div className="rounded-lg bg-admin-surface-elevated shadow-admin-sm">
          <div className="border-b border-admin-border p-6">
            <h2 className="text-lg font-semibold text-admin-text-primary">Sync History</h2>
            <p className="mt-1 text-sm text-admin-text-muted">Recent sync operations</p>
          </div>

          {history.isLoading && (
            <div className="p-12 text-center text-admin-text-muted">Loading history...</div>
          )}

          {history.data && (
            <div
              data-testid="sync-history-table"
              className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
            >
              <table className="w-full min-w-[900px] divide-y divide-admin-border">
                <thead className="bg-admin-surface-overlay">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Started
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Checked
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      New Deaths
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                      Triggered By
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
                  {history.data.history.map((item) => (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => toggleExpandedRow(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            toggleExpandedRow(item.id)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expandedRowId === item.id}
                        aria-label={`${expandedRowId === item.id ? "Collapse" : "Expand"} ${item.syncType} sync details`}
                        className="cursor-pointer hover:bg-admin-surface-overlay"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-admin-text-muted transition-transform ${expandedRowId === item.id ? "rotate-90" : ""}`}
                            >
                              ▶
                            </span>
                            <span className="font-medium text-admin-text-primary">
                              {item.syncType}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusBadgeClass(item.status)}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {formatDate(item.startedAt)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {formatDuration(item.startedAt, item.completedAt)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {item.itemsChecked.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {item.itemsUpdated.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {item.newDeathsFound.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-admin-text-secondary">
                          {item.triggeredBy || "N/A"}
                        </td>
                      </tr>
                      {expandedRowId === item.id && (
                        <tr>
                          <td colSpan={8} className="bg-admin-surface-overlay px-6 py-4">
                            <div className="space-y-3 text-sm">
                              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                <div>
                                  <span className="text-admin-text-muted">Sync ID:</span>
                                  <span className="ml-2 font-mono text-admin-text-primary">
                                    {item.id}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-admin-text-muted">Started:</span>
                                  <span className="ml-2 text-admin-text-primary">
                                    {formatDate(item.startedAt)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-admin-text-muted">Completed:</span>
                                  <span className="ml-2 text-admin-text-primary">
                                    {formatDate(item.completedAt)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-admin-text-muted">Duration:</span>
                                  <span className="ml-2 text-admin-text-primary">
                                    {formatDuration(item.startedAt, item.completedAt)}
                                  </span>
                                </div>
                              </div>

                              {item.parameters && (
                                <div>
                                  <span className="text-admin-text-muted">Parameters:</span>
                                  <pre className="ml-2 font-mono text-xs text-admin-text-primary">
                                    {JSON.stringify(item.parameters, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {item.errorMessage && (
                                <div className="border-admin-danger/30 bg-admin-danger/10 rounded-md border p-3">
                                  <span className="font-medium text-admin-danger">Error:</span>
                                  <p className="mt-1 whitespace-pre-wrap text-admin-text-primary">
                                    {item.errorMessage}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {history.data.history.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-admin-text-muted">
                        No sync history yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="rounded-lg bg-admin-surface-overlay p-6 text-sm text-admin-text-secondary">
          <h3 className="font-semibold text-admin-text-primary">About TMDB Sync</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>People sync:</strong> Updates actor information including death dates,
              popularity scores, and profile images
            </li>
            <li>
              <strong>Movies sync:</strong> Updates movie metadata, cast changes, and release
              information
            </li>
            <li>
              <strong>TV Shows sync:</strong> Updates show metadata, episode counts, and cast
              information
            </li>
            <li>Changes are fetched from TMDB's change log for the specified number of days</li>
            <li>Caches are automatically invalidated for any updated actors or content</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  )
}
