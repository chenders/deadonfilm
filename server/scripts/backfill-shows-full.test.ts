import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { InvalidArgumentError } from "commander"
import fs from "fs"
import path from "path"
import os from "os"
import {
  parsePositiveInt,
  parseShowIds,
  parseSource,
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  type Checkpoint,
} from "./backfill-shows-full.js"
import { loadCheckpoint as loadCheckpointGeneric } from "../src/lib/checkpoint-utils.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-shows-full argument parsing", () => {
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

  describe("parseShowIds", () => {
    it("parses a single show ID", () => {
      expect(parseShowIds("987")).toEqual([987])
    })

    it("parses multiple comma-separated show IDs", () => {
      expect(parseShowIds("987,879,910")).toEqual([987, 879, 910])
    })

    it("handles whitespace around IDs", () => {
      expect(parseShowIds("987, 879, 910")).toEqual([987, 879, 910])
      expect(parseShowIds(" 987 , 879 , 910 ")).toEqual([987, 879, 910])
    })

    it("rejects invalid show IDs", () => {
      expect(() => parseShowIds("abc")).toThrow(InvalidArgumentError)
      expect(() => parseShowIds("987,abc,910")).toThrow("Invalid show ID: abc")
    })

    it("rejects empty string", () => {
      expect(() => parseShowIds("")).toThrow(InvalidArgumentError)
    })

    it("rejects negative numbers", () => {
      expect(() => parseShowIds("-1")).toThrow(InvalidArgumentError)
    })

    it("rejects floating point numbers", () => {
      expect(() => parseShowIds("987.5")).toThrow(InvalidArgumentError)
    })
  })

  describe("parseSource", () => {
    it("accepts valid sources", () => {
      expect(parseSource("tvmaze")).toBe("tvmaze")
      expect(parseSource("thetvdb")).toBe("thetvdb")
      expect(parseSource("imdb")).toBe("imdb")
    })

    it("rejects invalid sources", () => {
      expect(() => parseSource("tmdb")).toThrow(InvalidArgumentError)
      expect(() => parseSource("invalid")).toThrow(InvalidArgumentError)
      expect(() => parseSource("")).toThrow(InvalidArgumentError)
    })

    it("provides descriptive error message", () => {
      expect(() => parseSource("tmdb")).toThrow("Source must be 'tvmaze', 'thetvdb', or 'imdb'")
    })
  })
})

describe("backfill-shows-full validation logic", () => {
  interface BackfillOptions {
    shows?: number[]
    detectGaps?: boolean
    limit?: number
    source?: string
    includeCast?: boolean
    dryRun?: boolean
    fresh?: boolean
  }

  function validateOptions(options: BackfillOptions): string | null {
    if (!options.shows && !options.detectGaps) {
      return "Either --shows or --detect-gaps is required"
    }
    return null
  }

  it("requires either --shows or --detect-gaps", () => {
    expect(validateOptions({})).toBe("Either --shows or --detect-gaps is required")
  })

  it("accepts --shows option", () => {
    expect(validateOptions({ shows: [987, 879] })).toBeNull()
  })

  it("accepts --detect-gaps option", () => {
    expect(validateOptions({ detectGaps: true })).toBeNull()
  })

  it("accepts both options together", () => {
    expect(validateOptions({ shows: [987], detectGaps: true })).toBeNull()
  })

  it("accepts all options combined", () => {
    expect(
      validateOptions({
        shows: [987],
        detectGaps: true,
        limit: 10,
        source: "imdb",
        includeCast: true,
        dryRun: true,
        fresh: true,
      })
    ).toBeNull()
  })
})

