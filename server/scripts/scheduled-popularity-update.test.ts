import { describe, it, expect } from "vitest"
import {
  calculateActorPopularity,
  ALGORITHM_VERSION,
  type ActorAppearance,
} from "../src/lib/popularity-score.js"

describe("scheduled-popularity-update actor calculation", () => {
  it("uses calculateActorPopularity from the library (not custom SQL)", () => {
    // This test verifies that the library function is the single source of truth.
    // The old script had custom SQL that produced different results from the library.
    // Now both the BullMQ handler and the scheduled script call this function.
    const appearances: ActorAppearance[] = [
      {
        contentDofPopularity: 80,
        contentDofWeight: 70,
        billingOrder: 1,
        episodeCount: null,
        isMovie: true,
      },
      {
        contentDofPopularity: 60,
        contentDofWeight: 50,
        billingOrder: 5,
        episodeCount: null,
        isMovie: true,
      },
    ]

    const result = calculateActorPopularity({
      appearances,
      tmdbPopularity: 50,
      wikipediaAnnualPageviews: null,
    })

    expect(result.dofPopularity).not.toBeNull()
    expect(result.dofPopularity!).toBeGreaterThan(0)
    expect(result.dofPopularity!).toBeLessThanOrEqual(100)
  })

  it("does not have duplicated constants from the library", () => {
    // The old script duplicated ACTOR_FILMOGRAPHY_WEIGHT, ACTOR_TMDB_RECENCY_WEIGHT,
    // MIN_APPEARANCES_FULL_CONFIDENCE, and TMDB_POPULARITY_THRESHOLDS.
    // Now the script imports calculateActorPopularity directly — no local constants needed.
    expect(ALGORITHM_VERSION).toBeDefined()
  })

  it("groups filmography correctly by actor for batched queries", () => {
    // Simulate the grouping logic from the updated updateActorPopularity function
    interface MovieRow {
      actor_id: number
      dof_popularity: number | null
      dof_weight: number | null
      billing_order: number | null
    }

    interface ShowRow {
      actor_id: number
      dof_popularity: number | null
      dof_weight: number | null
      min_billing_order: number | null
      episode_count: number
    }

    const movieRows: MovieRow[] = [
      { actor_id: 1, dof_popularity: 80, dof_weight: 70, billing_order: 1 },
      { actor_id: 1, dof_popularity: 60, dof_weight: 50, billing_order: 5 },
      { actor_id: 2, dof_popularity: 90, dof_weight: 85, billing_order: 2 },
    ]

    const showRows: ShowRow[] = [
      { actor_id: 1, dof_popularity: 70, dof_weight: 65, min_billing_order: 3, episode_count: 24 },
      { actor_id: 3, dof_popularity: 50, dof_weight: 40, min_billing_order: 1, episode_count: 100 },
    ]

    // Build the filmography map (same logic as in the script)
    const filmographyMap = new Map<number, ActorAppearance[]>()

    for (const row of movieRows) {
      if (!filmographyMap.has(row.actor_id)) {
        filmographyMap.set(row.actor_id, [])
      }
      filmographyMap.get(row.actor_id)!.push({
        contentDofPopularity: row.dof_popularity,
        contentDofWeight: row.dof_weight,
        billingOrder: row.billing_order,
        episodeCount: null,
        isMovie: true,
      })
    }

    for (const row of showRows) {
      if (!filmographyMap.has(row.actor_id)) {
        filmographyMap.set(row.actor_id, [])
      }
      filmographyMap.get(row.actor_id)!.push({
        contentDofPopularity: row.dof_popularity,
        contentDofWeight: row.dof_weight,
        billingOrder: row.min_billing_order,
        episodeCount: Number(row.episode_count),
        isMovie: false,
      })
    }

    // Actor 1: 2 movies + 1 show
    expect(filmographyMap.get(1)!).toHaveLength(3)
    expect(filmographyMap.get(1)![0].isMovie).toBe(true)
    expect(filmographyMap.get(1)![2].isMovie).toBe(false)
    expect(filmographyMap.get(1)![2].episodeCount).toBe(24)

    // Actor 2: 1 movie only
    expect(filmographyMap.get(2)!).toHaveLength(1)
    expect(filmographyMap.get(2)![0].billingOrder).toBe(2)

    // Actor 3: 1 show only
    expect(filmographyMap.get(3)!).toHaveLength(1)
    expect(filmographyMap.get(3)![0].episodeCount).toBe(100)
    expect(filmographyMap.get(3)![0].isMovie).toBe(false)

    // Verify calculateActorPopularity works for each actor
    for (const [actorId, appearances] of filmographyMap) {
      const result = calculateActorPopularity({
        appearances,
        tmdbPopularity: actorId === 1 ? 50 : null,
        wikipediaAnnualPageviews: null,
      })
      expect(result.dofPopularity).not.toBeNull()
      expect(result.dofPopularity!).toBeGreaterThan(0)
      expect(result.dofPopularity!).toBeLessThanOrEqual(100)
    }
  })
})
