import { describe, it, expect } from "vitest"
import { DataSourceType, CostLimitExceededError } from "./types.js"
import type { CostBreakdown, CostLimitConfig, EnrichmentStats, BatchEnrichmentStats } from "./types.js"

describe("DataSourceType", () => {
  describe("AI Models", () => {
    it("includes Claude models", () => {
      expect(DataSourceType.CLAUDE).toBe("claude")
      expect(DataSourceType.CLAUDE_BATCH).toBe("claude_batch")
    })

    it("includes OpenAI models", () => {
      expect(DataSourceType.OPENAI_GPT4O).toBe("openai_gpt4o")
      expect(DataSourceType.OPENAI_GPT4O_MINI).toBe("openai_gpt4o_mini")
    })

    it("includes Perplexity", () => {
      expect(DataSourceType.PERPLEXITY).toBe("perplexity")
    })

    it("includes DeepSeek", () => {
      expect(DataSourceType.DEEPSEEK).toBe("deepseek")
    })

    it("includes Grok", () => {
      expect(DataSourceType.GROK).toBe("grok")
    })

    it("includes Gemini models", () => {
      expect(DataSourceType.GEMINI_PRO).toBe("gemini_pro")
      expect(DataSourceType.GEMINI_FLASH).toBe("gemini_flash")
    })
  })

  describe("Structured Data Sources", () => {
    it("includes Wikidata and Wikipedia", () => {
      expect(DataSourceType.WIKIDATA).toBe("wikidata")
      expect(DataSourceType.WIKIPEDIA).toBe("wikipedia")
    })

    it("includes TMDB and IMDB", () => {
      expect(DataSourceType.TMDB).toBe("tmdb")
      expect(DataSourceType.IMDB).toBe("imdb")
    })
  })

  describe("Cemetery/Obituary Sources", () => {
    it("includes Find a Grave", () => {
      expect(DataSourceType.FINDAGRAVE).toBe("findagrave")
    })

    it("includes Legacy.com", () => {
      expect(DataSourceType.LEGACY).toBe("legacy")
    })

    it("includes BillionGraves", () => {
      expect(DataSourceType.BILLIONGRAVES).toBe("billiongraves")
    })
  })

  describe("Search Engines", () => {
    it("includes DuckDuckGo", () => {
      expect(DataSourceType.DUCKDUCKGO).toBe("duckduckgo")
    })

    it("includes Google and Bing", () => {
      expect(DataSourceType.GOOGLE_SEARCH).toBe("google_search")
      expect(DataSourceType.BING_SEARCH).toBe("bing_search")
    })

    it("includes Brave Search", () => {
      expect(DataSourceType.BRAVE_SEARCH).toBe("brave_search")
    })
  })

  describe("News Sources", () => {
    it("includes NewsAPI", () => {
      expect(DataSourceType.NEWSAPI).toBe("newsapi")
    })

    it("includes major news outlets", () => {
      expect(DataSourceType.NYTIMES).toBe("nytimes")
      expect(DataSourceType.BBC_NEWS).toBe("bbc_news")
      expect(DataSourceType.GUARDIAN).toBe("guardian")
    })

    it("includes entertainment news", () => {
      expect(DataSourceType.VARIETY).toBe("variety")
      expect(DataSourceType.HOLLYWOOD_REPORTER).toBe("hollywood_reporter")
      expect(DataSourceType.TMZ).toBe("tmz")
    })
  })

  describe("Genealogy Sources", () => {
    it("includes Ancestry", () => {
      expect(DataSourceType.ANCESTRY).toBe("ancestry")
    })

    it("includes FamilySearch", () => {
      expect(DataSourceType.FAMILYSEARCH).toBe("familysearch")
    })

    it("includes MyHeritage", () => {
      expect(DataSourceType.MYHERITAGE).toBe("myheritage")
    })
  })

  describe("Public Records Sources", () => {
    it("includes court records", () => {
      expect(DataSourceType.PACER).toBe("pacer")
      expect(DataSourceType.COURTLISTENER).toBe("courtlistener")
    })

    it("includes accident investigations", () => {
      expect(DataSourceType.NTSB).toBe("ntsb")
      expect(DataSourceType.OSHA).toBe("osha")
    })

    it("includes coroner reports", () => {
      expect(DataSourceType.CORONER_REPORT).toBe("coroner_report")
    })
  })

  describe("Social Media Sources", () => {
    it("includes Twitter/X", () => {
      expect(DataSourceType.TWITTER_X).toBe("twitter_x")
    })

    it("includes Reddit", () => {
      expect(DataSourceType.REDDIT).toBe("reddit")
    })
  })

  describe("Book/Archive Sources", () => {
    it("includes Google Books", () => {
      expect(DataSourceType.GOOGLE_BOOKS).toBe("google_books")
    })

    it("includes Internet Archive", () => {
      expect(DataSourceType.INTERNET_ARCHIVE).toBe("internet_archive")
    })
  })

  it("has at least 60 source types defined", () => {
    const sourceCount = Object.keys(DataSourceType).length
    expect(sourceCount).toBeGreaterThanOrEqual(60)
  })
})

