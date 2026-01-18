/**
 * Tests for the --us-actors-only query logic in enrich-death-details.ts.
 *
 * Uses PGlite to validate that the SQL query correctly filters actors
 * based on their appearances in US shows and US/English-language movies.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  getTestDb,
  closeTestDb,
  insertActor,
  insertShow,
  insertShowActorAppearance,
  insertMovie,
  insertMovieActorAppearance,
} from "../src/test/pglite-helper.js"
import type { PGlite } from "@electric-sql/pglite"

describe("enrich-death-details --us-actors-only query", () => {
  let db: PGlite

  beforeAll(async () => {
    db = await getTestDb()

    // Insert test actors
    // Actor 1: Appeared in a US show
    await insertActor(db, {
      tmdb_id: 1001,
      name: "US Show Actor",
      deathday: "2023-01-15",
      cause_of_death: "Natural causes",
    })

    // Actor 2: Appeared in a US movie
    await insertActor(db, {
      tmdb_id: 1002,
      name: "US Movie Actor",
      deathday: "2023-02-20",
      cause_of_death: "Natural causes",
    })

    // Actor 3: Appeared in an English-language movie (UK production)
    await insertActor(db, {
      tmdb_id: 1003,
      name: "UK English Movie Actor",
      deathday: "2023-03-10",
      cause_of_death: "Natural causes",
    })

    // Actor 4: Only appeared in non-US, non-English content
    await insertActor(db, {
      tmdb_id: 1004,
      name: "Foreign Only Actor",
      deathday: "2023-04-05",
      cause_of_death: "Natural causes",
    })

    // Actor 5: Appeared in both US and foreign content
    await insertActor(db, {
      tmdb_id: 1005,
      name: "Mixed Content Actor",
      deathday: "2023-05-01",
      cause_of_death: "Natural causes",
    })

    // Get actor IDs (PGlite generates them)
    const actorRows = await db.query<{ id: number; tmdb_id: number }>(
      "SELECT id, tmdb_id FROM actors ORDER BY tmdb_id"
    )
    const actorIdMap = new Map(actorRows.rows.map((r) => [r.tmdb_id, r.id]))

    // Insert shows
    await insertShow(db, {
      tmdb_id: 2001,
      name: "Breaking Bad",
      origin_country: ["US"],
    })

    await insertShow(db, {
      tmdb_id: 2002,
      name: "Sherlock",
      origin_country: ["GB"],
    })

    await insertShow(db, {
      tmdb_id: 2003,
      name: "Dark",
      origin_country: ["DE"],
    })

    // Insert movies
    await insertMovie(db, {
      tmdb_id: 3001,
      title: "Hollywood Blockbuster",
      production_countries: ["US"],
      original_language: "en",
    })

    await insertMovie(db, {
      tmdb_id: 3002,
      title: "James Bond",
      production_countries: ["GB"],
      original_language: "en",
    })

    await insertMovie(db, {
      tmdb_id: 3003,
      title: "Amélie",
      production_countries: ["FR"],
      original_language: "fr",
    })

    await insertMovie(db, {
      tmdb_id: 3004,
      title: "US-UK Co-Production",
      production_countries: ["US", "GB"],
      original_language: "en",
    })

    // Link actors to content
    // Actor 1001 (US Show Actor) -> US show only
    await insertShowActorAppearance(db, {
      actor_id: actorIdMap.get(1001)!,
      actor_tmdb_id: 1001,
      show_tmdb_id: 2001, // Breaking Bad (US)
    })

    // Actor 1002 (US Movie Actor) -> US movie only
    await insertMovieActorAppearance(db, {
      actor_id: actorIdMap.get(1002)!,
      movie_tmdb_id: 3001, // Hollywood Blockbuster (US)
    })

    // Actor 1003 (UK English Movie Actor) -> UK English movie only
    await insertMovieActorAppearance(db, {
      actor_id: actorIdMap.get(1003)!,
      movie_tmdb_id: 3002, // James Bond (GB, en)
    })

    // Actor 1004 (Foreign Only Actor) -> French movie and German show only
    await insertMovieActorAppearance(db, {
      actor_id: actorIdMap.get(1004)!,
      movie_tmdb_id: 3003, // Amélie (FR, fr)
    })
    await insertShowActorAppearance(db, {
      actor_id: actorIdMap.get(1004)!,
      actor_tmdb_id: 1004,
      show_tmdb_id: 2003, // Dark (DE)
    })

    // Actor 1005 (Mixed Content Actor) -> US show + foreign movie
    await insertShowActorAppearance(db, {
      actor_id: actorIdMap.get(1005)!,
      actor_tmdb_id: 1005,
      show_tmdb_id: 2001, // Breaking Bad (US)
    })
    await insertMovieActorAppearance(db, {
      actor_id: actorIdMap.get(1005)!,
      movie_tmdb_id: 3003, // Amélie (FR, fr)
    })
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it("filters actors to those with US show appearances", async () => {
    // This is the US show EXISTS subquery from enrich-death-details.ts
    const result = await db.query<{ id: number; name: string }>(`
      SELECT a.id, a.name
      FROM actors a
      WHERE a.deathday IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM actor_show_appearances asa
          JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
          WHERE asa.actor_id = a.id
          AND s.origin_country @> ARRAY['US']::text[]
        )
      ORDER BY a.name
    `)

    const names = result.rows.map((r) => r.name)
    expect(names).toContain("US Show Actor")
    expect(names).toContain("Mixed Content Actor")
    expect(names).not.toContain("US Movie Actor")
    expect(names).not.toContain("UK English Movie Actor")
    expect(names).not.toContain("Foreign Only Actor")
  })

  it("filters actors to those with US/English movie appearances", async () => {
    // This is the US/English movie EXISTS subquery from enrich-death-details.ts
    const result = await db.query<{ id: number; name: string }>(`
      SELECT a.id, a.name
      FROM actors a
      WHERE a.deathday IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM actor_movie_appearances ama
          JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
          WHERE ama.actor_id = a.id
          AND (
            m.production_countries @> ARRAY['US']::text[]
            OR m.original_language = 'en'
          )
        )
      ORDER BY a.name
    `)

    const names = result.rows.map((r) => r.name)
    expect(names).toContain("US Movie Actor")
    expect(names).toContain("UK English Movie Actor") // Matched via original_language = 'en'
    expect(names).not.toContain("US Show Actor")
    expect(names).not.toContain("Foreign Only Actor")
    expect(names).not.toContain("Mixed Content Actor") // Only has French movie, not English
  })

  it("combines US show OR US/English movie filter correctly", async () => {
    // This is the full combined filter from enrich-death-details.ts
    const result = await db.query<{ id: number; name: string }>(`
      SELECT a.id, a.name
      FROM actors a
      WHERE a.deathday IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM actor_show_appearances asa
            JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
            WHERE asa.actor_id = a.id
            AND s.origin_country @> ARRAY['US']::text[]
          )
          OR EXISTS (
            SELECT 1 FROM actor_movie_appearances ama
            JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
            WHERE ama.actor_id = a.id
            AND (
              m.production_countries @> ARRAY['US']::text[]
              OR m.original_language = 'en'
            )
          )
        )
      ORDER BY a.name
    `)

    const names = result.rows.map((r) => r.name)

    // Should include:
    expect(names).toContain("US Show Actor") // Has US show
    expect(names).toContain("US Movie Actor") // Has US movie
    expect(names).toContain("UK English Movie Actor") // Has English movie
    expect(names).toContain("Mixed Content Actor") // Has US show

    // Should exclude:
    expect(names).not.toContain("Foreign Only Actor") // Only has FR movie + DE show
  })

  it("excludes actors with only foreign non-English content", async () => {
    // Verify "Foreign Only Actor" has no US/English appearances
    const result = await db.query<{ id: number; name: string }>(`
      SELECT a.id, a.name
      FROM actors a
      WHERE a.name = 'Foreign Only Actor'
        AND (
          EXISTS (
            SELECT 1 FROM actor_show_appearances asa
            JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
            WHERE asa.actor_id = a.id
            AND s.origin_country @> ARRAY['US']::text[]
          )
          OR EXISTS (
            SELECT 1 FROM actor_movie_appearances ama
            JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
            WHERE ama.actor_id = a.id
            AND (
              m.production_countries @> ARRAY['US']::text[]
              OR m.original_language = 'en'
            )
          )
        )
    `)

    expect(result.rows.length).toBe(0)
  })
})
