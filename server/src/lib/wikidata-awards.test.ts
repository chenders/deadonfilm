/**
 * Tests for Wikidata Awards Fetcher
 */

import { describe, it, expect } from "vitest"
import {
  classifyAwardTier,
  calculateActorAwardsScore,
  type ActorAwardsData,
  type AwardEntry,
} from "./wikidata-awards.js"

describe("classifyAwardTier", () => {
  it("classifies Oscar awards correctly", () => {
    expect(classifyAwardTier("Q103916")).toBe("oscar") // Best Actor
    expect(classifyAwardTier("Q103618")).toBe("oscar") // Best Actress
    expect(classifyAwardTier("Q106301")).toBe("oscar") // Best Supporting Actor
    expect(classifyAwardTier("Q106291")).toBe("oscar") // Best Supporting Actress
  })

  it("classifies Emmy/Globe awards correctly", () => {
    expect(classifyAwardTier("Q258672")).toBe("emmy_globe") // Emmy Lead Actor Drama
    expect(classifyAwardTier("Q191417")).toBe("emmy_globe") // Golden Globe Actor Drama
  })

  it("classifies BAFTA/SAG awards correctly", () => {
    expect(classifyAwardTier("Q595718")).toBe("bafta_sag") // BAFTA Leading Actor
    expect(classifyAwardTier("Q652238")).toBe("bafta_sag") // SAG Male Leading Role
  })

  it("returns null for unrecognized QIDs", () => {
    expect(classifyAwardTier("Q12345")).toBeNull()
    expect(classifyAwardTier("Q999999")).toBeNull()
    expect(classifyAwardTier("")).toBeNull()
  })
})

describe("calculateActorAwardsScore", () => {
  const makeAward = (qid: string, tier: "oscar" | "emmy_globe" | "bafta_sag"): AwardEntry => ({
    wikidataId: qid,
    label: `Award ${qid}`,
    tier,
  })

  it("returns 0 for null data", () => {
    expect(calculateActorAwardsScore(null)).toBe(0)
  })

  it("returns 0 for empty awards", () => {
    const data: ActorAwardsData = {
      totalScore: 0,
      wins: [],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }
    expect(calculateActorAwardsScore(data)).toBe(0)
  })

  it("scores a single Oscar win around 40", () => {
    const data: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q103916", "oscar")],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }
    const score = calculateActorAwardsScore(data)
    // 15 points → 100 * (1 - exp(-15/30)) ≈ 39.3
    expect(score).toBeGreaterThan(35)
    expect(score).toBeLessThan(45)
  })

  it("scores two Oscar wins around 63", () => {
    const data: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q103916", "oscar"), makeAward("Q103618", "oscar")],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }
    const score = calculateActorAwardsScore(data)
    // 30 points → 100 * (1 - exp(-30/30)) ≈ 63.2
    expect(score).toBeGreaterThan(58)
    expect(score).toBeLessThan(68)
  })

  it("scores nominations lower than wins", () => {
    const winsOnly: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q103916", "oscar")],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }
    const nomsOnly: ActorAwardsData = {
      totalScore: 0,
      wins: [],
      nominations: [makeAward("Q103916", "oscar")],
      fetchedAt: new Date().toISOString(),
    }
    expect(calculateActorAwardsScore(winsOnly)).toBeGreaterThan(calculateActorAwardsScore(nomsOnly))
  })

  it("lower tier awards score less than Oscar tier", () => {
    const oscar: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q103916", "oscar")],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }
    const emmy: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q258672", "emmy_globe")],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }
    const bafta: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q595718", "bafta_sag")],
      nominations: [],
      fetchedAt: new Date().toISOString(),
    }

    const oscarScore = calculateActorAwardsScore(oscar)
    const emmyScore = calculateActorAwardsScore(emmy)
    const baftaScore = calculateActorAwardsScore(bafta)

    expect(oscarScore).toBeGreaterThan(emmyScore)
    expect(emmyScore).toBeGreaterThan(baftaScore)
  })

  it("exhibits diminishing returns for heavy award history", () => {
    const moderate: ActorAwardsData = {
      totalScore: 0,
      wins: [makeAward("Q103916", "oscar"), makeAward("Q258672", "emmy_globe")],
      nominations: [makeAward("Q103618", "oscar")],
      fetchedAt: new Date().toISOString(),
    }
    const heavy: ActorAwardsData = {
      totalScore: 0,
      wins: [
        makeAward("Q103916", "oscar"),
        makeAward("Q103618", "oscar"),
        makeAward("Q258672", "emmy_globe"),
        makeAward("Q258695", "emmy_globe"),
        makeAward("Q595718", "bafta_sag"),
      ],
      nominations: [
        makeAward("Q103916", "oscar"),
        makeAward("Q103618", "oscar"),
        makeAward("Q258672", "emmy_globe"),
      ],
      fetchedAt: new Date().toISOString(),
    }

    const moderateScore = calculateActorAwardsScore(moderate)
    const heavyScore = calculateActorAwardsScore(heavy)

    // Heavy should score higher but not proportionally to points
    expect(heavyScore).toBeGreaterThan(moderateScore)
    // Heavy score should be in the 85+ range
    expect(heavyScore).toBeGreaterThan(80)
    // But capped at 100
    expect(heavyScore).toBeLessThanOrEqual(100)
  })

  it("never exceeds 100", () => {
    // Extreme case: many awards of all tiers
    const extreme: ActorAwardsData = {
      totalScore: 0,
      wins: Array(10).fill(makeAward("Q103916", "oscar")),
      nominations: Array(20).fill(makeAward("Q103916", "oscar")),
      fetchedAt: new Date().toISOString(),
    }
    expect(calculateActorAwardsScore(extreme)).toBeLessThanOrEqual(100)
  })
})
