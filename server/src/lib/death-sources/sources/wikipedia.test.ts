import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock cache (must be before source import)
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock the section selector module
vi.mock("../wikipedia-section-selector.js", () => ({
  selectRelevantSections: vi.fn(),
  isAISectionSelectionAvailable: vi.fn().mockReturnValue(false),
}))

// Mock the date extractor module
vi.mock("../wikipedia-date-extractor.js", () => ({
  extractDatesWithAI: vi.fn(),
  isAIDateExtractionAvailable: vi.fn().mockReturnValue(false),
}))

// Mock wtf_wikipedia
vi.mock("wtf_wikipedia", () => {
  const mockFetch = vi.fn()
  return {
    default: {
      fetch: mockFetch,
      Document: class {},
      Section: class {},
    },
    __mockFetch: mockFetch,
  }
})

import { WikipediaSource } from "./wikipedia.js"
import { DataSourceType, DEFAULT_WIKIPEDIA_OPTIONS } from "../types.js"
import {
  selectRelevantSections,
  isAISectionSelectionAvailable,
} from "../wikipedia-section-selector.js"
import wtf from "wtf_wikipedia"

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock wtf_wikipedia Section object.
 */
function mockSection(sectionTitle: string, sectionText: string, sectionDepth = 0) {
  return {
    title: () => sectionTitle,
    text: () => sectionText,
    depth: () => sectionDepth,
  }
}

/**
 * Create a mock wtf_wikipedia Document object.
 */