describe("Cost Types", () => {
  describe("CostBreakdown", () => {
    it("can be created with empty bySource", () => {
      const breakdown: CostBreakdown = {
        bySource: {} as Record<DataSourceType, number>,
        total: 0,
      }
      expect(breakdown.total).toBe(0)
      expect(Object.keys(breakdown.bySource).length).toBe(0)
    })

    it("can track costs by source", () => {
      const breakdown: CostBreakdown = {
        bySource: {
          [DataSourceType.OPENAI_GPT4O]: 0.01,
          [DataSourceType.PERPLEXITY]: 0.005,
        } as Record<DataSourceType, number>,
        total: 0.015,
      }
      expect(breakdown.bySource[DataSourceType.OPENAI_GPT4O]).toBe(0.01)
      expect(breakdown.bySource[DataSourceType.PERPLEXITY]).toBe(0.005)
      expect(breakdown.total).toBe(0.015)
    })
  })

  describe("CostLimitConfig", () => {
    it("can have both limits defined", () => {
      const config: CostLimitConfig = {
        maxCostPerActor: 0.05,
        maxTotalCost: 2.0,
      }
      expect(config.maxCostPerActor).toBe(0.05)
      expect(config.maxTotalCost).toBe(2.0)
    })

    it("can have only per-actor limit", () => {
      const config: CostLimitConfig = {
        maxCostPerActor: 0.05,
      }
      expect(config.maxCostPerActor).toBe(0.05)
      expect(config.maxTotalCost).toBeUndefined()
    })

    it("can have only total limit", () => {
      const config: CostLimitConfig = {
        maxTotalCost: 2.0,
      }
      expect(config.maxCostPerActor).toBeUndefined()
      expect(config.maxTotalCost).toBe(2.0)
    })
  })

  describe("EnrichmentStats costBreakdown", () => {
    it("includes costBreakdown field", () => {
      const stats: EnrichmentStats = {
        actorId: 1,
        actorName: "Test Actor",
        deathYear: 2020,
        fieldsFilledBefore: [],
        fieldsFilledAfter: ["circumstances"],
        sourcesAttempted: [],
        finalSource: DataSourceType.WIKIDATA,
        confidence: 0.8,
        totalCostUsd: 0.015,
        totalTimeMs: 1000,
        costBreakdown: {
          bySource: {
            [DataSourceType.WIKIDATA]: 0,
            [DataSourceType.OPENAI_GPT4O_MINI]: 0.015,
          } as Record<DataSourceType, number>,
          total: 0.015,
        },
      }
      expect(stats.costBreakdown.total).toBe(0.015)
      expect(stats.costBreakdown.bySource[DataSourceType.OPENAI_GPT4O_MINI]).toBe(0.015)
    })
  })

  describe("BatchEnrichmentStats costBySource", () => {
    it("includes costBySource field", () => {
      const stats: BatchEnrichmentStats = {
        actorsProcessed: 10,
        actorsEnriched: 8,
        fillRate: 80,
        totalCostUsd: 0.15,
        totalTimeMs: 10000,
        sourceHitRates: {} as Record<DataSourceType, number>,
        costBySource: {
          [DataSourceType.OPENAI_GPT4O_MINI]: 0.05,
          [DataSourceType.PERPLEXITY]: 0.10,
        } as Record<DataSourceType, number>,
        errors: [],
      }
      expect(stats.costBySource[DataSourceType.OPENAI_GPT4O_MINI]).toBe(0.05)
      expect(stats.costBySource[DataSourceType.PERPLEXITY]).toBe(0.10)
    })
  })
})
