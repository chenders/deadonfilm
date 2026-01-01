import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { InvalidArgumentError } from "commander"
import fs from "fs"
import path from "path"
import os from "os"
import {
  parsePositiveInt,
  parseSource,
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  type Checkpoint,
} from "./backfill-episodes-fallback.js"
import { loadCheckpoint as loadCheckpointGeneric } from "../src/lib/checkpoint-utils.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-episodes-fallback argument parsing", () => {
  describe("parsePositiveInt", () => {
    it("parses valid positive integers", () => {
      expect(parsePositiveInt("1")).toBe(1)
      expect(parsePositiveInt("123")).toBe(123)
      expect(parsePositiveInt("9999")).toBe(9999)
    })

    it("rejects zero", () => {
      expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
    })

    it("rejects negative numbers", () => {
      expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
    })

    it("rejects non-integer values", () => {
      expect(() => parsePositiveInt("1.5")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("3.14")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("12abc")).toThrow(InvalidArgumentError)
    })

    it("rejects whitespace-only strings", () => {
      expect(() => parsePositiveInt("   ")).toThrow(InvalidArgumentError)
    })
  })

  describe("parseSource", () => {
    it("accepts 'tvmaze' as valid source", () => {
      expect(parseSource("tvmaze")).toBe("tvmaze")
    })

    it("accepts 'thetvdb' as valid source", () => {
      expect(parseSource("thetvdb")).toBe("thetvdb")
    })

    it("accepts 'imdb' as valid source", () => {
      expect(parseSource("imdb")).toBe("imdb")
    })

    it("rejects 'tmdb' (not a fallback source)", () => {
      expect(() => parseSource("tmdb")).toThrow(InvalidArgumentError)
      expect(() => parseSource("tmdb")).toThrow("Source must be 'tvmaze', 'thetvdb', or 'imdb'")
    })

    it("rejects empty string", () => {
      expect(() => parseSource("")).toThrow(InvalidArgumentError)
    })

    it("rejects invalid source names", () => {
      expect(() => parseSource("tvrage")).toThrow(InvalidArgumentError)
      expect(() => parseSource("TVmaze")).toThrow(InvalidArgumentError) // Case-sensitive
    })
  })
})

describe("backfill-episodes-fallback validation logic", () => {
  // These tests validate the logic that would be used in runBackfill
  // without actually running the backfill (which requires database/API access)

  interface BackfillOptions {
    detectGaps?: boolean
    show?: number
    allGaps?: boolean
    source?: "tvmaze" | "thetvdb"
    dryRun?: boolean
  }

  // The script now defaults to --all-gaps if no mode is specified
  function getEffectiveMode(options: BackfillOptions): "detect" | "show" | "allGaps" {
    if (options.detectGaps) return "detect"
    if (options.show) return "show"
    return "allGaps" // Default
  }

  it("defaults to --all-gaps when no mode specified", () => {
    expect(getEffectiveMode({})).toBe("allGaps")
  })

  it("uses --detect-gaps when specified", () => {
    expect(getEffectiveMode({ detectGaps: true })).toBe("detect")
  })

  it("uses --show when specified", () => {
    expect(getEffectiveMode({ show: 123 })).toBe("show")
  })

  it("prefers --detect-gaps over --all-gaps", () => {
    expect(getEffectiveMode({ detectGaps: true, allGaps: true })).toBe("detect")
  })

  it("prefers --show over --all-gaps", () => {
    expect(getEffectiveMode({ show: 123, allGaps: true })).toBe("show")
  })

  it("accepts --dry-run with any mode", () => {
    expect(getEffectiveMode({ detectGaps: true, dryRun: true })).toBe("detect")
    expect(getEffectiveMode({ show: 123, dryRun: true })).toBe("show")
    expect(getEffectiveMode({ dryRun: true })).toBe("allGaps")
  })

  it("accepts --source with --show", () => {
    expect(getEffectiveMode({ show: 123, source: "tvmaze" })).toBe("show")
    expect(getEffectiveMode({ show: 123, source: "thetvdb" })).toBe("show")
  })
})