describe("backfill-shows-full environment validation", () => {
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

describe("backfill-shows-full checkpoint functionality", () => {
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
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T01:00:00.000Z",
        showsToProcess: [987, 879, 910],
        showsCompleted: [987],
        currentShow: 879,
        currentSeason: 5,
        stats: {
          showsProcessed: 1,
          seasonsProcessed: 10,
          episodesSaved: 200,
          actorsSaved: 50,
          appearancesSaved: 500,
          deathCauseLookups: 5,
          errors: 0,
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
  })

  describe("saveCheckpoint", () => {
    it("creates checkpoint file", () => {
      const checkpoint: Checkpoint = {
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        showsToProcess: [987],
        showsCompleted: [],
        currentShow: null,
        currentSeason: null,
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

      saveCheckpoint(checkpoint, testCheckpointFile)
      expect(fs.existsSync(testCheckpointFile)).toBe(true)
    })

    it("updates lastUpdated timestamp", () => {
      const checkpoint: Checkpoint = {
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        showsToProcess: [987],
        showsCompleted: [],
        currentShow: null,
        currentSeason: null,
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

      const beforeSave = new Date()
      saveCheckpoint(checkpoint, testCheckpointFile)

      const saved = loadCheckpoint(testCheckpointFile)
      expect(saved).not.toBeNull()
      const savedDate = new Date(saved!.lastUpdated)
      expect(savedDate.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime())
    })

    it("preserves all checkpoint data", () => {
      const checkpoint: Checkpoint = {
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        showsToProcess: [987, 879, 910],
        showsCompleted: [987],
        currentShow: 879,
        currentSeason: 5,
        stats: {
          showsProcessed: 1,
          seasonsProcessed: 10,
          episodesSaved: 200,
          actorsSaved: 50,
          appearancesSaved: 500,
          deathCauseLookups: 5,
          errors: 2,
        },
      }

      saveCheckpoint(checkpoint, testCheckpointFile)
      const loaded = loadCheckpoint(testCheckpointFile)

      expect(loaded).not.toBeNull()
      expect(loaded!.showsToProcess).toEqual([987, 879, 910])
      expect(loaded!.showsCompleted).toEqual([987])
      expect(loaded!.currentShow).toBe(879)
      expect(loaded!.currentSeason).toBe(5)
      expect(loaded!.stats.showsProcessed).toBe(1)
      expect(loaded!.stats.seasonsProcessed).toBe(10)
      expect(loaded!.stats.episodesSaved).toBe(200)
      expect(loaded!.stats.actorsSaved).toBe(50)
      expect(loaded!.stats.appearancesSaved).toBe(500)
      expect(loaded!.stats.deathCauseLookups).toBe(5)
      expect(loaded!.stats.errors).toBe(2)
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

describe("backfill-shows-full session caching logic", () => {
  interface BackfillSession {
    externalIdsCache: Map<number, { imdbId: string | null }>
    deathCauseLookedUp: Set<number>
    processedEpisodes: Set<string>
  }

  function createSession(): BackfillSession {
    return {
      externalIdsCache: new Map(),
      deathCauseLookedUp: new Set(),
      processedEpisodes: new Set(),
    }
  }

  function shouldLookupDeathCause(
    session: BackfillSession,
    actorId: number,
    hasDeathYear: boolean
  ): boolean {
    if (!hasDeathYear) return false
    if (session.deathCauseLookedUp.has(actorId)) return false
    return true
  }

  function markDeathCauseLookedUp(session: BackfillSession, actorId: number): void {
    session.deathCauseLookedUp.add(actorId)
  }

  describe("death cause lookup deduplication", () => {
    it("allows first lookup for an actor", () => {
      const session = createSession()
      expect(shouldLookupDeathCause(session, 123, true)).toBe(true)
    })

    it("prevents duplicate lookups for same actor", () => {
      const session = createSession()
      expect(shouldLookupDeathCause(session, 123, true)).toBe(true)
      markDeathCauseLookedUp(session, 123)
      expect(shouldLookupDeathCause(session, 123, true)).toBe(false)
    })

    it("allows lookups for different actors", () => {
      const session = createSession()
      markDeathCauseLookedUp(session, 123)
      expect(shouldLookupDeathCause(session, 456, true)).toBe(true)
    })

    it("skips lookup for living actors", () => {
      const session = createSession()
      expect(shouldLookupDeathCause(session, 123, false)).toBe(false)
    })

    it("persists lookup status across multiple episodes", () => {
      const session = createSession()

      // Simulate processing multiple episodes with same actor
      markDeathCauseLookedUp(session, 123)

      // Same actor appears in episode 2, 3, 4...
      expect(shouldLookupDeathCause(session, 123, true)).toBe(false)
      expect(shouldLookupDeathCause(session, 123, true)).toBe(false)
      expect(shouldLookupDeathCause(session, 123, true)).toBe(false)
    })
  })

  describe("external IDs caching", () => {
    it("caches external IDs for shows", () => {
      const session = createSession()
      const externalIds = { imdbId: "tt0056758" }

      session.externalIdsCache.set(987, externalIds)

      expect(session.externalIdsCache.has(987)).toBe(true)
      expect(session.externalIdsCache.get(987)).toEqual(externalIds)
    })

    it("returns cached IDs for same show", () => {
      const session = createSession()
      const externalIds = { imdbId: "tt0056758" }
      session.externalIdsCache.set(987, externalIds)

      // Simulate cache hit
      const cached = session.externalIdsCache.get(987)
      expect(cached).toEqual(externalIds)
    })

    it("allows different IDs for different shows", () => {
      const session = createSession()
      session.externalIdsCache.set(987, { imdbId: "tt0056758" })
      session.externalIdsCache.set(879, { imdbId: "tt0070992" })

      expect(session.externalIdsCache.get(987)?.imdbId).toBe("tt0056758")
      expect(session.externalIdsCache.get(879)?.imdbId).toBe("tt0070992")
    })
  })

  describe("processed episodes tracking", () => {
    it("tracks processed episodes", () => {
      const session = createSession()
      const episodeKey = "987:1:5" // showId:seasonNum:epNum

      expect(session.processedEpisodes.has(episodeKey)).toBe(false)
      session.processedEpisodes.add(episodeKey)
      expect(session.processedEpisodes.has(episodeKey)).toBe(true)
    })

    it("prevents duplicate episode processing", () => {
      const session = createSession()
      const episodeKey = "987:1:5"

      session.processedEpisodes.add(episodeKey)

      // Simulate checking before processing
      const alreadyProcessed = session.processedEpisodes.has(episodeKey)
      expect(alreadyProcessed).toBe(true)
    })
  })
})

describe("backfill-shows-full checkpoint batch saving", () => {
  // Test the batching logic for checkpoint saves
  function shouldSaveCheckpoint(episodesProcessed: number, checkpointInterval: number): boolean {
    return episodesProcessed >= checkpointInterval
  }

  it("saves checkpoint every N episodes", () => {
    const interval = 10
    expect(shouldSaveCheckpoint(9, interval)).toBe(false)
    expect(shouldSaveCheckpoint(10, interval)).toBe(true)
    expect(shouldSaveCheckpoint(11, interval)).toBe(true)
    expect(shouldSaveCheckpoint(20, interval)).toBe(true)
  })

  it("does not save before reaching interval", () => {
    const interval = 10
    for (let i = 0; i < 10; i++) {
      expect(shouldSaveCheckpoint(i, interval)).toBe(false)
    }
  })

  it("handles different interval sizes", () => {
    expect(shouldSaveCheckpoint(5, 5)).toBe(true)
    expect(shouldSaveCheckpoint(4, 5)).toBe(false)
    expect(shouldSaveCheckpoint(20, 20)).toBe(true)
    expect(shouldSaveCheckpoint(19, 20)).toBe(false)
  })
})
