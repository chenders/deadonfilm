/**
 * React Query hooks for job queue management
 *
 * Provides data fetching and mutations for the admin job queue UI.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ============================================================
// TYPES
// ============================================================

export interface QueueStats {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  isPaused: boolean
}

export interface QueuesResponse {
  queues: QueueStats[]
}

export interface JobRun {
  id: number
  job_id: string
  job_type: string
  queue_name: string
  status: "pending" | "active" | "completed" | "failed" | "delayed" | "cancelled"
  priority: number
  queued_at: string
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  attempts: number
  max_attempts: number
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error_message: string | null
  error_stack: string | null
  worker_id: string | null
  created_by: string | null
}

export interface JobRunsResponse {
  runs: JobRun[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface JobRunFilters {
  status?: string
  jobType?: string
  queueName?: string
  page?: number
  pageSize?: number
}

export interface DeadLetterJob {
  id: number
  job_id: string
  job_type: string
  queue_name: string
  failed_at: string
  attempts: number
  final_error: string
  payload: Record<string, unknown>
  reviewed: boolean
  review_notes: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface DeadLetterResponse {
  jobs: DeadLetterJob[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface JobStats {
  successRates: Array<{
    job_type: string
    total: number
    completed: number
    success_rate: string
  }>
  durations: Array<{
    job_type: string
    avg_ms: number
    median_ms: number
    p95_ms: number
  }>
  deadLetterQueue: Array<{
    job_type: string
    count: number
    most_recent: string
  }>
}

export interface QueueDetailResponse {
  name: string
  stats: {
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    isPaused: boolean
  }
  recentJobs: Array<{
    id: string
    name: string
    data: Record<string, unknown>
    progress: number
    attemptsMade: number
    timestamp: number
    processedOn: number | null
    finishedOn: number | null
    failedReason: string | null
  }>
}

// ============================================================
// QUERY KEYS
// ============================================================

export const jobQueueKeys = {
  all: ["admin", "jobs"] as const,
  queues: () => [...jobQueueKeys.all, "queues"] as const,
  queue: (name: string) => [...jobQueueKeys.all, "queue", name] as const,
  runs: (filters: JobRunFilters) => [...jobQueueKeys.all, "runs", filters] as const,
  run: (id: number) => [...jobQueueKeys.all, "run", id] as const,
  deadLetter: (page: number, pageSize: number, reviewed: boolean) =>
    [...jobQueueKeys.all, "dead-letter", { page, pageSize, reviewed }] as const,
  stats: () => [...jobQueueKeys.all, "stats"] as const,
}

// ============================================================
// FETCH FUNCTIONS
// ============================================================

async function fetchQueues(): Promise<QueuesResponse> {
  const response = await fetch("/admin/api/jobs/queues", {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch queue stats")
  }
  return response.json()
}

async function fetchQueueDetail(name: string): Promise<QueueDetailResponse> {
  const response = await fetch(`/admin/api/jobs/queue/${name}`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch queue details")
  }
  return response.json()
}

async function fetchJobRuns(filters: JobRunFilters): Promise<JobRunsResponse> {
  const params = new URLSearchParams()
  if (filters.page) params.set("page", String(filters.page))
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize))
  if (filters.status) params.set("status", filters.status)
  if (filters.jobType) params.set("jobType", filters.jobType)
  if (filters.queueName) params.set("queueName", filters.queueName)

  const response = await fetch(`/admin/api/jobs/runs?${params}`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch job runs")
  }
  return response.json()
}

async function fetchJobRun(id: number): Promise<JobRun> {
  const response = await fetch(`/admin/api/jobs/runs/${id}`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch job run details")
  }
  return response.json()
}

async function fetchDeadLetter(
  page: number,
  pageSize: number,
  reviewed: boolean
): Promise<DeadLetterResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    reviewed: String(reviewed),
  })

  const response = await fetch(`/admin/api/jobs/dead-letter?${params}`, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch dead letter queue")
  }
  return response.json()
}

async function fetchJobStats(): Promise<JobStats> {
  const response = await fetch("/admin/api/jobs/stats", {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch job stats")
  }
  return response.json()
}

// ============================================================
// MUTATION FUNCTIONS
// ============================================================

async function retryJob(id: number): Promise<{ success: boolean; jobId: string }> {
  const response = await fetch(`/admin/api/jobs/runs/${id}/retry`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to retry job")
  }
  return response.json()
}

async function pauseQueue(name: string): Promise<{ success: boolean }> {
  const response = await fetch(`/admin/api/jobs/queue/${name}/pause`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to pause queue")
  }
  return response.json()
}

async function resumeQueue(name: string): Promise<{ success: boolean }> {
  const response = await fetch(`/admin/api/jobs/queue/${name}/resume`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error("Failed to resume queue")
  }
  return response.json()
}

async function cleanupJobs(gracePeriod: number): Promise<{ success: boolean; cleaned: number }> {
  const response = await fetch("/admin/api/jobs/cleanup", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gracePeriod }),
  })
  if (!response.ok) {
    throw new Error("Failed to cleanup jobs")
  }
  return response.json()
}

async function reviewDeadLetterJob(
  id: number,
  notes?: string
): Promise<{ success: boolean }> {
  const response = await fetch(`/admin/api/jobs/dead-letter/${id}/review`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  })
  if (!response.ok) {
    throw new Error("Failed to mark job as reviewed")
  }
  return response.json()
}

// ============================================================
// QUERY HOOKS
// ============================================================

/**
 * Fetch all queue stats with optional auto-refresh
 */
