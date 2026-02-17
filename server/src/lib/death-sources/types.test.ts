import { describe, it, expect } from "vitest"
import {
  DataSourceType,
  ReliabilityTier,
  RELIABILITY_SCORES,
  SourceAccessBlockedError,
} from "./types.js"
import type {
  CostBreakdown,
  CostLimitConfig,
  EnrichmentStats,
  BatchEnrichmentStats,
} from "./types.js"

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

  describe("Film Industry Archives", () => {
    it("includes Television Academy", () => {
      expect(DataSourceType.TELEVISION_ACADEMY).toBe("television_academy")
    })

    it("includes IBDB (Broadway)", () => {
      expect(DataSourceType.IBDB).toBe("ibdb")
    })

    it("includes BFI Sight & Sound", () => {
      expect(DataSourceType.BFI_SIGHT_SOUND).toBe("bfi_sight_sound")
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
          [DataSourceType.PERPLEXITY]: 0.1,
        } as Record<DataSourceType, number>,
        errors: [],
      }
      expect(stats.costBySource[DataSourceType.OPENAI_GPT4O_MINI]).toBe(0.05)
      expect(stats.costBySource[DataSourceType.PERPLEXITY]).toBe(0.1)
    })
  })
})

describe("ReliabilityTier", () => {
  it("has 12 tiers defined", () => {
    const tiers = Object.values(ReliabilityTier)
    expect(tiers).toHaveLength(12)
  })

  it("has a score mapping for every tier", () => {
    for (const tier of Object.values(ReliabilityTier)) {
      expect(RELIABILITY_SCORES[tier]).toBeDefined()
      expect(typeof RELIABILITY_SCORES[tier]).toBe("number")
    }
  })

  it("has scores between 0 and 1", () => {
    for (const [tier, score] of Object.entries(RELIABILITY_SCORES)) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  it("maps STRUCTURED_DATA to 1.0 (highest)", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.STRUCTURED_DATA]).toBe(1.0)
  })

  it("maps TIER_1_NEWS to 0.95", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.TIER_1_NEWS]).toBe(0.95)
  })

  it("maps TRADE_PRESS to 0.9", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.TRADE_PRESS]).toBe(0.9)
  })

  it("maps AI_MODEL to 0.55", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.AI_MODEL]).toBe(0.55)
  })

  it("maps UNRELIABLE_UGC to 0.35 (lowest)", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.UNRELIABLE_UGC]).toBe(0.35)
  })

  it("ranks structured data higher than user-generated content", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.STRUCTURED_DATA]).toBeGreaterThan(
      RELIABILITY_SCORES[ReliabilityTier.UNRELIABLE_UGC]
    )
  })

  it("ranks tier 1 news higher than AI models", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.TIER_1_NEWS]).toBeGreaterThan(
      RELIABILITY_SCORES[ReliabilityTier.AI_MODEL]
    )
  })

  it("ranks search aggregators higher than unreliable sources", () => {
    expect(RELIABILITY_SCORES[ReliabilityTier.SEARCH_AGGREGATOR]).toBeGreaterThan(
      RELIABILITY_SCORES[ReliabilityTier.UNRELIABLE_FAST]
    )
  })
})

describe("SourceAccessBlockedError", () => {
  it("can be constructed with all fields", () => {
    const error = new SourceAccessBlockedError(
      "IBDB returned 403 Forbidden",
      DataSourceType.IBDB,
      "https://www.ibdb.com/search",
      403
    )

    expect(error.message).toBe("IBDB returned 403 Forbidden")
    expect(error.sourceType).toBe(DataSourceType.IBDB)
    expect(error.url).toBe("https://www.ibdb.com/search")
    expect(error.statusCode).toBe(403)
    expect(error.name).toBe("SourceAccessBlockedError")
  })

  it("is an instance of Error", () => {
    const error = new SourceAccessBlockedError(
      "Test error",
      DataSourceType.TELEVISION_ACADEMY,
      "https://example.com",
      403
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(SourceAccessBlockedError)
  })

  it("can be caught specifically", () => {
    const error = new SourceAccessBlockedError(
      "BFI blocked",
      DataSourceType.BFI_SIGHT_SOUND,
      "https://www.bfi.org.uk",
      403
    )

    let caught = false
    try {
      throw error
    } catch (e) {
      if (e instanceof SourceAccessBlockedError) {
        caught = true
        expect(e.sourceType).toBe(DataSourceType.BFI_SIGHT_SOUND)
      }
    }

    expect(caught).toBe(true)
  })
})
