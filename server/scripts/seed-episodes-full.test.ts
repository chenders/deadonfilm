import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { InvalidArgumentError } from "commander"
import fs from "fs"
import path from "path"
import os from "os"
import {
  parsePositiveInt,
  filterValidGuestStars,
  deduplicateAppearances,
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  type Checkpoint,
} from "./seed-episodes-full.js"
import type { ShowActorAppearanceRecord } from "../src/lib/db.js"

describe("parsePositiveInt", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInt("1")).toBe(1)
    expect(parsePositiveInt("42")).toBe(42)
    expect(parsePositiveInt("500")).toBe(500)
    expect(parsePositiveInt("1000")).toBe(1000)
  })

  it("throws for zero", () => {
    expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
  })

  it("throws for negative numbers", () => {
    expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
  })

  it("truncates decimal values to integers", () => {
    // JavaScript parseInt truncates decimals, so "1.5" becomes 1
    expect(parsePositiveInt("1.5")).toBe(1)
    expect(parsePositiveInt("3.14")).toBe(3)
  })

  it("throws for non-numeric strings", () => {
    expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
  })

  it("parses leading digits from mixed strings", () => {
    // JavaScript parseInt stops at first non-digit, so "12abc" becomes 12
    expect(parsePositiveInt("12abc")).toBe(12)
  })

  it("throws for whitespace", () => {
    expect(() => parsePositiveInt(" ")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("\t")).toThrow(InvalidArgumentError)
  })
})

describe("filterValidGuestStars", () => {
  it("returns empty array for empty input", () => {
    expect(filterValidGuestStars([])).toEqual([])
  })

  it("filters out guest stars with null id", () => {
    const guestStars = [
      { id: 123, name: "Actor 1" },
      { id: null, name: "Actor 2" },
      { id: 456, name: "Actor 3" },
    ]
    const result = filterValidGuestStars(guestStars)
    expect(result).toHaveLength(2)
    expect(result.map((gs) => gs.name)).toEqual(["Actor 1", "Actor 3"])
  })

  it("filters out guest stars with undefined id", () => {
    const guestStars = [
      { id: 123, name: "Actor 1" },
      { id: undefined, name: "Actor 2" },
      { id: 789, name: "Actor 3" },
    ]
    const result = filterValidGuestStars(guestStars)
    expect(result).toHaveLength(2)
    expect(result.map((gs) => gs.name)).toEqual(["Actor 1", "Actor 3"])
  })

  it("filters out guest stars with zero id", () => {
    const guestStars = [
      { id: 0, name: "Actor 1" },
      { id: 123, name: "Actor 2" },
    ]
    const result = filterValidGuestStars(guestStars)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Actor 2")
  })

  it("filters out guest stars with negative id", () => {
    const guestStars = [
      { id: -1, name: "Actor 1" },
      { id: 123, name: "Actor 2" },
    ]
    const result = filterValidGuestStars(guestStars)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Actor 2")
  })

  it("keeps all guest stars when all have valid ids", () => {
    const guestStars = [
      { id: 1, name: "Actor 1" },
      { id: 2, name: "Actor 2" },
      { id: 3, name: "Actor 3" },
    ]
    const result = filterValidGuestStars(guestStars)
    expect(result).toHaveLength(3)
  })
})