describe("backfill-episodes-fallback environment validation", () => {
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

describe("backfill-episodes-fallback checkpoint functionality", () => {
  let testDir: string
  let testCheckpointFile: string

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-test-"))
    testCheckpointFile = path.join(testDir, "test-checkpoint.json")
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true })
    }
  })

  describe("loadCheckpoint", () => {
    it("returns null when checkpoint file does not exist", () => {
      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toBeNull()
    })

    it("loads checkpoint from existing file", () => {
      const checkpoint: Checkpoint = {
        processedShowIds: [123, 456],
        currentShowId: 789,
        processedSeasons: [1, 2],
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T01:00:00.000Z",
        stats: {
          showsProcessed: 2,
          seasonsProcessed: 5,
          episodesSaved: 100,
          actorsSaved: 0,
          appearancesSaved: 0,
          deathCauseLookups: 0,
          errors: 1,
        },
      }
      fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))

      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toEqual(checkpoint)
    })

    it("throws on invalid JSON (via generic loader)", () => {
      fs.writeFileSync(testCheckpointFile, "invalid json")
      expect(() => loadCheckpointGeneric<Checkpoint>(testCheckpointFile)).toThrow(SyntaxError)
    })

    it("throws on permission errors (via generic loader)", () => {
      // Create a directory with the checkpoint name - reading it will cause an error
      const dirAsFile = path.join(testDir, "dir-checkpoint.json")
      fs.mkdirSync(dirAsFile)
      expect(() => loadCheckpointGeneric<Checkpoint>(dirAsFile)).toThrow()
    })
  })

  describe("saveCheckpoint", () => {
    it("saves checkpoint to file", () => {
      const checkpoint: Checkpoint = {
        processedShowIds: [789],
        currentShowId: 1000,
        processedSeasons: [3],
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        stats: {
          showsProcessed: 1,
          seasonsProcessed: 1,
          episodesSaved: 20,
          actorsSaved: 0,
          appearancesSaved: 0,
          deathCauseLookups: 0,
          errors: 0,
        },
      }

      saveCheckpoint(checkpoint, testCheckpointFile)

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.processedShowIds).toEqual([789])
      expect(saved.currentShowId).toBe(1000)
      expect(saved.processedSeasons).toEqual([3])
      expect(saved.stats.episodesSaved).toBe(20)
    })

    it("updates lastUpdated timestamp", () => {
      const checkpoint: Checkpoint = {
        processedShowIds: [],
        currentShowId: null,
        processedSeasons: [],
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        stats: {
          showsProcessed: 0,
          seasonsProcessed: 0,
          episodesSaved: 0,
          actorsSaved: 0,
          appearancesSaved: 0,
          deathCauseLookups: 0,
          errors: 0,
        },
      }

      const before = new Date().toISOString()
      saveCheckpoint(checkpoint, testCheckpointFile)
      const after = new Date().toISOString()

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.lastUpdated >= before).toBe(true)
      expect(saved.lastUpdated <= after).toBe(true)
    })
  })

  describe("deleteCheckpoint", () => {
    it("deletes existing checkpoint file", () => {
      fs.writeFileSync(testCheckpointFile, "{}")
      expect(fs.existsSync(testCheckpointFile)).toBe(true)

      deleteCheckpoint(testCheckpointFile)
      expect(fs.existsSync(testCheckpointFile)).toBe(false)
    })

    it("does not throw when file does not exist", () => {
      expect(() => deleteCheckpoint(testCheckpointFile)).not.toThrow()
    })
  })
})

describe("backfill-episodes-fallback --include-cast option", () => {
  /**
   * Note: processEpisodeCast is a private function that's not exported.
   * It integrates with multiple external dependencies (IMDb API, database, death cause lookup).
   * Testing it directly would require either:
   * 1. Exporting it (changing the module's public API)
   * 2. Integration tests with a test database
   *
   * Instead, we test the logic that processEpisodeCast relies on through the components it uses:
   * - Actor upsert logic is tested in db.test.ts
   * - IMDb cast fetching is tested in imdb.test.ts
   * - Death cause lookup is tested in wikidata.test.ts
   *
   * These tests validate the option parsing and mode selection related to --include-cast.
   */

  interface BackfillOptions {
    detectGaps?: boolean
    show?: number
    allGaps?: boolean
    source?: "tvmaze" | "thetvdb" | "imdb"
    includeCast?: boolean
    dryRun?: boolean
    fresh?: boolean
  }

  function getEffectiveMode(options: BackfillOptions): "detect" | "show" | "allGaps" {
    if (options.detectGaps) return "detect"
    if (options.show) return "show"
    return "allGaps"
  }

  it("--include-cast can be combined with --show", () => {
    const options: BackfillOptions = { show: 879, includeCast: true }
    expect(getEffectiveMode(options)).toBe("show")
    expect(options.includeCast).toBe(true)
  })

  it("--include-cast can be combined with --all-gaps", () => {
    const options: BackfillOptions = { allGaps: true, includeCast: true }
    expect(getEffectiveMode(options)).toBe("allGaps")
    expect(options.includeCast).toBe(true)
  })

  it("--include-cast defaults to false when not specified", () => {
    const options: BackfillOptions = { show: 879 }
    expect(options.includeCast).toBeUndefined()
    // The script treats undefined as false
    expect(options.includeCast ?? false).toBe(false)
  })

  it("--include-cast can be combined with --dry-run", () => {
    const options: BackfillOptions = { show: 879, includeCast: true, dryRun: true }
    expect(getEffectiveMode(options)).toBe("show")
    expect(options.includeCast).toBe(true)
    expect(options.dryRun).toBe(true)
  })

  it("--include-cast can be combined with --source imdb", () => {
    const options: BackfillOptions = { show: 879, includeCast: true, source: "imdb" }
    expect(getEffectiveMode(options)).toBe("show")
    expect(options.includeCast).toBe(true)
    expect(options.source).toBe("imdb")
  })
})

