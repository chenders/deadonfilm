/**
 * Popularity History Snapshot Recording
 *
 * Records popularity score snapshots into history tables for tracking
 * score changes over time and across algorithm versions.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE (upsert) on the unique constraint
 * (entity_id, snapshot_date, algorithm_version) so re-runs on the same day
 * update rather than duplicate.
 */

import type { Pool } from "pg"

export interface ActorSnapshotUpdate {
  id: number
  popularity: number
  confidence: number
}

export interface ContentSnapshotUpdate {
  id: number
  popularity: number
  weight: number
  confidence: number
}

/**
 * Record actor popularity snapshots into history table.
 */
export async function recordActorSnapshots(
  pool: Pool,
  updates: ActorSnapshotUpdate[],
  algorithmVersion: string,
  runId: number | null
): Promise<void> {
  if (updates.length === 0) return

  await pool.query(
    `
    INSERT INTO actor_popularity_history (actor_id, dof_popularity, dof_popularity_confidence, algorithm_version, run_id, snapshot_date)
    SELECT
      unnest($1::int[]),
      unnest($2::numeric[]),
      unnest($3::numeric[]),
      $4,
      $5,
      CURRENT_DATE
    ON CONFLICT (actor_id, snapshot_date, algorithm_version) DO UPDATE SET
      dof_popularity = EXCLUDED.dof_popularity,
      dof_popularity_confidence = EXCLUDED.dof_popularity_confidence,
      run_id = EXCLUDED.run_id,
      created_at = NOW()
    `,
    [
      updates.map((u) => u.id),
      updates.map((u) => u.popularity),
      updates.map((u) => u.confidence),
      algorithmVersion,
      runId,
    ]
  )
}

/**
 * Record movie popularity snapshots into history table.
 */
export async function recordMovieSnapshots(
  pool: Pool,
  updates: ContentSnapshotUpdate[],
  algorithmVersion: string,
  runId: number | null
): Promise<void> {
  if (updates.length === 0) return

  await pool.query(
    `
    INSERT INTO movie_popularity_history (movie_id, dof_popularity, dof_weight, dof_popularity_confidence, algorithm_version, run_id, snapshot_date)
    SELECT
      unnest($1::int[]),
      unnest($2::numeric[]),
      unnest($3::numeric[]),
      unnest($4::numeric[]),
      $5,
      $6,
      CURRENT_DATE
    ON CONFLICT (movie_id, snapshot_date, algorithm_version) DO UPDATE SET
      dof_popularity = EXCLUDED.dof_popularity,
      dof_weight = EXCLUDED.dof_weight,
      dof_popularity_confidence = EXCLUDED.dof_popularity_confidence,
      run_id = EXCLUDED.run_id,
      created_at = NOW()
    `,
    [
      updates.map((u) => u.id),
      updates.map((u) => u.popularity),
      updates.map((u) => u.weight),
      updates.map((u) => u.confidence),
      algorithmVersion,
      runId,
    ]
  )
}

/**
 * Record show popularity snapshots into history table.
 */
export async function recordShowSnapshots(
  pool: Pool,
  updates: ContentSnapshotUpdate[],
  algorithmVersion: string,
  runId: number | null
): Promise<void> {
  if (updates.length === 0) return

  await pool.query(
    `
    INSERT INTO show_popularity_history (show_id, dof_popularity, dof_weight, dof_popularity_confidence, algorithm_version, run_id, snapshot_date)
    SELECT
      unnest($1::int[]),
      unnest($2::numeric[]),
      unnest($3::numeric[]),
      unnest($4::numeric[]),
      $5,
      $6,
      CURRENT_DATE
    ON CONFLICT (show_id, snapshot_date, algorithm_version) DO UPDATE SET
      dof_popularity = EXCLUDED.dof_popularity,
      dof_weight = EXCLUDED.dof_weight,
      dof_popularity_confidence = EXCLUDED.dof_popularity_confidence,
      run_id = EXCLUDED.run_id,
      created_at = NOW()
    `,
    [
      updates.map((u) => u.id),
      updates.map((u) => u.popularity),
      updates.map((u) => u.weight),
      updates.map((u) => u.confidence),
      algorithmVersion,
      runId,
    ]
  )
}
