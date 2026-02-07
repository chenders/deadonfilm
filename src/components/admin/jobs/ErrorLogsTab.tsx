/**
 * Error Logs Tab
 *
 * Displays paginated error logs with filters for level, source, and search.
 * Includes stats dashboard and expandable rows for stack traces.
 * Extracted from LogsPage for use in the Jobs & Logs hub.
 */

import { Fragment, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Card, StatCard, Skeleton, type Column } from "../ui"
import DateInput from "../common/DateInput"
import {
  useErrorLogs,
  useErrorLogStats,
  useCleanupErrorLogs,
  type ErrorLog,
  type ErrorLogFilters,
  type LogLevel,
  type LogSource,
} from "../../../hooks/useErrorLogs"
import { useDebouncedSearchParam } from "../../../hooks/useDebouncedSearchParam"
import MobileCard from "../ui/MobileCard"

// Level badge styles
const levelStyles: Record<LogLevel, string> = {
  fatal: "bg-red-600/20 text-red-500",
  error: "bg-admin-danger/20 text-admin-danger",
  warn: "bg-admin-warning/20 text-admin-warning",
  info: "bg-admin-info-bg text-admin-interactive",
  debug: "bg-admin-text-muted/20 text-admin-text-muted",
  trace: "bg-admin-surface-inset text-admin-text-muted",
}

// Source badge styles
const sourceStyles: Record<LogSource, string> = {
  route: "bg-blue-500/20 text-blue-400",
  script: "bg-purple-500/20 text-purple-400",
  cronjob: "bg-green-500/20 text-green-400",
  middleware: "bg-orange-500/20 text-orange-400",
  startup: "bg-cyan-500/20 text-cyan-400",
  other: "bg-admin-surface-inset text-admin-text-muted",
}

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase ${levelStyles[level] || levelStyles.info}`}
    >
      {level}
    </span>
  )
}

function SourceBadge({ source }: { source: LogSource }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${sourceStyles[source] || sourceStyles.other}`}
    >
      {source}
    </span>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  return `${diffDay}d ago`
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

// Validate and constrain pagination parameters
function parsePositiveInt(value: string | null, defaultValue: number, max: number): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1) return defaultValue
  return Math.min(parsed, max)
}

// Valid values for validation
const VALID_LEVELS: LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace"]
const VALID_SOURCES: LogSource[] = ["route", "script", "cronjob", "middleware", "startup", "other"]

// Validate level from URL - returns undefined if invalid
function parseLogLevel(value: string | null): LogLevel | undefined {
  if (!value) return undefined
  return VALID_LEVELS.includes(value as LogLevel) ? (value as LogLevel) : undefined
}

// Validate source from URL - returns undefined if invalid
function parseLogSource(value: string | null): LogSource | undefined {
  if (!value) return undefined
  return VALID_SOURCES.includes(value as LogSource) ? (value as LogSource) : undefined
}

