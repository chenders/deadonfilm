import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import {
  parsePositiveInt,
  filterValidGuestStars,
  deduplicateAppearances,
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
    actor_tmdb_id: actorId,
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
    expect(result[1].actor_tmdb_id).toBe(2)
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
