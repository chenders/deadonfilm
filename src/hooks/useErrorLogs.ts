/**
 * React Query hooks for error log management
 *
 * Provides data fetching and mutations for the admin error logs UI.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ============================================================
// TYPES
// ============================================================

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace"
export type LogSource = "route" | "script" | "cronjob" | "middleware" | "startup" | "other"

export interface ErrorLog {
  id: number
  level: LogLevel
  source: LogSource
  message: string
  details: Record<string, unknown> | null
  request_id: string | null
  path: string | null
  method: string | null
  script_name: string | null
  job_name: string | null
  error_stack: string | null
  created_at: string
}

export interface ErrorLogsResponse {
  logs: ErrorLog[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface ErrorLogFilters {
  level?: LogLevel
  source?: LogSource
  search?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export interface ErrorLogStats {
  totals: {
    total_24h: number
    errors_24h: number
    fatals_24h: number
  }
  byLevel: Array<{
    level: LogLevel
    count: number
  }>
  bySource: Array<{
    source: LogSource
    count: number
  }>
  timeline: Array<{
    hour: string
    count: number
  }>
  topMessages: Array<{
    message_preview: string
    count: number
    last_occurred: string
  }>
}

// ============================================================
// QUERY KEYS
// ============================================================

export const errorLogKeys = {
  all: ["admin", "logs"] as const,
  list: (filters: ErrorLogFilters) => [...errorLogKeys.all, "list", filters] as const,
  detail: (id: number) => [...errorLogKeys.all, "detail", id] as const,
  stats: () => [...errorLogKeys.all, "stats"] as const,
}

// ============================================================
// FETCH FUNCTIONS
// ============================================================

async function fetchErrorLogs(filters: ErrorLogFilters): Promise<ErrorLogsResponse> {
  const params = new URLSearchParams()
  if (filters.page) params.set("page", String(filters.page))
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize))
  if (filters.level) params.set("level", filters.level)
  if (filters.source) params.set("source", filters.source)
  if (filters.search) params.set("search", filters.search)
  if (filters.startDate) params.set("startDate", filters.startDate)
  if (filters.endDate) params.set("endDate", filters.endDate)

  const response = await fetch(`/admin/api/logs?${params}`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch error logs")
  }
  return response.json()
}

async function fetchErrorLog(id: number): Promise<ErrorLog> {
  const response = await fetch(`/admin/api/logs/${id}`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch error log details")
  }
  return response.json()
}

async function fetchErrorLogStats(): Promise<ErrorLogStats> {
  const response = await fetch("/admin/api/logs/stats", {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch error log stats")
  }
  return response.json()
}

async function cleanupErrorLogs(
  daysToKeep: number
): Promise<{ success: boolean; deleted: number }> {
  const response = await fetch("/admin/api/logs/cleanup", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daysToKeep }),
  })
  if (!response.ok) {
    throw new Error("Failed to cleanup error logs")
  }
  return response.json()
}

// ============================================================
// QUERY HOOKS
// ============================================================

/**
 * Fetch paginated error logs with filters
 */
export function useErrorLogs(filters: ErrorLogFilters, refetchInterval?: number) {
  return useQuery({
    queryKey: errorLogKeys.list(filters),
    queryFn: () => fetchErrorLogs(filters),
    refetchInterval,
  })
}

/**
 * Fetch a single error log by ID
 */
export function useErrorLog(id: number) {
  return useQuery({
    queryKey: errorLogKeys.detail(id),
    queryFn: () => fetchErrorLog(id),
    enabled: id > 0,
  })
}

/**
 * Fetch aggregated error log statistics
 */
export function useErrorLogStats(refetchInterval?: number) {
  return useQuery({
    queryKey: errorLogKeys.stats(),
    queryFn: fetchErrorLogStats,
    refetchInterval,
  })
}

// ============================================================
// MUTATION HOOKS
// ============================================================

/**
 * Cleanup old error logs
 */
export function useCleanupErrorLogs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cleanupErrorLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: errorLogKeys.all })
    },
  })
}