describe("deduplicateAppearances", () => {
  const makeAppearance = (
    actorId: number,
    showId: number,
    season: number,
    episode: number,
    character?: string
  ): ShowActorAppearanceRecord => ({
    actor_id: actorId,
    show_tmdb_id: showId,
    season_number: season,
    episode_number: episode,
    character_name: character ?? null,
    appearance_type: "guest",
    billing_order: null,
    age_at_filming: null,
  })

  it("returns empty array for empty input", () => {
    expect(deduplicateAppearances([])).toEqual([])
  })

  it("returns same array when no duplicates", () => {
    const appearances = [
      makeAppearance(1, 100, 1, 1),
      makeAppearance(2, 100, 1, 1),
      makeAppearance(1, 100, 1, 2),
    ]
    const result = deduplicateAppearances(appearances)
    expect(result).toHaveLength(3)
  })

  it("removes duplicate appearances keeping first occurrence", () => {
    const appearances = [
      makeAppearance(1, 100, 1, 1, "First Role"),
      makeAppearance(1, 100, 1, 1, "Second Role"), // Same actor, same episode
      makeAppearance(2, 100, 1, 1),
    ]
    const result = deduplicateAppearances(appearances)
    expect(result).toHaveLength(2)
    // First occurrence should be kept
    expect(result[0].character_name).toBe("First Role")
    expect(result[1].actor_id).toBe(2)
  })

  it("treats same actor in different episodes as unique", () => {
    const appearances = [
      makeAppearance(1, 100, 1, 1),
      makeAppearance(1, 100, 1, 2), // Same actor, different episode
    ]
    const result = deduplicateAppearances(appearances)
    expect(result).toHaveLength(2)
  })

  it("treats same actor in different seasons as unique", () => {
    const appearances = [
      makeAppearance(1, 100, 1, 1),
      makeAppearance(1, 100, 2, 1), // Same actor, different season
    ]
    const result = deduplicateAppearances(appearances)
    expect(result).toHaveLength(2)
  })

  it("treats same actor in different shows as unique", () => {
    const appearances = [
      makeAppearance(1, 100, 1, 1),
      makeAppearance(1, 200, 1, 1), // Same actor, different show
    ]
    const result = deduplicateAppearances(appearances)
    expect(result).toHaveLength(2)
  })

  it("handles multiple duplicates of same appearance", () => {
    const appearances = [
      makeAppearance(1, 100, 1, 1, "First"),
      makeAppearance(1, 100, 1, 1, "Second"),
      makeAppearance(1, 100, 1, 1, "Third"),
    ]
    const result = deduplicateAppearances(appearances)
    expect(result).toHaveLength(1)
    expect(result[0].character_name).toBe("First")
  })
})

