import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ResearchSubject } from "@debriefer/core"

// Mock the wikipedia-date-extractor module
vi.mock("../../wikipedia-date-extractor.js", () => ({
  extractDatesWithAI: vi.fn(),
  isAIDateExtractionAvailable: vi.fn(),
}))

import { createPersonValidator } from "../person-validator.js"
import { extractDatesWithAI, isAIDateExtractionAvailable } from "../../wikipedia-date-extractor.js"

const mockExtractDatesWithAI = vi.mocked(extractDatesWithAI)
const mockIsAIAvailable = vi.mocked(isAIDateExtractionAvailable)

function makeSubject(overrides: Partial<ResearchSubject> = {}): ResearchSubject {
  return {
    id: 1,
    name: "John Wayne",
    context: {
      birthday: "1907-05-26",
      deathday: "1979-06-11",
    },
    ...overrides,
  }
}

const JOHN_WAYNE_INTRO =
  "John Wayne (born Marion Robert Morrison; May 26, 1907 – June 11, 1979) was an American actor."

const WRONG_PERSON_INTRO =
  "John Wayne (born March 15, 1850 – died November 2, 1920) was a railroad engineer."

describe("createPersonValidator", () => {
  let validate: (articleText: string, subject: ResearchSubject) => Promise<boolean>

  beforeEach(() => {
    vi.clearAllMocks()
    validate = createPersonValidator()
  })

  describe("with AI date extraction available", () => {
    beforeEach(() => {
      mockIsAIAvailable.mockReturnValue(true)
    })

    it("returns true when AI-extracted dates match", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: 1907,
        deathYear: 1979,
        costUsd: 0.0001,
        usedAI: true,
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true)
      expect(mockExtractDatesWithAI).toHaveBeenCalledOnce()
    })

    it("returns false when AI-extracted birth year mismatches", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: 1850,
        deathYear: 1979,
        costUsd: 0.0001,
        usedAI: true,
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(false)
    })

    it("returns false when AI-extracted death year mismatches", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: 1907,
        deathYear: 1920,
        costUsd: 0.0001,
        usedAI: true,
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(false)
    })

    it("allows 1-year tolerance for birth year", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: 1908, // 1 year off from 1907
        deathYear: 1979,
        costUsd: 0.0001,
        usedAI: true,
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true)
    })

    it("allows 1-year tolerance for death year", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: 1907,
        deathYear: 1978, // 1 year off from 1979
        costUsd: 0.0001,
        usedAI: true,
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true)
    })

    it("rejects 2-year difference", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: 1905, // 2 years off
        deathYear: 1979,
        costUsd: 0.0001,
        usedAI: true,
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(false)
    })

    it("falls back to regex when AI returns no results", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: null,
        deathYear: null,
        costUsd: 0.0001,
        usedAI: true,
      })

      // Regex should extract from "(May 26, 1907 – June 11, 1979)"
      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true)
    })

    it("falls back to regex when AI fails with error", async () => {
      mockExtractDatesWithAI.mockResolvedValue({
        birthYear: null,
        deathYear: null,
        costUsd: 0,
        usedAI: false,
        error: "API timeout",
      })

      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true) // regex extracts correct dates
    })
  })

  describe("with useAIDateValidation disabled", () => {
    beforeEach(() => {
      mockIsAIAvailable.mockReturnValue(true) // AI is available but disabled by config
      validate = createPersonValidator({ useAIDateValidation: false })
    })

    it("skips AI and uses regex even when AI is available", async () => {
      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true)
      expect(mockExtractDatesWithAI).not.toHaveBeenCalled()
    })
  })

  describe("with AI date extraction unavailable", () => {
    beforeEach(() => {
      mockIsAIAvailable.mockReturnValue(false)
    })

    it("uses regex to extract full date lifespan", async () => {
      const result = await validate(JOHN_WAYNE_INTRO, makeSubject())
      expect(result).toBe(true)
      expect(mockExtractDatesWithAI).not.toHaveBeenCalled()
    })

    it("uses regex to extract simple year lifespan", async () => {
      const intro = "Jane Smith (1920–1999) was a British actress."
      const subject = makeSubject({
        name: "Jane Smith",
        context: { birthday: "1920-03-15", deathday: "1999-07-22" },
      })

      const result = await validate(intro, subject)
      expect(result).toBe(true)
    })

    it("uses regex to extract born/died keywords", async () => {
      const intro = "He was born in 1907 in Winterset, Iowa. He died in 1979 in Los Angeles."
      const result = await validate(intro, makeSubject())
      expect(result).toBe(true)
    })

    it("rejects wrong person via regex", async () => {
      const result = await validate(WRONG_PERSON_INTRO, makeSubject())
      expect(result).toBe(false)
    })
  })

  describe("edge cases", () => {
    beforeEach(() => {
      mockIsAIAvailable.mockReturnValue(false)
    })

    it("returns true when actor has no birthday or deathday", async () => {
      const subject = makeSubject({ context: {} })
      const result = await validate(JOHN_WAYNE_INTRO, subject)
      expect(result).toBe(true)
    })

    it("returns true when actor has no context", async () => {
      const subject: ResearchSubject = { id: 1, name: "John Wayne" }
      const result = await validate(JOHN_WAYNE_INTRO, subject)
      expect(result).toBe(true)
    })

    it("returns true when article text is empty", async () => {
      const result = await validate("", makeSubject())
      expect(result).toBe(true)
    })

    it("returns true when no years can be extracted from article", async () => {
      const result = await validate("This is a short article with no dates.", makeSubject())
      expect(result).toBe(true)
    })

    it("validates only birth year when actor has no deathday", async () => {
      const subject = makeSubject({
        context: { birthday: "1907-05-26", deathday: null },
      })
      // Intro has birth year 1907 — should match
      const result = await validate(JOHN_WAYNE_INTRO, subject)
      expect(result).toBe(true)
    })

    it("validates only death year when actor has no birthday", async () => {
      const subject = makeSubject({
        context: { birthday: null, deathday: "1979-06-11" },
      })
      const result = await validate(JOHN_WAYNE_INTRO, subject)
      expect(result).toBe(true)
    })

    it("rejects mismatch on only available date", async () => {
      const subject = makeSubject({
        context: { birthday: "1850-03-15", deathday: null },
      })
      // Intro has birth year 1907, DB has 1850 — mismatch
      const result = await validate(JOHN_WAYNE_INTRO, subject)
      expect(result).toBe(false)
    })
  })
})