export default function ErrorLogsTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [cleanupDays, setCleanupDays] = useState(30)

  // Debounced search input - provides immediate input feedback with 300ms debounced URL updates
  const [searchInput, setSearchInput] = useDebouncedSearchParam({
    paramName: "search",
    debounceMs: 300,
    resetPageOnChange: true,
  })

  // Parse filters from URL with validation
  const filters: ErrorLogFilters = {
    page: parsePositiveInt(searchParams.get("page"), 1, 10000),
    pageSize: parsePositiveInt(searchParams.get("pageSize"), 50, 100),
    level: parseLogLevel(searchParams.get("level")),
    source: parseLogSource(searchParams.get("source")),
    search: searchParams.get("search") || undefined,
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
  }

  const refetchInterval = autoRefresh ? 5000 : undefined
  const { data, isLoading, error } = useErrorLogs(filters, refetchInterval)
  const { data: statsData, isLoading: statsLoading } = useErrorLogStats(refetchInterval)
  const cleanupMutation = useCleanupErrorLogs()

  // State for expanded error rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Update URL params
  const updateFilters = (newFilters: Partial<ErrorLogFilters>) => {
    const params = new URLSearchParams()
    const merged = { ...filters, ...newFilters }

    // Preserve the tab param so we stay on the logs tab
    const currentTab = searchParams.get("tab")
    if (currentTab) params.set("tab", currentTab)

    if (merged.page && merged.page > 1) params.set("page", String(merged.page))
    if (merged.pageSize && merged.pageSize !== 50) params.set("pageSize", String(merged.pageSize))
    if (merged.level) params.set("level", merged.level)
    if (merged.source) params.set("source", merged.source)
    if (merged.search) params.set("search", merged.search)
    if (merged.startDate) params.set("startDate", merged.startDate)
    if (merged.endDate) params.set("endDate", merged.endDate)

    setSearchParams(params)
  }

  // Table columns
  const columns: Column<ErrorLog>[] = [
    {
      key: "created_at",
      label: "Time",
      width: "120px",
      render: (row) => (
        <span className="text-sm text-admin-text-muted" title={formatTimestamp(row.created_at)}>
          {formatRelativeTime(row.created_at)}
        </span>
      ),
    },
    {
      key: "level",
      label: "Level",
      width: "80px",
      render: (row) => <LevelBadge level={row.level} />,
    },
    {
      key: "source",
      label: "Source",
      width: "100px",
      render: (row) => <SourceBadge source={row.source} />,
    },
    {
      key: "message",
      label: "Message",
      render: (row) => (
        <div className="max-w-[200px] md:max-w-xl">
          <div className="truncate text-sm text-admin-text-primary" title={row.message}>
            {row.message}
          </div>
          {row.path && (
            <div className="mt-0.5 font-mono text-xs text-admin-text-muted">
              {row.method} {row.path}
            </div>
          )}
          {row.script_name && (
            <div className="mt-0.5 font-mono text-xs text-admin-text-muted">{row.script_name}</div>
          )}
          {row.job_name && (
            <div className="mt-0.5 font-mono text-xs text-admin-text-muted">{row.job_name}</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      width: "80px",
      render: (row) => (
        <button
          onClick={() => toggleExpanded(row.id)}
          className="rounded p-2.5 text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary"
          title="Toggle details"
          aria-label={expandedRows.has(row.id) ? "Collapse details" : "Expand details"}
          aria-expanded={expandedRows.has(row.id)}
        >
          <svg
            className={`h-4 w-4 transition-transform ${expandedRows.has(row.id) ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ),
    },
  ]

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton.StatCard key={i} />
          ))}
        </div>
        <Skeleton.Table rows={10} columns={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <svg
          className="mx-auto h-12 w-12 text-admin-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="mt-4 text-admin-danger">Failed to load error logs</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-admin-interactive px-4 py-2 text-sm font-medium text-white hover:bg-admin-interactive-hover"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Auto-refresh toggle */}
      <div className="flex justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-admin-text-secondary">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-admin-interactive"
          />
          Auto-refresh
        </label>
      </div>

      {/* Stats Cards */}
      {!statsLoading && statsData && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total (24h)"
            value={statsData.totals.total_24h?.toLocaleString() || "0"}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
          />
          <StatCard
            label="Errors (24h)"
            value={statsData.totals.errors_24h?.toLocaleString() || "0"}
            variant={statsData.totals.errors_24h > 0 ? "danger" : "default"}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
          <StatCard
            label="Fatal (24h)"
            value={statsData.totals.fatals_24h?.toLocaleString() || "0"}
            variant={statsData.totals.fatals_24h > 0 ? "danger" : "default"}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            }
          />
          <StatCard
            label="Sources Active"
            value={statsData.bySource?.length?.toString() || "0"}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
            }
          />
        </div>
      )}

      {/* Top Error Messages */}
      {statsData && statsData.topMessages && statsData.topMessages.length > 0 && (
        <Card title="Top Error Messages (24h)">
          <div className="space-y-2">
            {statsData.topMessages.slice(0, 5).map((msg, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-md bg-admin-surface-inset p-2"
              >
                <span
                  className="truncate text-sm text-admin-text-secondary"
                  title={msg.message_preview}
                >
                  {msg.message_preview}
                </span>
                <span className="bg-admin-danger/20 ml-2 shrink-0 rounded px-2 py-0.5 text-xs font-medium text-admin-danger">
                  {msg.count}x
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-3">
          <div className="col-span-1">
            <label
              htmlFor="filter-level"
              className="mb-1 block text-xs font-medium text-admin-text-muted"
            >
              Level
            </label>
            <select
              id="filter-level"
              value={filters.level || ""}
              onChange={(e) =>
                updateFilters({ level: (e.target.value as LogLevel) || undefined, page: 1 })
              }
              className="min-h-[44px] w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none md:w-auto"
            >
              <option value="">All Levels</option>
              <option value="fatal">Fatal</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
              <option value="trace">Trace</option>
            </select>
          </div>

          <div className="col-span-1">
            <label
              htmlFor="filter-source"
              className="mb-1 block text-xs font-medium text-admin-text-muted"
            >
              Source
            </label>
            <select
              id="filter-source"
              value={filters.source || ""}
              onChange={(e) =>
                updateFilters({ source: (e.target.value as LogSource) || undefined, page: 1 })
              }
              className="min-h-[44px] w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none md:w-auto"
            >
              <option value="">All Sources</option>
              <option value="route">Route</option>
              <option value="script">Script</option>
              <option value="cronjob">Cron Job</option>
              <option value="middleware">Middleware</option>
              <option value="startup">Startup</option>
              <option value="other">Other</option>
            </select>
          </div>

          <DateInput
            id="filter-start-date"
            label="From"
            value={filters.startDate || ""}
            onChange={(value) => updateFilters({ startDate: value || undefined, page: 1 })}
            helpText=""
            showClearButton={true}
            className="col-span-1 w-full md:w-36"
          />

          <DateInput
            id="filter-end-date"
            label="To"
            value={filters.endDate || ""}
            onChange={(value) => updateFilters({ endDate: value || undefined, page: 1 })}
            helpText=""
            showClearButton={true}
            className="col-span-1 w-full md:w-36"
          />

          <div className="col-span-2 md:flex-1">
            <label
              htmlFor="filter-search"
              className="mb-1 block text-xs font-medium text-admin-text-muted"
            >
              Search
            </label>
            <input
              id="filter-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search in message..."
              className="min-h-[44px] w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-1.5 text-sm text-admin-text-primary placeholder-admin-text-muted focus:border-admin-interactive focus:outline-none"
            />
          </div>

          {(filters.level ||
            filters.source ||
            searchInput ||
            filters.startDate ||
            filters.endDate) && (
            <div className="col-span-2 flex items-end md:col-span-1">
              <button
                onClick={() => {
                  setSearchInput("")
                  updateFilters({
                    level: undefined,
                    source: undefined,
                    search: undefined,
                    startDate: undefined,
                    endDate: undefined,
                    page: 1,
                  })
                }}
                className="min-h-[44px] w-full rounded-md px-3 py-1.5 text-sm text-admin-text-muted hover:bg-admin-surface-overlay hover:text-admin-text-primary md:w-auto"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated">
        {/* Mobile card view */}
        <div className="space-y-3 p-4 md:hidden">
          {data?.logs.map((row) => (
            <div key={row.id}>
              <MobileCard
                data-testid={`error-log-card-${row.id}`}
                title={
                  <div className="flex items-center gap-2">
                    <LevelBadge level={row.level} />
                    <SourceBadge source={row.source} />
                  </div>
                }
                subtitle={
                  <span title={formatTimestamp(row.created_at)}>
                    {formatRelativeTime(row.created_at)}
                  </span>
                }
                fields={[
                  {
                    label: "Message",
                    value: (
                      <span className="line-clamp-2 text-admin-text-primary" title={row.message}>
                        {row.message}
                      </span>
                    ),
                  },
                  ...(row.path
                    ? [
                        {
                          label: "Request",
                          value: (
                            <span className="font-mono text-xs">
                              {row.method} {row.path}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  ...(row.script_name
                    ? [
                        {
                          label: "Script",
                          value: <span className="font-mono text-xs">{row.script_name}</span>,
                        },
                      ]
                    : []),
                ]}
                actions={
                  <button
                    onClick={() => toggleExpanded(row.id)}
                    className="rounded bg-admin-interactive-secondary px-3 py-1.5 text-xs text-admin-text-primary hover:bg-admin-surface-overlay"
                    aria-label={expandedRows.has(row.id) ? "Collapse details" : "Expand details"}
                    aria-expanded={expandedRows.has(row.id)}
                  >
                    {expandedRows.has(row.id) ? "Hide Details" : "Show Details"}
                  </button>
                }
              />
              {expandedRows.has(row.id) && (
                <div className="mt-2 rounded-lg border border-admin-border bg-admin-surface-inset p-3 text-sm">
                  <div className="space-y-3">
                    <div>
                      <div className="font-medium text-admin-text-primary">Message:</div>
                      <div className="mt-1 whitespace-pre-wrap text-admin-text-secondary">
                        {row.message}
                      </div>
                    </div>
                    {(row.request_id || row.path) && (
                      <div>
                        <div className="font-medium text-admin-text-primary">Request:</div>
                        <div className="mt-1 font-mono text-xs text-admin-text-muted">
                          {row.request_id && <div>ID: {row.request_id}</div>}
                          {row.path && (
                            <div>
                              {row.method} {row.path}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {row.details && Object.keys(row.details).length > 0 && (
                      <div>
                        <div className="font-medium text-admin-text-primary">Details:</div>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-admin-surface-overlay p-2 font-mono text-xs text-admin-text-muted">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      </div>
                    )}
                    {row.error_stack && (
                      <div>
                        <div className="font-medium text-admin-danger">Stack Trace:</div>
                        <pre className="mt-1 max-h-60 overflow-auto rounded bg-admin-surface-overlay p-2 font-mono text-xs text-admin-text-muted">
                          {row.error_stack}
                        </pre>
                      </div>
                    )}
                    <div className="text-xs text-admin-text-muted">
                      Logged at: {formatTimestamp(row.created_at)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="-mx-4 hidden overflow-x-auto px-4 sm:mx-0 sm:px-0 md:block">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-admin-border bg-admin-surface-inset">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-admin-text-muted ${
                      col.align === "center"
                        ? "text-center"
                        : col.align === "right"
                          ? "text-right"
                          : "text-left"
                    }`}
                    style={{ width: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border-subtle">
              {data?.logs.map((row, rowIndex) => (
                <Fragment key={row.id}>
                  <tr className="hover:bg-admin-surface-overlay">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 ${
                          col.align === "center"
                            ? "text-center"
                            : col.align === "right"
                              ? "text-right"
                              : "text-left"
                        }`}
                      >
                        {col.render
                          ? col.render(row, rowIndex)
                          : String((row as unknown as Record<string, unknown>)[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                  {/* Expanded details row */}
                  {expandedRows.has(row.id) && (
                    <tr className="bg-admin-surface-inset">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <div className="space-y-3 text-sm">
                          {/* Full message */}
                          <div>
                            <div className="font-medium text-admin-text-primary">Message:</div>
                            <div className="mt-1 whitespace-pre-wrap text-admin-text-secondary">
                              {row.message}
                            </div>
                          </div>

                          {/* Request info */}
                          {(row.request_id || row.path) && (
                            <div>
                              <div className="font-medium text-admin-text-primary">Request:</div>
                              <div className="mt-1 font-mono text-xs text-admin-text-muted">
                                {row.request_id && <div>ID: {row.request_id}</div>}
                                {row.path && (
                                  <div>
                                    {row.method} {row.path}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Details JSON */}
                          {row.details && Object.keys(row.details).length > 0 && (
                            <div>
                              <div className="font-medium text-admin-text-primary">Details:</div>
                              <pre className="mt-1 max-h-40 overflow-auto rounded bg-admin-surface-overlay p-2 font-mono text-xs text-admin-text-muted">
                                {JSON.stringify(row.details, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Stack trace */}
                          {row.error_stack && (
                            <div>
                              <div className="font-medium text-admin-danger">Stack Trace:</div>
                              <pre className="mt-1 max-h-60 overflow-auto rounded bg-admin-surface-overlay p-2 font-mono text-xs text-admin-text-muted">
                                {row.error_stack}
                              </pre>
                            </div>
                          )}

                          {/* Timestamp */}
                          <div className="text-xs text-admin-text-muted">
                            Logged at: {formatTimestamp(row.created_at)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.total > 0 && (
          <div className="flex items-center justify-between border-t border-admin-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-admin-text-muted">
              <span>
                Showing{" "}
                {Math.min(
                  (data.pagination.page - 1) * data.pagination.pageSize + 1,
                  data.pagination.total
                )}{" "}
                to{" "}
                {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)}{" "}
                of {data.pagination.total}
              </span>
              <select
                value={filters.pageSize || 50}
                onChange={(e) => updateFilters({ pageSize: Number(e.target.value), page: 1 })}
                className="rounded border border-admin-border bg-admin-surface-overlay px-2 py-1 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
              >
                {[20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}/page
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateFilters({ page: data.pagination.page - 1 })}
                disabled={data.pagination.page <= 1}
                className="rounded p-2.5 text-admin-text-muted transition-colors hover:bg-admin-surface-overlay hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous page"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <span className="px-3 text-sm text-admin-text-secondary">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => updateFilters({ page: data.pagination.page + 1 })}
                disabled={data.pagination.page >= data.pagination.totalPages}
                className="rounded p-2.5 text-admin-text-muted transition-colors hover:bg-admin-surface-overlay hover:text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next page"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {data?.logs.length === 0 && (
          <div className="py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-admin-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mt-4 text-sm text-admin-text-muted">No error logs found</p>
            {(filters.level ||
              filters.source ||
              filters.search ||
              filters.startDate ||
              filters.endDate) && (
              <button
                onClick={() => {
                  setSearchInput("")
                  updateFilters({
                    level: undefined,
                    source: undefined,
                    search: undefined,
                    startDate: undefined,
                    endDate: undefined,
                    page: 1,
                  })
                }}
                className="mt-2 text-sm text-admin-interactive hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cleanup Section */}
      <Card title="Maintenance">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="cleanup-days"
              className="mb-1 block text-sm font-medium text-admin-text-primary"
            >
              Delete logs older than
            </label>
            <select
              id="cleanup-days"
              value={cleanupDays}
              onChange={(e) => setCleanupDays(Number(e.target.value))}
              className="w-full rounded-md border border-admin-border bg-admin-surface-overlay px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none sm:w-48"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <button
            onClick={() => cleanupMutation.mutate(cleanupDays)}
            disabled={cleanupMutation.isPending}
            className="rounded-md bg-admin-surface-overlay px-4 py-2 text-sm font-medium text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cleanupMutation.isPending ? "Cleaning..." : "Run Cleanup"}
          </button>
        </div>
        {cleanupMutation.isSuccess && (
          <p className="mt-3 text-sm text-admin-success">
            Deleted {cleanupMutation.data.deleted} log entries
          </p>
        )}
      </Card>
    </div>
  )
}