describe("backfill-episodes-fallback age calculation logic", () => {
  /**
   * Tests for the age at filming calculation logic used in processEpisodeCast.
   * This mirrors the calculation: ageAtFilming = filmingYear - birthYear
   */

  function calculateAgeAtFilming(
    birthYear: number | null,
    filmingYear: number | null
  ): number | null {
    if (birthYear && filmingYear) {
      return filmingYear - birthYear
    }
    return null
  }

  it("calculates age correctly when both years are provided", () => {
    expect(calculateAgeAtFilming(1950, 2000)).toBe(50)
    expect(calculateAgeAtFilming(1985, 2020)).toBe(35)
    expect(calculateAgeAtFilming(1900, 1950)).toBe(50)
  })

  it("returns null when birth year is missing", () => {
    expect(calculateAgeAtFilming(null, 2000)).toBeNull()
  })

  it("returns null when filming year is missing", () => {
    expect(calculateAgeAtFilming(1950, null)).toBeNull()
  })

  it("returns null when both years are missing", () => {
    expect(calculateAgeAtFilming(null, null)).toBeNull()
  })

  it("handles edge case of same year (age 0)", () => {
    expect(calculateAgeAtFilming(2000, 2000)).toBe(0)
  })
})

describe("backfill-episodes-fallback checkpoint with cast stats", () => {
  let testDir: string
  let testCheckpointFile: string

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-cast-test-"))
    testCheckpointFile = path.join(testDir, "test-checkpoint.json")
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true })
    }
  })

  it("checkpoint includes cast-related stats", () => {
    const checkpoint: Checkpoint = {
      processedShowIds: [879],
      currentShowId: null,
      processedSeasons: [],
      startedAt: "2024-01-01T00:00:00.000Z",
      lastUpdated: "2024-01-01T01:00:00.000Z",
      stats: {
        showsProcessed: 1,
        seasonsProcessed: 5,
        episodesSaved: 100,
        actorsSaved: 250,
        appearancesSaved: 500,
        deathCauseLookups: 50,
        errors: 2,
      },
    }
    fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))

    const result = loadCheckpoint(testCheckpointFile)

    expect(result).not.toBeNull()
    expect(result!.stats.actorsSaved).toBe(250)
    expect(result!.stats.appearancesSaved).toBe(500)
    expect(result!.stats.deathCauseLookups).toBe(50)
  })

  it("saves checkpoint with cast stats", () => {
    const checkpoint: Checkpoint = {
      processedShowIds: [],
      currentShowId: 879,
      processedSeasons: [1, 2],
      startedAt: "2024-01-01T00:00:00.000Z",
      lastUpdated: "2024-01-01T00:00:00.000Z",
      stats: {
        showsProcessed: 0,
        seasonsProcessed: 2,
        episodesSaved: 50,
        actorsSaved: 100,
        appearancesSaved: 200,
        deathCauseLookups: 25,
        errors: 0,
      },
    }

    saveCheckpoint(checkpoint, testCheckpointFile)

    const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
    expect(saved.stats.actorsSaved).toBe(100)
    expect(saved.stats.appearancesSaved).toBe(200)
    expect(saved.stats.deathCauseLookups).toBe(25)
  })
})
