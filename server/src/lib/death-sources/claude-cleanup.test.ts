import { describe, it, expect } from "vitest"
import { buildCleanupPrompt, estimateCleanupCost } from "./claude-cleanup.js"
import { DeathMannerSchema } from "../claude-batch/schemas.js"
import { DataSourceType } from "./types.js"
import type { ActorForEnrichment, RawSourceData } from "./types.js"

describe("claude-cleanup", () => {
  const mockActor: ActorForEnrichment = {
    id: 123,
    tmdbId: 456,
    name: "John Wayne",
    birthday: "1907-05-26",
    deathday: "1979-06-11",
    causeOfDeath: null,
    causeOfDeathDetails: null,
    popularity: 15.5,
  }

  const mockSources: RawSourceData[] = [
    {
      sourceName: "Wikipedia",
      sourceType: DataSourceType.WIKIPEDIA,
      confidence: 0.85,
      text: "Wayne died on June 11, 1979, from stomach cancer at UCLA Medical Center.",
    },
    {
      sourceName: "Wikidata",
      sourceType: DataSourceType.WIKIDATA,
      confidence: 0.9,
      text: "Cause of death: stomach cancer. Date of death: 1979-06-11.",
    },
  ]

  describe("buildCleanupPrompt", () => {
    it("includes actor name and death year", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("John Wayne")
      expect(prompt).toContain("died 1979")
    })

    it("includes birth year when birthday is available", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("born 1907")
    })

    it("omits birth info when birthday is null", () => {
      const actorNoBirthday = { ...mockActor, birthday: null }
      const prompt = buildCleanupPrompt(actorNoBirthday, mockSources)

      expect(prompt).not.toContain("born")
      expect(prompt).toContain("died 1979")
    })

    it("includes all source data with confidence percentages", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("--- Wikipedia (confidence: 85%) ---")
      expect(prompt).toContain("--- Wikidata (confidence: 90%) ---")
      expect(prompt).toContain("stomach cancer at UCLA Medical Center")
    })

    it("includes manner-of-death-specific guidance for violent deaths", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("VIOLENT DEATHS (homicide, assassination, accident)")
      expect(prompt).toContain("FOR VIOLENT DEATHS")
      expect(prompt).toContain("Lead with THE EVENT")
    })

    it("includes manner-of-death-specific guidance for natural deaths", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("FOR NATURAL DEATHS")
      expect(prompt).toContain("Lead with medical history")
    })

    it("includes guidance for overdose deaths", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("FOR OVERDOSE")
      expect(prompt).toContain("Toxicology findings")
    })

    it("includes guidance for suicide deaths", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("FOR SUICIDE")
      expect(prompt).toContain("medical examiner findings")
    })

    it("includes comprehensive rumored_circumstances instructions", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("Each major alternative theory SEPARATELY")
      expect(prompt).toContain("Name specific investigations")
      expect(prompt).toContain("Cite specific books, documentaries")
      expect(prompt).toContain("Warren Commission")
    })

    it("instructs to write in local news site tone", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("tone of a local news site")
      expect(prompt).toContain("tone similar to a local news site")
    })

    it("includes instruction to vary opening sentences", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("VARY your opening sentences")
    })

    it("includes instruction to adapt narrative to manner of death", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain("ADAPT narrative structure to manner of death")
    })

    it("requests JSON output with expected fields", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain('"cause"')
      expect(prompt).toContain('"cause_confidence"')
      expect(prompt).toContain('"details"')
      expect(prompt).toContain('"circumstances"')
      expect(prompt).toContain('"rumored_circumstances"')
      expect(prompt).toContain('"notable_factors"')
      expect(prompt).toContain('"categories"')
      expect(prompt).toContain('"has_substantive_content"')
    })

    it("includes expanded notable_factors tags", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      // Original tags
      expect(prompt).toContain("on_set")
      expect(prompt).toContain("vehicle_crash")
      expect(prompt).toContain("cancer")

      // New tags added in expansion
      expect(prompt).toContain("plane_crash")
      expect(prompt).toContain("assassination")
      expect(prompt).toContain("poisoning")
      expect(prompt).toContain("fall")
      expect(prompt).toContain("surgical_complications")
      expect(prompt).toContain("misdiagnosis")
      expect(prompt).toContain("pandemic")
      expect(prompt).toContain("war_related")
      expect(prompt).toContain("autoerotic_asphyxiation")
      expect(prompt).toContain("found_dead")
      expect(prompt).toContain("young_death")
      expect(prompt).toContain("terrorism")
      expect(prompt).toContain("electrocution")
      expect(prompt).toContain("exposure")
    })

    it("includes categories field with valid category values", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain('"categories"')
      expect(prompt).toContain("heart-disease")
      expect(prompt).toContain("neurological")
      expect(prompt).toContain("respiratory")
      expect(prompt).toContain("infectious")
      expect(prompt).toContain("liver-kidney")
    })

    it("includes manner field in JSON schema", () => {
      const prompt = buildCleanupPrompt(mockActor, mockSources)

      expect(prompt).toContain('"manner"')
      expect(prompt).toContain("medical examiner classification")
      expect(prompt).toContain("natural|accident|suicide|homicide|undetermined|pending")
    })
  })

  describe("manner validation with DeathMannerSchema", () => {
    it("accepts valid manner values", () => {
      const validValues = ["natural", "accident", "suicide", "homicide", "undetermined", "pending"]
      for (const value of validValues) {
        const result = DeathMannerSchema.safeParse(value)
        expect(result.success).toBe(true)
      }
    })

    it("rejects invalid manner values", () => {
      const invalidValues = ["accidental", "murder", "unknown", "Natural", "SUICIDE", ""]
      for (const value of invalidValues) {
        const result = DeathMannerSchema.safeParse(value)
        expect(result.success).toBe(false)
      }
    })

    it("rejects null and undefined", () => {
      expect(DeathMannerSchema.safeParse(null).success).toBe(false)
      expect(DeathMannerSchema.safeParse(undefined).success).toBe(false)
    })
  })

  describe("estimateCleanupCost", () => {
    it("estimates cost based on source text length", () => {
      const cost = estimateCleanupCost(mockSources)

      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(1) // Should be well under $1 for short text
    })

    it("increases cost with longer source text", () => {
      const shortSources: RawSourceData[] = [
        {
          sourceName: "Short",
          sourceType: DataSourceType.WIKIPEDIA,
          confidence: 0.5,
          text: "Died in 1979.",
        },
      ]
      const longSources: RawSourceData[] = [
        {
          sourceName: "Long",
          sourceType: DataSourceType.WIKIPEDIA,
          confidence: 0.5,
          text:
            "A ".repeat(10000) + "long biography with extensive details about health and death.",
        },
      ]

      const shortCost = estimateCleanupCost(shortSources)
      const longCost = estimateCleanupCost(longSources)

      expect(longCost).toBeGreaterThan(shortCost)
    })

    it("returns baseline cost for empty sources", () => {
      const cost = estimateCleanupCost([])

      // Even with no text, there's prompt overhead (500 tokens) + output estimate (800 tokens)
      // = (500 * 15 + 800 * 75) / 1_000_000 = 0.0675
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(0.1)
    })
  })
})
