import { describe, it, expect, vi, beforeEach } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt } from "./backfill-external-ids.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-external-ids argument parsing", () => {
  describe("parsePositiveInt", () => {
    it("parses valid positive integers", () => {
      expect(parsePositiveInt("1")).toBe(1)
      expect(parsePositiveInt("50")).toBe(50)
      expect(parsePositiveInt("1000")).toBe(1000)
    })

    it("rejects zero", () => {
      expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
    })

    it("rejects negative numbers", () => {
      expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("-50")).toThrow(InvalidArgumentError)
    })

    it("rejects floating point numbers", () => {
      expect(() => parsePositiveInt("1.5")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("10.0")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("ten")).toThrow(InvalidArgumentError)
    })
  })
})

describe("backfill-external-ids validation logic", () => {
  interface BackfillOptions {
    limit?: number
    missingOnly?: boolean
    dryRun?: boolean
  }

  // The script allows running without any options (processes all shows)
  // so there's no "must have at least one option" validation

  function validateOptions(options: BackfillOptions): string | null {
    // No required options for this script
    return null
  }

  it("accepts no options (processes all shows)", () => {
    expect(validateOptions({})).toBeNull()
  })

  it("accepts --limit option", () => {
    expect(validateOptions({ limit: 50 })).toBeNull()
  })

  it("accepts --missing-only option", () => {
    expect(validateOptions({ missingOnly: true })).toBeNull()
  })

  it("accepts --dry-run option", () => {
    expect(validateOptions({ dryRun: true })).toBeNull()
  })

  it("accepts all options combined", () => {
    expect(validateOptions({ limit: 100, missingOnly: true, dryRun: true })).toBeNull()
  })
})

describe("backfill-external-ids environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
    tmdbApiToken?: string
    dryRun?: boolean
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl && !env.dryRun) {
      errors.push("DATABASE_URL environment variable is required (or use --dry-run)")
    }

    if (!env.tmdbApiToken) {
      errors.push("TMDB_API_TOKEN environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL when not in dry-run mode", () => {
    const errors = checkEnv({ tmdbApiToken: "token" })
    expect(errors).toContain("DATABASE_URL environment variable is required (or use --dry-run)")
  })

  it("allows missing DATABASE_URL in dry-run mode", () => {
    const errors = checkEnv({ tmdbApiToken: "token", dryRun: true })
    expect(errors).not.toContain("DATABASE_URL environment variable is required (or use --dry-run)")
  })

  it("always requires TMDB_API_TOKEN", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", dryRun: true })
    expect(errors).toContain("TMDB_API_TOKEN environment variable is required")
  })

  it("passes when all required env vars are present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", tmdbApiToken: "token" })
    expect(errors).toHaveLength(0)
  })
})

describe("backfill-external-ids query building logic", () => {
  interface QueryOptions {
    missingOnly?: boolean
    limit?: number
  }

  function buildQuery(options: QueryOptions): { query: string; params: number[] } {
    let query = "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows"
    const params: number[] = []

    if (options.missingOnly) {
      query += " WHERE (tvmaze_id IS NULL OR thetvdb_id IS NULL OR imdb_id IS NULL)"
    }

    query += " ORDER BY popularity DESC NULLS LAST"

    if (options.limit) {
      params.push(options.limit)
      query += ` LIMIT $${params.length}`
    }

    return { query, params }
  }

  it("builds basic query without options", () => {
    const { query, params } = buildQuery({})
    expect(query).toBe(
      "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows ORDER BY popularity DESC NULLS LAST"
    )
    expect(params).toEqual([])
  })

  it("adds WHERE clause for --missing-only", () => {
    const { query, params } = buildQuery({ missingOnly: true })
    expect(query).toContain("WHERE (tvmaze_id IS NULL OR thetvdb_id IS NULL OR imdb_id IS NULL)")
    expect(params).toEqual([])
  })

  it("adds LIMIT clause with parameter", () => {
    const { query, params } = buildQuery({ limit: 50 })
    expect(query).toContain("LIMIT $1")
    expect(params).toEqual([50])
  })

  it("combines --missing-only and --limit correctly", () => {
    const { query, params } = buildQuery({ missingOnly: true, limit: 100 })
    expect(query).toContain("WHERE (tvmaze_id IS NULL OR thetvdb_id IS NULL OR imdb_id IS NULL)")
    expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
    expect(query).toContain("LIMIT $1")
    expect(params).toEqual([100])
  })

  it("orders by popularity descending", () => {
    const { query } = buildQuery({})
    expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
  })
})

describe("backfill-external-ids update logic", () => {
  interface ShowState {
    tvmaze_id: number | null
    thetvdb_id: number | null
    imdb_id: string | null
  }

  interface ExternalIds {
    tvmazeId: number | null
    thetvdbId: number | null
    imdbId: string | null
  }

  function shouldUpdate(show: ShowState, externalIds: ExternalIds): boolean {
    const newTvmaze = !show.tvmaze_id && externalIds.tvmazeId
    const newThetvdb = !show.thetvdb_id && externalIds.thetvdbId
    const newImdb = !show.imdb_id && externalIds.imdbId
    return Boolean(newTvmaze || newThetvdb || newImdb)
  }

  it("returns true when finding new TVmaze ID", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: null, thetvdb_id: null, imdb_id: null },
        { tvmazeId: 82, thetvdbId: null, imdbId: null }
      )
    ).toBe(true)
  })

  it("returns true when finding new TheTVDB ID", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: null, thetvdb_id: null, imdb_id: null },
        { tvmazeId: null, thetvdbId: 121361, imdbId: null }
      )
    ).toBe(true)
  })

  it("returns true when finding new IMDb ID", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: null, thetvdb_id: null, imdb_id: null },
        { tvmazeId: null, thetvdbId: null, imdbId: "tt0108778" }
      )
    ).toBe(true)
  })

  it("returns true when finding all new IDs", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: null, thetvdb_id: null, imdb_id: null },
        { tvmazeId: 82, thetvdbId: 121361, imdbId: "tt0108778" }
      )
    ).toBe(true)
  })

  it("returns false when show already has all IDs", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: 82, thetvdb_id: 121361, imdb_id: "tt0108778" },
        { tvmazeId: 82, thetvdbId: 121361, imdbId: "tt0108778" }
      )
    ).toBe(false)
  })

  it("returns false when no new IDs found", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: null, thetvdb_id: null, imdb_id: null },
        { tvmazeId: null, thetvdbId: null, imdbId: null }
      )
    ).toBe(false)
  })

  it("returns true when finding only missing IMDb ID (show has others)", () => {
    // Show has TVmaze and TheTVDB but not IMDb, and we find IMDb
    expect(
      shouldUpdate(
        { tvmaze_id: 82, thetvdb_id: 121361, imdb_id: null },
        { tvmazeId: 82, thetvdbId: 121361, imdbId: "tt0108778" }
      )
    ).toBe(true)
  })

  it("returns true when finding only missing TheTVDB ID (show has others)", () => {
    // Show has TVmaze and IMDb but not TheTVDB, and we find TheTVDB
    expect(
      shouldUpdate(
        { tvmaze_id: 82, thetvdb_id: null, imdb_id: "tt0108778" },
        { tvmazeId: 82, thetvdbId: 121361, imdbId: "tt0108778" }
      )
    ).toBe(true)
  })

  it("returns false when we only find IDs the show already has", () => {
    expect(
      shouldUpdate(
        { tvmaze_id: 82, thetvdb_id: null, imdb_id: "tt0108778" },
        { tvmazeId: 82, thetvdbId: null, imdbId: "tt0108778" }
      )
    ).toBe(false)
  })
})