function mockDocument(
  docTitle: string,
  sectionList: ReturnType<typeof mockSection>[],
  options?: { isDisambig?: boolean }
) {
  return {
    title: () => docTitle,
    isDisambiguation: () => options?.isDisambig ?? false,
    sections: () => sectionList,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("WikipediaSource", () => {
  let source: WikipediaSource
  const mockWtfFetch = vi.mocked(wtf.fetch)
  const mockSelectSections = vi.mocked(selectRelevantSections)
  const mockIsAIAvailable = vi.mocked(isAISectionSelectionAvailable)

  beforeEach(() => {
    vi.clearAllMocks()
    source = new WikipediaSource()
    // Disable disambiguation handling for existing tests to avoid breaking them
    // New tests specifically for disambiguation are added below
    source.setWikipediaOptions({
      useAISectionSelection: false,
      handleDisambiguation: false,
      validatePersonDates: false,
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Wikipedia")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.WIKIPEDIA)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is always available", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("setWikipediaOptions", () => {
    it("merges options with defaults", () => {
      source.setWikipediaOptions({ followLinkedArticles: true })
      // Can't directly access private field, but we can verify behavior via lookup
      expect(source).toBeDefined()
    })
  })

  describe("lookup", () => {
    const mockActor = {
      id: 123,
      tmdbId: 456,
      name: "John Wayne",
      birthday: "1907-05-26",
      deathday: "1979-06-11",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 15.5,
    }

    it("returns results on successful lookup with Death section", async () => {
      const doc = mockDocument("John Wayne", [
        mockSection("", "John Wayne (May 26, 1907 – June 11, 1979) was an American actor."),
        mockSection("Early life", "Born Marion Robert Morrison in Winterset, Iowa."),
        mockSection("Career", "Wayne appeared in numerous westerns and war films."),
        mockSection(
          "Health",
          "Wayne's health declined throughout the 1970s. He had been diagnosed with lung cancer in 1964 and had a lung removed. He later developed stomach cancer which would ultimately cause his death."
        ),
        mockSection(
          "Death",
          "Wayne died on June 11, 1979, at UCLA Medical Center from stomach cancer. He had been battling cancer for several years following lung cancer surgery in 1964. His funeral was held at Our Lady Queen of Angels Catholic Church."
        ),
        mockSection("Legacy", "Wayne remains an iconic figure in American cinema."),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("stomach cancer")
      expect(result.source.url).toContain("wikipedia.org")
    })

    it("handles article not found error", async () => {
      // All article lookups (primary + alternates) return null
      mockWtfFetch.mockResolvedValue(null as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Article not found")
    })

    it("handles no death section found", async () => {
      const doc = mockDocument("John Wayne", [
        mockSection("", "John Wayne was an American actor."),
        mockSection(
          "Career",
          "Wayne appeared in many films spanning several decades of Hollywood history."
        ),
        mockSection(
          "Filmography",
          "A comprehensive list of his many film appearances and credits."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death section found")
    })

    it("handles fetch errors gracefully", async () => {
      // wtf.fetch throws on network errors
      mockWtfFetch.mockRejectedValue(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("handles network errors from wtf_wikipedia", async () => {
      mockWtfFetch.mockRejectedValue(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("extracts notable factors from text", async () => {
      const doc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was an American performer who died tragically young."),
        mockSection(
          "Death",
          "The actor took his own life at his home. The death was ruled a suicide by the coroner after an investigation. He had been struggling with depression for several years."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "Test Actor",
      })

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("suicide")
    })

    it("handles empty section content", async () => {
      const doc = mockDocument("John Wayne", [
        mockSection("", "Short intro."),
        mockSection("Early life", "Brief."),
        mockSection("Career", "Short."),
        mockSection("Health", "Brief."),
        mockSection("Death", "Short."),
        mockSection("Legacy", "Brief."),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No usable content")
    })

    it("finds fallback sections like Personal life", async () => {
      const doc = mockDocument("Jane Doe", [
        mockSection("", "Jane Doe was an American actress known for her many notable roles."),
        mockSection(
          "Career",
          "She appeared in numerous television shows throughout her lengthy career."
        ),
        mockSection(
          "Personal life",
          "Jane Doe passed away on December 15, 2023, at her home in Beverly Hills. She died peacefully surrounded by family after a long illness."
        ),
        mockSection(
          "Filmography",
          "A comprehensive list of her film and television appearances and credits."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "Jane Doe",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("passed away")
    })

    it("finds Assassination section for violent deaths", async () => {
      const doc = mockDocument("John F. Kennedy", [
        mockSection("", "John F. Kennedy was the 35th president of the United States."),
        mockSection("Early life", "Kennedy was born in Brookline, Massachusetts in 1917."),
        mockSection("Presidency", "Kennedy served as president from 1961 until his death in 1963."),
        mockSection(
          "Assassination",
          "Kennedy was assassinated on November 22, 1963, in Dallas, Texas. He was shot while riding in a presidential motorcade through Dealey Plaza."
        ),
        mockSection("Legacy", "Kennedy is remembered as one of the most popular presidents."),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "John F. Kennedy",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("assassinated")
    })

    it("finds Murder section for violent deaths", async () => {
      const doc = mockDocument("Test Actor", [
        mockSection(
          "",
          "Test Actor was a performer known for numerous roles in film and television."
        ),
        mockSection(
          "Career",
          "He appeared in many film productions throughout his lengthy career."
        ),
        mockSection(
          "Murder",
          "Test Actor was murdered on January 5, 2020, at their home in Los Angeles. The perpetrator was later arrested by police."
        ),
        mockSection("Legacy", "He is remembered fondly for his contributions to cinema."),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "Test Actor",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("murdered")
    })

    it("finds Plane crash section for accident deaths", async () => {
      const doc = mockDocument("Test Pilot", [
        mockSection("", "Test Pilot was a stunt performer and aviator known for daring feats."),
        mockSection(
          "Career",
          "He performed many dangerous stunts in numerous action films over the years."
        ),
        mockSection(
          "Plane crash",
          "The plane crashed on takeoff from Van Nuys Airport on March 3, 2019. All three people on board were killed in the fiery crash."
        ),
        mockSection(
          "Aftermath",
          "An investigation was launched by the NTSB into the crash and its causes."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "Test Pilot",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("plane crashed")
    })

    it("finds both Death and Assassination sections when both exist", async () => {
      const doc = mockDocument("Test Leader", [
        mockSection("", "Test Leader was a prominent political figure in American history."),
        mockSection(
          "Death",
          "Test Leader died on April 14, 1865, at Petersen House in Washington, D.C., surrounded by government officials and family members."
        ),
        mockSection(
          "Assassination",
          "The assassination was carried out by a gunman at Ford's Theatre during a performance of Our American Cousin on the evening of April 14."
        ),
        mockSection(
          "Legacy",
          "He is remembered as one of the greatest leaders in American history."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "Test Leader",
      })

      expect(result.success).toBe(true)
      // Should include content from both sections
      expect(result.data?.circumstances).toContain("died")
      expect(result.data?.circumstances).toContain("assassination")
    })

    it("matches 'Death and aftermath' pattern (catch-all at end of list)", async () => {
      const doc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was a well-known performer in Hollywood cinema."),
        mockSection("Career", "He appeared in many critically acclaimed films over the decades."),
        mockSection(
          "Death and controversy",
          "Test Actor died under controversial circumstances in 2020. The investigation revealed several suspicious elements surrounding the death."
        ),
        mockSection("Legacy", "His contributions to cinema are widely recognized and celebrated."),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup({
        ...mockActor,
        name: "Test Actor",
      })

      expect(result.success).toBe(true)
      // The catch-all /^death\b/i should match "Death and controversy"
      expect(result.data?.circumstances).toContain("controversial")
    })
  })

  describe("linked article fetching", () => {
    const mockActor = {
      id: 123,
      tmdbId: 456,
      name: "Test Actor",
      birthday: "1950-01-15",
      deathday: "2020-03-10",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    beforeEach(() => {
      // Enable linked article following, disable disambiguation for these tests
      source.setWikipediaOptions({
        ...DEFAULT_WIKIPEDIA_OPTIONS,
        followLinkedArticles: true,
        handleDisambiguation: false,
        validatePersonDates: false,
      })
    })

    it("includes linked article metadata in rawData when AI selects linked articles", async () => {
      // Enable AI section selection
      mockIsAIAvailable.mockReturnValue(true)
      mockSelectSections.mockResolvedValue({
        selectedSections: ["Death"],
        linkedArticles: ["2020_plane_crash"],
        usedAI: true,
        reasoning: "The Death section mentions a plane crash event",
        costUsd: 0.001,
      })

      source.setWikipediaOptions({
        useAISectionSelection: true,
        followLinkedArticles: true,
        maxLinkedArticles: 2,
        maxSections: 10,
        handleDisambiguation: false,
        validatePersonDates: false,
      })

      // Main article
      const mainDoc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was a famous performer who died in a tragic accident."),
        mockSection("Career", "He appeared in many notable films throughout his long career."),
        mockSection(
          "Death",
          "Test Actor died in the 2020 plane crash that killed multiple passengers and crew members aboard."
        ),
      ])

      // Linked article
      const linkedDoc = mockDocument("2020 plane crash", [
        mockSection(
          "",
          "The 2020 plane crash occurred on March 10, 2020, killing all 9 people aboard including Test Actor. The helicopter crashed into a hillside in foggy conditions."
        ),
        mockSection(
          "Background",
          "The flight departed from a local airport in poor weather conditions early that morning."
        ),
        mockSection(
          "Casualties",
          "All nine passengers and crew died in the crash along with the pilot."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(mainDoc as never).mockResolvedValueOnce(linkedDoc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.source.rawData).toBeDefined()
      const rawData = result.source.rawData as Record<string, unknown>
      expect(rawData.linkedArticleCount).toBe(1)
      expect(rawData.linkedArticlesFollowed).toContain("2020_plane_crash")
      expect(rawData.aiSectionSelection).toBeDefined()
      const aiSelection = rawData.aiSectionSelection as Record<string, unknown>
      expect(aiSelection.usedAI).toBe(true)
      expect(aiSelection.linkedArticles).toContain("2020_plane_crash")
    })

    it("handles missing linked articles gracefully", async () => {
      mockIsAIAvailable.mockReturnValue(true)
      mockSelectSections.mockResolvedValue({
        selectedSections: ["Death"],
        linkedArticles: ["Nonexistent_Article_12345"],
        usedAI: true,
        costUsd: 0.001,
      })

      source.setWikipediaOptions({
        useAISectionSelection: true,
        followLinkedArticles: true,
        maxLinkedArticles: 2,
        maxSections: 10,
        handleDisambiguation: false,
        validatePersonDates: false,
      })

      const mainDoc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was a famous performer known worldwide for his roles."),
        mockSection(
          "Death",
          "Died peacefully at home after a long illness on December 15, 2020. He was surrounded by family members at the time of his death."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(mainDoc as never).mockResolvedValueOnce(null as never) // linked article not found

      const result = await source.lookup(mockActor)

      // Should still succeed with main article content
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("peacefully")

      // Should not have linked article content
      const rawData = result.source.rawData as Record<string, unknown>
      expect(rawData.linkedArticleCount).toBeUndefined()
    })

    it("handles errors when fetching linked articles", async () => {
      mockIsAIAvailable.mockReturnValue(true)
      mockSelectSections.mockResolvedValue({
        selectedSections: ["Death"],
        linkedArticles: ["Error_Article"],
        usedAI: true,
        costUsd: 0.001,
      })

      source.setWikipediaOptions({
        useAISectionSelection: true,
        followLinkedArticles: true,
        maxLinkedArticles: 2,
        maxSections: 10,
        handleDisambiguation: false,
        validatePersonDates: false,
      })

      const mainDoc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was a famous performer known worldwide for many roles."),
        mockSection(
          "Death",
          "Died in tragic circumstances that shocked the world on March 15, 2020. The death came as a shock to fans and the entertainment industry."
        ),
      ])

      mockWtfFetch
        .mockResolvedValueOnce(mainDoc as never)
        .mockRejectedValueOnce(new Error("Network error")) // linked article fetch fails

      const result = await source.lookup(mockActor)

      // Should still succeed with main article content
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("tragic")
    })
  })

  describe("confidence calculation", () => {
    const mockActor = {
      id: 123,
      tmdbId: 456,
      name: "Test Actor",
      birthday: "1950-01-15",
      deathday: "2020-03-10",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("calculates higher confidence for content with death keywords", async () => {
      const doc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was a well-known American performer."),
        mockSection(
          "Death",
          "Test Actor died on March 10, 2020, at UCLA Medical Center from heart failure. The cause of death was confirmed by the Los Angeles County coroner following an autopsy. He had been hospitalized for complications from pneumonia and cardiac issues for several weeks before his passing. The actor passed away peacefully surrounded by his family at the hospital. His death came as a shock to the entertainment industry. He had been dealing with illness for several years and was known to have undergone surgery previously. The funeral was held at Forest Lawn Memorial Park with many celebrities in attendance to pay their respects."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // Should have higher confidence due to multiple death keywords and substantial content
      expect(result.source.confidence).toBeGreaterThan(0.5)
    })

    it("includes actor name in confidence calculation", async () => {
      const doc = mockDocument("Test Actor", [
        mockSection("", "Test Actor was a famous performer known worldwide."),
        mockSection(
          "Death",
          "Test Actor died peacefully at his home on March 10, 2020. He was found by family members in the morning. The death was attributed to natural causes according to the medical examiner."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // Confidence should be positive when actor name is mentioned with death keywords
      expect(result.source.confidence).toBeGreaterThan(0.4)
    })
  })

  describe("disambiguation handling", () => {
    const mockActor = {
      id: 435,
      tmdbId: 2157,
      name: "Graham Greene",
      birthday: "1952-06-22",
      deathday: null, // Still alive for testing date validation
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    const mockDeceasedActor = {
      id: 789,
      tmdbId: 1234,
      name: "Test Person",
      birthday: "1920-01-15",
      deathday: "1985-06-20",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 8.0,
    }

    beforeEach(() => {
      // Enable disambiguation handling for these tests
      source.setWikipediaOptions({
        useAISectionSelection: false,
        handleDisambiguation: true,
        validatePersonDates: true,
      })
    })

    it("detects disambiguation pages and tries alternate titles", async () => {
      // First request returns a disambiguation page
      const disambigDoc = mockDocument(
        "Graham Greene",
        [
          mockSection("", "Graham Greene may refer to several different people."),
          mockSection("People", "A list of people named Graham Greene."),
          mockSection("Given name", "People with the given name Graham."),
          mockSection("Surname", "People with the surname Greene."),
          mockSection("Arts, entertainment, and media", "Various works and artistic entities."),
          mockSection("Other uses", "Other uses of the name Graham Greene."),
        ],
        { isDisambig: true }
      )

      // Second request: _(actor) alternate — valid article
      const actorDoc = mockDocument("Graham Greene (actor)", [
        mockSection(
          "",
          "Graham Greene (born June 22, 1952) is a Canadian actor known for his roles."
        ),
        mockSection(
          "Early life",
          "Greene grew up in Ontario, Canada and showed early talent for acting."
        ),
        mockSection(
          "Career",
          "Greene is known for his roles in many films and television productions."
        ),
        mockSection(
          "Personal life",
          "Greene is known for his private personal life. He continues to act in various productions and has appeared in over fifty films throughout his career."
        ),
      ])

      mockWtfFetch
        .mockResolvedValueOnce(disambigDoc as never)
        .mockResolvedValueOnce(actorDoc as never)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("Graham_Greene_(actor)")
    })

    it("validates person by comparing birth/death years", async () => {
      // First request returns a page with wrong dates (1850-1910 vs expected 1920-1985)
      const wrongDoc = mockDocument("Test Person", [
        mockSection(
          "",
          "Test Person (1850-1910) was a famous historical figure who lived in Europe."
        ),
        mockSection(
          "Early life",
          "Born in a small village in the English countryside in the year 1850."
        ),
        mockSection(
          "Career",
          "He served as a distinguished diplomat for many decades of public service."
        ),
        mockSection(
          "Death",
          "He died in 1910 at his estate in the English countryside after many years of service."
        ),
      ])

      // Second request: _(actor) alternate — correct person
      const actorDoc = mockDocument("Test Person (actor)", [
        mockSection(
          "",
          "Test Person (1920-1985) was an American actor known for many roles in film."
        ),
        mockSection("Career", "He appeared in numerous Hollywood films over his extensive career."),
        mockSection(
          "Death",
          "Test Person died on June 20, 1985, at his home in Los Angeles after a long illness. He was surrounded by his family."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(wrongDoc as never).mockResolvedValueOnce(actorDoc as never)

      const result = await source.lookup(mockDeceasedActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("Los Angeles")
      expect(result.source.url).toContain("Test_Person_(actor)")
    })

    it("returns original result when no valid alternate found", async () => {
      // Disambiguation page with no working alternates
      const disambigDoc = mockDocument(
        "Rare Name",
        [
          mockSection("", "Rare Name may refer to several different things or people."),
          mockSection("People", "A list of people named Rare Name."),
          mockSection("Other uses", "Other uses of the term Rare Name."),
        ],
        { isDisambig: true }
      )

      // All alternate titles return null (not found)
      mockWtfFetch.mockResolvedValueOnce(disambigDoc as never).mockResolvedValue(null as never)

      const rareActor = {
        id: 999,
        tmdbId: 888,
        name: "Rare Name",
        birthday: "1960-01-01",
        deathday: "2020-12-25",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 5.0,
      }

      const result = await source.lookup(rareActor)

      // Should fail because no valid article was found
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("accepts articles with matching dates within tolerance", async () => {
      // Birthday is off by 1 year (within tolerance)
      const doc = mockDocument("Actor Name", [
        mockSection(
          "",
          "Actor Name (January 15, 1951 – March 10, 2020) was a performer known for many roles."
        ),
        mockSection(
          "Early life",
          "Born in a small midwestern town, he showed early promise as a performer."
        ),
        mockSection(
          "Death",
          "Actor Name died on March 10, 2020, from natural causes at his home. He was surrounded by his loving family."
        ),
      ])

      mockWtfFetch.mockResolvedValueOnce(doc as never)

      const toleranceActor = {
        id: 555,
        tmdbId: 666,
        name: "Actor Name",
        birthday: "1950-01-15", // Wikipedia says 1951 — 1 year off is OK
        deathday: "2020-03-10",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 7.0,
      }

      const result = await source.lookup(toleranceActor)

      // Should succeed because 1 year difference is within tolerance
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("natural causes")
    })
  })
})
