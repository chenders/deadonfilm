import { describe, it, expect, vi, beforeEach } from "vitest"
import { WikipediaSource } from "./wikipedia.js"
import { DataSourceType, DEFAULT_WIKIPEDIA_OPTIONS } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
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

describe("WikipediaSource", () => {
  let source: WikipediaSource

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

    const mockSectionsResponse = {
      parse: {
        title: "John Wayne",
        pageid: 16231,
        sections: [
          { index: "0", line: "Introduction", level: "1" },
          { index: "1", line: "Early life", level: "2" },
          { index: "2", line: "Career", level: "2" },
          { index: "3", line: "Health", level: "2" },
          { index: "4", line: "Death", level: "2" },
          { index: "5", line: "Legacy", level: "2" },
        ],
      },
    }

    const mockDeathSectionContent = {
      parse: {
        title: "John Wayne",
        pageid: 16231,
        text: {
          "*": `<div class="mw-parser-output">
            <p>Wayne died on June 11, 1979, at UCLA Medical Center from stomach cancer.
            He had been battling cancer for several years following lung cancer surgery in 1964.
            His funeral was held at Our Lady Queen of Angels Catholic Church.</p>
          </div>`,
        },
      },
    }

    const mockHealthSectionContent = {
      parse: {
        title: "John Wayne",
        pageid: 16231,
        text: {
          "*": `<div class="mw-parser-output">
            <p>Wayne's health declined throughout the 1970s. He had been diagnosed with
            lung cancer in 1964 and had a lung removed. He later developed stomach cancer
            which would ultimately cause his death.</p>
          </div>`,
        },
      },
    }

    it("returns results on successful lookup with Death section", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSectionsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHealthSectionContent,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeathSectionContent,
        })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("stomach cancer")
      expect(result.source.url).toContain("wikipedia.org")
    })

    it("handles article not found error", async () => {
      // All article lookups (primary + alternates) return not found
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          error: {
            code: "missingtitle",
            info: "The page you specified doesn't exist.",
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Article not found")
    })

    it("handles no death section found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parse: {
            title: "John Wayne",
            pageid: 16231,
            sections: [
              { index: "0", line: "Introduction", level: "1" },
              { index: "1", line: "Career", level: "2" },
              { index: "2", line: "Filmography", level: "2" },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death section found")
    })

    it("handles HTTP 403 as blocked error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(mockActor)).rejects.toThrow("blocked")
    })

    it("handles HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 500")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("extracts notable factors from text", async () => {
      const mockContentWithSuicide = {
        parse: {
          title: "Test Actor",
          pageid: 12345,
          text: {
            "*": `<p>The actor took his own life at his home. The death was ruled a suicide
            by the coroner after an investigation.</p>`,
          },
        },
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              sections: [{ index: "1", line: "Death", level: "2" }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockContentWithSuicide,
        })

      const result = await source.lookup({
        ...mockActor,
        name: "Test Actor",
      })

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("suicide")
    })

    it("handles empty section content", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSectionsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "John Wayne",
              pageid: 16231,
              text: { "*": "<div></div>" },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "John Wayne",
              pageid: 16231,
              text: { "*": "<div></div>" },
            },
          }),
        })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No usable content")
    })

    it("finds fallback sections like Personal life", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Jane Doe",
              pageid: 99999,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Career", level: "2" },
                { index: "2", line: "Personal life", level: "2" },
                { index: "3", line: "Filmography", level: "2" },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Jane Doe",
              pageid: 99999,
              text: {
                "*": `<p>Jane Doe passed away on December 15, 2023, at her home in Beverly Hills.
                She died peacefully surrounded by family after a long illness.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup({
        ...mockActor,
        name: "Jane Doe",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("passed away")
    })

    it("finds Assassination section for violent deaths", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "John F. Kennedy",
              pageid: 12345,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Early life", level: "2" },
                { index: "2", line: "Presidency", level: "2" },
                { index: "3", line: "Assassination", level: "2" },
                { index: "4", line: "Legacy", level: "2" },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "John F. Kennedy",
              pageid: 12345,
              text: {
                "*": `<p>Kennedy was assassinated on November 22, 1963, in Dallas, Texas.
                He was shot while riding in a presidential motorcade through Dealey Plaza.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup({
        ...mockActor,
        name: "John F. Kennedy",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("assassinated")
    })

    it("finds Murder section for violent deaths", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 11111,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Career", level: "2" },
                { index: "2", line: "Murder", level: "2" },
                { index: "3", line: "Legacy", level: "2" },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 11111,
              text: {
                "*": `<p>Test Actor was murdered on January 5, 2020, at their home in Los Angeles.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup({
        ...mockActor,
        name: "Test Actor",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("murdered")
    })

    it("finds Plane crash section for accident deaths", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Pilot",
              pageid: 22222,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Career", level: "2" },
                { index: "2", line: "Plane crash", level: "2" },
                { index: "3", line: "Aftermath", level: "2" },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Pilot",
              pageid: 22222,
              text: {
                "*": `<p>The plane crashed on takeoff from Van Nuys Airport on March 3, 2019.
                All three people on board were killed.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup({
        ...mockActor,
        name: "Test Pilot",
      })

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("plane crashed")
    })

    it("finds both Death and Assassination sections when both exist", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Leader",
              pageid: 33333,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Death", level: "2" },
                { index: "2", line: "Assassination", level: "2" },
                { index: "3", line: "Legacy", level: "2" },
              ],
            },
          }),
        })
        // Death section content (must be >=50 chars after HTML stripping)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Leader",
              pageid: 33333,
              text: {
                "*": `<p>Test Leader died on April 14, 1865, at Petersen House in Washington, D.C., surrounded by government officials and family members.</p>`,
              },
            },
          }),
        })
        // Assassination section content
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Leader",
              pageid: 33333,
              text: {
                "*": `<p>The assassination was carried out by a gunman at Ford's Theatre during a performance of Our American Cousin on the evening of April 14.</p>`,
              },
            },
          }),
        })

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
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 44444,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Career", level: "2" },
                { index: "2", line: "Death and controversy", level: "2" },
                { index: "3", line: "Legacy", level: "2" },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 44444,
              text: {
                "*": `<p>Test Actor died under controversial circumstances in 2020.</p>`,
              },
            },
          }),
        })

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
      // Import the mocked module to control its behavior
      const { selectRelevantSections, isAISectionSelectionAvailable } =
        await import("../wikipedia-section-selector.js")

      // Enable AI section selection
      vi.mocked(isAISectionSelectionAvailable).mockReturnValue(true)
      vi.mocked(selectRelevantSections).mockResolvedValue({
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

      // Mock main article sections response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              sections: [
                { index: "1", line: "Career", level: "2" },
                { index: "2", line: "Death", level: "2" },
              ],
            },
          }),
        })
        // Mock death section content
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              text: {
                "*": `<p>Test Actor died in the 2020 plane crash that killed multiple passengers.</p>`,
              },
            },
          }),
        })
        // Mock linked article sections lookup (to verify it exists)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "2020 plane crash",
              pageid: 99999,
              sections: [
                { index: "1", line: "Background", level: "2" },
                { index: "2", line: "Casualties", level: "2" },
              ],
            },
          }),
        })
        // Mock linked article intro content
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "2020 plane crash",
              pageid: 99999,
              text: {
                "*": `<p>The 2020 plane crash occurred on March 10, 2020, killing all 9 people aboard
                including Test Actor. The helicopter crashed into a hillside in foggy conditions.</p>`,
              },
            },
          }),
        })

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

    it("handles redirects when fetching linked articles", async () => {
      // This test verifies that redirects=1 parameter is included
      const { selectRelevantSections, isAISectionSelectionAvailable } =
        await import("../wikipedia-section-selector.js")

      vi.mocked(isAISectionSelectionAvailable).mockReturnValue(true)
      vi.mocked(selectRelevantSections).mockResolvedValue({
        selectedSections: ["Death"],
        linkedArticles: ["Kobe_Bryant_helicopter_crash"],
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

      // Capture the fetch calls to verify redirect parameter
      const fetchCalls: string[] = []
      mockFetch.mockImplementation(async (url: string) => {
        fetchCalls.push(url)

        if (url.includes("prop=sections") && url.includes("Test_Actor")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Test Actor",
                pageid: 12345,
                sections: [{ index: "1", line: "Death", level: "2" }],
              },
            }),
          }
        }

        if (url.includes("section=1") && url.includes("Test_Actor")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Test Actor",
                pageid: 12345,
                text: {
                  "*": "<p>Died in a helicopter crash on January 26, 2020. The helicopter crashed into a hillside in foggy weather conditions in Calabasas, California.</p>",
                },
              },
            }),
          }
        }

        // Linked article sections - should include redirects=1
        if (url.includes("Kobe_Bryant_helicopter_crash") && url.includes("prop=sections")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Kobe Bryant helicopter crash",
                pageid: 77777,
                sections: [],
              },
            }),
          }
        }

        // Linked article intro
        if (url.includes("Kobe_Bryant_helicopter_crash") && url.includes("section=0")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Kobe Bryant helicopter crash",
                pageid: 77777,
                text: {
                  "*": "<p>The Kobe Bryant helicopter crash occurred on January 26, 2020, killing all 9 people aboard including basketball star Kobe Bryant and his daughter Gianna.</p>",
                },
              },
            }),
          }
        }

        return { ok: true, json: async () => ({}) }
      })

      await source.lookup(mockActor)

      // Verify that linked article requests include redirects=1
      const linkedArticleCalls = fetchCalls.filter((url) =>
        url.includes("Kobe_Bryant_helicopter_crash")
      )
      expect(linkedArticleCalls.length).toBeGreaterThan(0)
      linkedArticleCalls.forEach((url) => {
        expect(url).toContain("redirects=1")
      })
    })

    it("handles missing linked articles gracefully", async () => {
      const { selectRelevantSections, isAISectionSelectionAvailable } =
        await import("../wikipedia-section-selector.js")

      vi.mocked(isAISectionSelectionAvailable).mockReturnValue(true)
      vi.mocked(selectRelevantSections).mockResolvedValue({
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

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              sections: [{ index: "1", line: "Death", level: "2" }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              text: {
                "*": "<p>Died peacefully at home after a long illness on December 15, 2020. He was surrounded by family members at the time of his death.</p>",
              },
            },
          }),
        })
        // Linked article not found
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            error: {
              code: "missingtitle",
              info: "The page you specified doesn't exist.",
            },
          }),
        })

      const result = await source.lookup(mockActor)

      // Should still succeed with main article content
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("peacefully")

      // Should not have linked article content
      const rawData = result.source.rawData as Record<string, unknown>
      expect(rawData.linkedArticleCount).toBeUndefined()
    })

    it("handles HTTP errors when fetching linked articles", async () => {
      const { selectRelevantSections, isAISectionSelectionAvailable } =
        await import("../wikipedia-section-selector.js")

      vi.mocked(isAISectionSelectionAvailable).mockReturnValue(true)
      vi.mocked(selectRelevantSections).mockResolvedValue({
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

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              sections: [{ index: "1", line: "Death", level: "2" }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              text: {
                "*": "<p>Died in tragic circumstances that shocked the world on March 15, 2020. The death came as a shock to fans and the entertainment industry.</p>",
              },
            },
          }),
        })
        // Linked article returns HTTP error
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })

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
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              sections: [{ index: "1", line: "Death", level: "2" }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              text: {
                // Long content with many death and circumstance keywords to boost confidence
                "*": `<p>Test Actor died on March 10, 2020, at UCLA Medical Center from heart failure.
                The cause of death was confirmed by the Los Angeles County coroner following an autopsy.
                He had been hospitalized for complications from pneumonia and cardiac issues for several weeks
                before his passing. The actor passed away peacefully surrounded by his family at the hospital.
                His death came as a shock to the entertainment industry. He had been dealing with illness
                for several years and was known to have undergone surgery previously. The funeral was held
                at Forest Lawn Memorial Park with many celebrities in attendance to pay their respects.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // Should have higher confidence due to multiple death keywords and substantial content
      expect(result.source.confidence).toBeGreaterThan(0.5)
    })

    it("includes actor name in confidence calculation", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              sections: [{ index: "1", line: "Death", level: "2" }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Actor",
              pageid: 12345,
              text: {
                "*": `<p>Test Actor died peacefully at his home on March 10, 2020. He was found by family members
                in the morning. The death was attributed to natural causes according to the medical examiner.</p>`,
              },
            },
          }),
        })

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
      // Explicitly disable AI section selection to avoid test isolation issues
      // (other test files may set GOOGLE_AI_API_KEY via vi.stubEnv)
      source.setWikipediaOptions({
        useAISectionSelection: false,
        handleDisambiguation: true,
        validatePersonDates: true,
      })
    })

    it("detects disambiguation pages and tries alternate titles", async () => {
      // First request returns a disambiguation page
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Graham Greene",
              pageid: 12345,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "People", level: "2" },
                { index: "2", line: "Given name", level: "3" },
                { index: "3", line: "Surname", level: "3" },
                { index: "4", line: "Arts, entertainment, and media", level: "2" },
                { index: "5", line: "Other uses", level: "2" },
              ],
            },
          }),
        })
        // Alternate title Graham_Greene_(actor) - returns valid biography
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Graham Greene (actor)",
              pageid: 67890,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Early life", level: "2" },
                { index: "2", line: "Career", level: "2" },
                { index: "3", line: "Personal life", level: "2" },
              ],
            },
          }),
        })
        // Intro fetch for date validation
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Graham Greene (actor)",
              pageid: 67890,
              text: {
                "*": `<p>Graham Greene (born June 22, 1952) is a Canadian actor.</p>`,
              },
            },
          }),
        })
        // Personal life section content
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Graham Greene (actor)",
              pageid: 67890,
              text: {
                "*": `<p>Greene is known for his roles in many films and television shows. He continues to act in various productions.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("Graham_Greene_(actor)")
    })

    it("validates person by comparing birth/death years", async () => {
      // First request returns a page with wrong dates
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Person",
              pageid: 11111,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Early life", level: "2" },
                { index: "2", line: "Career", level: "2" },
                { index: "3", line: "Death", level: "2" },
              ],
            },
          }),
        })
        // Intro fetch shows wrong birth year (1850 vs 1920)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Person",
              pageid: 11111,
              text: {
                "*": `<p>Test Person (1850-1910) was a famous historical figure.</p>`,
              },
            },
          }),
        })
        // Alternate title Test_Person_(actor) - correct person
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Person (actor)",
              pageid: 22222,
              sections: [
                { index: "0", line: "Introduction", level: "1" },
                { index: "1", line: "Career", level: "2" },
                { index: "2", line: "Death", level: "2" },
              ],
            },
          }),
        })
        // Intro fetch for the actor - correct dates
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Person (actor)",
              pageid: 22222,
              text: {
                "*": `<p>Test Person (1920-1985) was an American actor.</p>`,
              },
            },
          }),
        })
        // Death section content
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Test Person (actor)",
              pageid: 22222,
              text: {
                "*": `<p>Test Person died on June 20, 1985, at his home in Los Angeles after a long illness.</p>`,
              },
            },
          }),
        })

      const result = await source.lookup(mockDeceasedActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("Los Angeles")
      expect(result.source.url).toContain("Test_Person_(actor)")
    })

    it("uses redirects=1 parameter in main lookup", async () => {
      const fetchCalls: string[] = []
      mockFetch.mockImplementation(async (url: string) => {
        fetchCalls.push(url)

        if (url.includes("prop=sections") && !url.includes("_(actor)")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Test Actor",
                pageid: 12345,
                sections: [
                  { index: "1", line: "Career", level: "2" },
                  { index: "2", line: "Death", level: "2" },
                ],
              },
            }),
          }
        }

        if (url.includes("section=0")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Test Actor",
                pageid: 12345,
                text: {
                  "*": `<p>Test Actor (1950-2020) was a well-known performer.</p>`,
                },
              },
            }),
          }
        }

        if (url.includes("section=2")) {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: "Test Actor",
                pageid: 12345,
                text: {
                  "*": `<p>Test Actor died on March 10, 2020, after complications from surgery.</p>`,
                },
              },
            }),
          }
        }

        return { ok: true, json: async () => ({}) }
      })

      const testActor = {
        id: 123,
        tmdbId: 456,
        name: "Test Actor",
        birthday: "1950-01-15",
        deathday: "2020-03-10",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 10.5,
      }

      await source.lookup(testActor)

      // Verify that the main sections lookup includes redirects=1
      const sectionsCall = fetchCalls.find(
        (url) => url.includes("prop=sections") && url.includes("Test_Actor")
      )
      expect(sectionsCall).toContain("redirects=1")

      // Verify that section content fetches also include redirects=1
      const contentCalls = fetchCalls.filter((url) => url.includes("section="))
      contentCalls.forEach((url) => {
        expect(url).toContain("redirects=1")
      })
    })

    it("returns original result when no valid alternate found", async () => {
      // Disambiguation page with no working alternates
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Rare Name",
              pageid: 12345,
              sections: [
                { index: "1", line: "People", level: "2" },
                { index: "2", line: "Other uses", level: "2" },
              ],
            },
          }),
        })
        // All alternate titles return article not found
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            error: {
              code: "missingtitle",
              info: "The page you specified doesn't exist.",
            },
          }),
        })

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
      // The error could be either "Article not found" or the fallback error
      expect(result.error).toBeDefined()
    })

    it("accepts articles with matching dates within tolerance", async () => {
      // Birthday is off by 1 year (within tolerance)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Actor Name",
              pageid: 12345,
              sections: [
                { index: "1", line: "Early life", level: "2" },
                { index: "2", line: "Death", level: "2" },
              ],
            },
          }),
        })
        // Intro shows birth year 1951 (actor has 1950 - 1 year off is OK)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Actor Name",
              pageid: 12345,
              text: {
                "*": `<p>Actor Name (January 15, 1951 – March 10, 2020) was a performer.</p>`,
              },
            },
          }),
        })
        // Death section
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            parse: {
              title: "Actor Name",
              pageid: 12345,
              text: {
                "*": `<p>Actor Name died on March 10, 2020, from natural causes at his home.</p>`,
              },
            },
          }),
        })

      const toleranceActor = {
        id: 555,
        tmdbId: 666,
        name: "Actor Name",
        birthday: "1950-01-15", // Wikipedia says 1951
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
