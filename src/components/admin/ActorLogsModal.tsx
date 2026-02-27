/**
 * Shared modal for displaying per-actor enrichment log entries.
 * Used by both death enrichment and biography enrichment run detail pages.
 * Features: timestamps, level badges, JSON payloads, collapsible Claude I/O.
 */

import LoadingSpinner from "../common/LoadingSpinner"
import ErrorMessage from "../common/ErrorMessage"
import type { ActorLogEntry } from "../../hooks/admin/useEnrichmentRuns"

/** Color map for actor log entry level badges */
const ACTOR_LOG_LEVEL_BADGE: Record<string, string> = {
  info: "bg-blue-800 text-blue-200",
  warn: "bg-yellow-800 text-yellow-200",
  error: "bg-red-800 text-red-200",
  debug: "bg-gray-700 text-gray-200",
}

/** Messages that contain large payloads shown in collapsible sections */
const COLLAPSIBLE_MESSAGES = new Set(["[CLAUDE_REQUEST]", "[CLAUDE_RESPONSE]"])

interface ActorLogsModalProps {
  title: string
  subtitle: string
  logEntries: ActorLogEntry[] | undefined
  isLoading: boolean
  error: Error | null
  onClose: () => void
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

export function ActorLogsModal({
  title,
  subtitle,
  logEntries,
  isLoading,
  error,
  onClose,
}: ActorLogsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-admin-border bg-admin-surface-elevated shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-admin-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-admin-text-primary">{title}</h3>
            <p className="text-sm text-admin-text-muted">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-admin-text-muted hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}
          {error && <ErrorMessage message="Failed to load actor logs" />}
          {logEntries && logEntries.length === 0 && (
            <p className="py-8 text-center text-admin-text-muted">No log entries recorded</p>
          )}
          {logEntries && logEntries.length > 0 && (
            <div className="space-y-2">
              {logEntries.map((entry, i) => (
                <ActorLogEntryRow key={i} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActorLogEntryRow({ entry }: { entry: ActorLogEntry }) {
  const isCollapsible = COLLAPSIBLE_MESSAGES.has(entry.message)
  const badgeColor = ACTOR_LOG_LEVEL_BADGE[entry.level] || "bg-gray-700 text-gray-200"

  return (
    <div className="rounded border border-admin-border px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-mono text-xs text-admin-text-muted">
          {formatTimestamp(entry.timestamp)}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${badgeColor}`}
        >
          {entry.level}
        </span>
        <span className="font-medium text-admin-text-primary">{entry.message}</span>
      </div>

      {entry.data && !isCollapsible && (
        <pre className="mt-1 overflow-x-auto rounded bg-admin-surface-base p-2 text-xs text-admin-text-secondary">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}

      {entry.data && isCollapsible && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-admin-text-muted hover:text-admin-text-secondary">
            {entry.message === "[CLAUDE_REQUEST]"
              ? `Prompt (${(entry.data.promptLength as number)?.toLocaleString() || "?"} chars)`
              : `Response (${(entry.data.inputTokens as number)?.toLocaleString() || "?"} in / ${(entry.data.outputTokens as number)?.toLocaleString() || "?"} out tokens, $${(entry.data.costUsd as number)?.toFixed(4) || "?"})`}
          </summary>
          <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-admin-surface-base p-2 text-xs text-admin-text-secondary">
            {entry.message === "[CLAUDE_REQUEST]"
              ? (entry.data.prompt as string)
              : (entry.data.response as string)}
          </pre>
        </details>
      )}
    </div>
  )
}
