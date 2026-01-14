import { describe, it, expect } from "vitest"
import { DataSourceType } from "./types.js"

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