describe("checkpoint functions", () => {
  let tempDir: string
  let testCheckpointFile: string

  const createTestCheckpoint = (): Checkpoint => ({
    processedShowIds: [100, 200, 300],
    startedAt: "2025-01-01T00:00:00.000Z",
    lastUpdated: "2025-01-01T01:00:00.000Z",
    stats: {
      showsProcessed: 3,
      totalSeasons: 10,
      totalEpisodes: 100,
      totalGuestStars: 500,
      newActorsSaved: 50,
      errors: 0,
    },
  })

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-test-"))
    testCheckpointFile = path.join(tempDir, "test-checkpoint.json")
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe("loadCheckpoint", () => {
    it("returns null when checkpoint file does not exist", () => {
      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toBeNull()
    })

    it("loads valid checkpoint file", () => {
      const checkpoint = createTestCheckpoint()
      fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))

      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toEqual(checkpoint)
    })

    it("returns null and logs warning for corrupted JSON", () => {
      fs.writeFileSync(testCheckpointFile, "{ invalid json }")

      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toBeNull()
    })

    it("preserves all checkpoint fields", () => {
      const checkpoint = createTestCheckpoint()
      fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))

      const result = loadCheckpoint(testCheckpointFile)
      expect(result?.processedShowIds).toEqual([100, 200, 300])
      expect(result?.startedAt).toBe("2025-01-01T00:00:00.000Z")
      expect(result?.stats.showsProcessed).toBe(3)
      expect(result?.stats.totalSeasons).toBe(10)
      expect(result?.stats.totalEpisodes).toBe(100)
      expect(result?.stats.totalGuestStars).toBe(500)
      expect(result?.stats.newActorsSaved).toBe(50)
      expect(result?.stats.errors).toBe(0)
    })
  })

  describe("saveCheckpoint", () => {
    it("saves checkpoint to file", () => {
      const checkpoint = createTestCheckpoint()
      saveCheckpoint(checkpoint, testCheckpointFile)

      expect(fs.existsSync(testCheckpointFile)).toBe(true)
      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.processedShowIds).toEqual([100, 200, 300])
      expect(saved.stats.showsProcessed).toBe(3)
    })

    it("updates lastUpdated timestamp", () => {
      const checkpoint = createTestCheckpoint()
      const originalTimestamp = checkpoint.lastUpdated

      saveCheckpoint(checkpoint, testCheckpointFile)

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.lastUpdated).not.toBe(originalTimestamp)
      // Should be a valid ISO timestamp
      expect(new Date(saved.lastUpdated).toISOString()).toBe(saved.lastUpdated)
    })

    it("overwrites existing checkpoint file", () => {
      const checkpoint1 = createTestCheckpoint()
      checkpoint1.processedShowIds = [100]
      saveCheckpoint(checkpoint1, testCheckpointFile)

      const checkpoint2 = createTestCheckpoint()
      checkpoint2.processedShowIds = [100, 200, 300, 400]
      saveCheckpoint(checkpoint2, testCheckpointFile)

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.processedShowIds).toEqual([100, 200, 300, 400])
    })

    it("writes formatted JSON with indentation", () => {
      const checkpoint = createTestCheckpoint()
      saveCheckpoint(checkpoint, testCheckpointFile)

      const content = fs.readFileSync(testCheckpointFile, "utf-8")
      expect(content).toContain("\n") // Should have newlines (formatted)
      expect(content).toContain("  ") // Should have indentation
    })
  })

  describe("deleteCheckpoint", () => {
    it("deletes existing checkpoint file", () => {
      const checkpoint = createTestCheckpoint()
      fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))
      expect(fs.existsSync(testCheckpointFile)).toBe(true)

      deleteCheckpoint(testCheckpointFile)

      expect(fs.existsSync(testCheckpointFile)).toBe(false)
    })

    it("does not throw when file does not exist", () => {
      expect(fs.existsSync(testCheckpointFile)).toBe(false)
      expect(() => deleteCheckpoint(testCheckpointFile)).not.toThrow()
    })

    it("only deletes the specified file", () => {
      const otherFile = path.join(tempDir, "other-file.json")
      fs.writeFileSync(testCheckpointFile, "{}")
      fs.writeFileSync(otherFile, "{}")

      deleteCheckpoint(testCheckpointFile)

      expect(fs.existsSync(testCheckpointFile)).toBe(false)
      expect(fs.existsSync(otherFile)).toBe(true)
    })
  })

  describe("checkpoint round-trip", () => {
    it("can save and load checkpoint correctly", () => {
      const original = createTestCheckpoint()
      const originalLastUpdated = original.lastUpdated
      saveCheckpoint(original, testCheckpointFile)
      const loaded = loadCheckpoint(testCheckpointFile)

      expect(loaded?.processedShowIds).toEqual(original.processedShowIds)
      expect(loaded?.startedAt).toBe(original.startedAt)
      expect(loaded?.stats).toEqual(original.stats)
      // lastUpdated will be different due to saveCheckpoint updating it
      expect(loaded?.lastUpdated).not.toBe(originalLastUpdated)
    })

    it("can save, load, modify, and save again", () => {
      const checkpoint = createTestCheckpoint()
      saveCheckpoint(checkpoint, testCheckpointFile)

      const loaded = loadCheckpoint(testCheckpointFile)
      expect(loaded).not.toBeNull()
      loaded!.processedShowIds.push(400)
      loaded!.stats.showsProcessed = 4
      saveCheckpoint(loaded!, testCheckpointFile)

      const reloaded = loadCheckpoint(testCheckpointFile)
      expect(reloaded?.processedShowIds).toEqual([100, 200, 300, 400])
      expect(reloaded?.stats.showsProcessed).toBe(4)
    })
  })
})
