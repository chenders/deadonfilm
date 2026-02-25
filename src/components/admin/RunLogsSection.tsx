/**
 * Shared section component for displaying run-level structured logs.
 * Used by both death enrichment and biography enrichment run detail pages.
 * Features: level filtering, pagination, JSON data display, source badges.
 */

import { useState } from "react"
import { useRunLogs } from "../../hooks/admin/useEnrichmentRuns"
import ErrorMessage from "../common/ErrorMessage"

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-800 text-blue-200",
  warn: "bg-yellow-800 text-yellow-200",
  error: "bg-red-800 text-red-200",
  debug: "bg-gray-700 text-gray-200",
}

interface RunLogsSectionProps {
  runType: "death" | "biography"
  runId: number
}

export function RunLogsSection({ runType, runId }: RunLogsSectionProps) {
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState<string | undefined>(undefined)
  const { data, isLoading, error } = useRunLogs(runType, runId, page, 50, level)

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-admin-text-primary">Run Logs</h2>
        <select
          value={level ?? ""}
          onChange={(e) => {
            setLevel(e.target.value || undefined)
            setPage(1)
          }}
          className="rounded border border-admin-border bg-admin-surface-base px-3 py-1.5 text-sm text-admin-text-primary"
          aria-label="Filter logs by level"
        >
          <option value="">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-admin-text-muted">Loading logs...</p>
      ) : error ? (
        <ErrorMessage message="Failed to load run logs" />
      ) : !data || data.logs.length === 0 ? (
        <p className="text-sm text-admin-text-muted">
          No run logs found. Run logs will appear here for new enrichment runs.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {data.logs.map((log) => (
              <div key={log.id} className="rounded border border-admin-border px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 font-mono text-xs text-admin-text-muted">
                    {new Date(log.timestamp).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${LEVEL_COLORS[log.level] ?? LEVEL_COLORS.info}`}
                  >
                    {log.level}
                  </span>
                  {log.source && (
                    <span className="shrink-0 text-xs text-admin-text-muted">[{log.source}]</span>
                  )}
                  <span className="font-medium text-admin-text-primary">{log.message}</span>
                </div>
                {log.data && (
                  <pre className="mt-1 overflow-x-auto rounded bg-admin-surface-base p-2 text-xs text-admin-text-secondary">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-admin-text-muted">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total}{" "}
                total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-admin-border px-3 py-1 text-xs text-admin-text-primary disabled:opacity-50"
                  aria-label="Go to previous page"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= (data?.pagination.totalPages ?? 1)}
                  className="rounded border border-admin-border px-3 py-1 text-xs text-admin-text-primary disabled:opacity-50"
                  aria-label="Go to next page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
