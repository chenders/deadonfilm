/**
 * Cronjob run tracking utilities.
 *
 * Provides functions to track the execution of cronjobs, including start time,
 * completion status, and error details for monitoring and debugging.
 */

import type { Pool } from "pg"

export interface CronjobRun {
  id: number
  job_name: string
  started_at: string
  completed_at: string | null
  status: "running" | "success" | "failure"
  error_message: string | null
  duration_ms: number | null
}

/**
 * Start tracking a cronjob run.
 *
 * @param pool - Database pool
 * @param jobName - Name of the cronjob (e.g., 'coverage-snapshot')
 * @returns Run ID for updating status later
 */
export async function startCronjobRun(pool: Pool, jobName: string): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `
    INSERT INTO cronjob_runs (job_name, status)
    VALUES ($1, 'running')
    RETURNING id
    `,
    [jobName]
  )

  return result.rows[0].id
}

/**
 * Mark a cronjob run as complete (success or failure).
 *
 * @param pool - Database pool
 * @param runId - Run ID from startCronjobRun
 * @param status - 'success' or 'failure'
 * @param errorMessage - Error details (only for failures)
 */
export async function completeCronjobRun(
  pool: Pool,
  runId: number,
  status: "success" | "failure",
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `
    UPDATE cronjob_runs
    SET
      completed_at = NOW(),
      status = $2,
      error_message = $3,
      duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
    WHERE id = $1
    `,
    [runId, status, errorMessage || null]
  )
}

/**
 * Get cronjob run history.
 *
 * @param pool - Database pool
 * @param jobName - Optional filter by job name
 * @param limit - Maximum number of runs to return (default: 100)
 * @returns Array of cronjob runs, ordered by most recent first
 */
export async function getCronjobRuns(
  pool: Pool,
  jobName?: string,
  limit: number = 100
): Promise<CronjobRun[]> {
  const params: (string | number)[] = []
  let whereClause = ""

  if (jobName) {
    params.push(jobName)
    whereClause = "WHERE job_name = $1"
  }

  params.push(limit)
  const limitParam = jobName ? "$2" : "$1"

  const result = await pool.query<CronjobRun>(
    `
    SELECT
      id,
      job_name,
      started_at,
      completed_at,
      status,
      error_message,
      duration_ms
    FROM cronjob_runs
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT ${limitParam}
    `,
    params
  )

  return result.rows
}

/**
 * Get cronjob run statistics.
 *
 * @param pool - Database pool
 * @param jobName - Job name to get stats for
 * @returns Statistics including success rate, average duration, recent failures
 */
export async function getCronjobStats(
  pool: Pool,
  jobName: string
): Promise<{
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  avg_duration_ms: number | null
  last_success_at: string | null
  last_failure_at: string | null
}> {
  const result = await pool.query(
    `
    SELECT
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'success') as successful_runs,
      COUNT(*) FILTER (WHERE status = 'failure') as failed_runs,
      CASE
        WHEN COUNT(*) > 0 THEN
          ROUND((COUNT(*) FILTER (WHERE status = 'success')::numeric / COUNT(*)) * 100, 2)
        ELSE 0
      END as success_rate,
      AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration_ms,
      MAX(completed_at) FILTER (WHERE status = 'success') as last_success_at,
      MAX(completed_at) FILTER (WHERE status = 'failure') as last_failure_at
    FROM cronjob_runs
    WHERE job_name = $1
    `,
    [jobName]
  )

  return result.rows[0]
}