export function useQueueStats(refetchInterval = 3000) {
  return useQuery({
    queryKey: jobQueueKeys.queues(),
    queryFn: fetchQueues,
    refetchInterval,
  })
}

/**
 * Fetch detailed stats for a specific queue
 */
export function useQueueDetail(name: string) {
  return useQuery({
    queryKey: jobQueueKeys.queue(name),
    queryFn: () => fetchQueueDetail(name),
    enabled: !!name,
  })
}

/**
 * Fetch paginated job runs with filters
 */
export function useJobRuns(filters: JobRunFilters) {
  return useQuery({
    queryKey: jobQueueKeys.runs(filters),
    queryFn: () => fetchJobRuns(filters),
  })
}

/**
 * Fetch a single job run by ID
 */
export function useJobRun(id: number) {
  return useQuery({
    queryKey: jobQueueKeys.run(id),
    queryFn: () => fetchJobRun(id),
    enabled: id > 0,
  })
}

/**
 * Fetch dead letter queue with pagination
 */
export function useDeadLetterQueue(page = 1, pageSize = 20, reviewed = false) {
  return useQuery({
    queryKey: jobQueueKeys.deadLetter(page, pageSize, reviewed),
    queryFn: () => fetchDeadLetter(page, pageSize, reviewed),
  })
}

/**
 * Fetch aggregated job statistics
 */
export function useJobStats() {
  return useQuery({
    queryKey: jobQueueKeys.stats(),
    queryFn: fetchJobStats,
  })
}

// ============================================================
// MUTATION HOOKS
// ============================================================

/**
 * Retry a failed job
 */
export function useRetryJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: retryJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobQueueKeys.all })
    },
  })
}

/**
 * Pause a queue
 */
export function usePauseQueue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: pauseQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobQueueKeys.queues() })
    },
  })
}

/**
 * Resume a paused queue
 */
export function useResumeQueue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resumeQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobQueueKeys.queues() })
    },
  })
}

/**
 * Cleanup old completed jobs
 */
export function useCleanupJobs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cleanupJobs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobQueueKeys.all })
    },
  })
}

/**
 * Mark a dead letter job as reviewed
 */
export function useReviewDeadLetterJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      reviewDeadLetterJob(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobQueueKeys.all })
    },
  })
}
