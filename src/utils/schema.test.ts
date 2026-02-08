import { describe, it, expect } from "vitest"
import {
  buildTVSeriesSchema,
  buildTVEpisodeSchema,
  buildCollectionPageSchema,
  buildWebsiteSchema,
  buildArticleSchema,
} from "./schema"

describe("buildTVSeriesSchema", () => {
  const baseShow = {
    name: "Breaking Bad",
    firstAirDate: "2008-01-20",
    posterPath: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
    numberOfSeasons: 5,
    numberOfEpisodes: 62,
  }

  const baseStats = {
    deceasedCount: 3,
    totalCast: 20,
    mortalityPercentage: 15,
  }

  it("builds correct TVSeries schema", () => {
    const result = buildTVSeriesSchema(baseShow, baseStats, "breaking-bad-2008-1396")

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("TVSeries")
    expect(result.name).toBe("Breaking Bad")
    expect(result.datePublished).toBe("2008-01-20")
    expect(result.numberOfSeasons).toBe(5)
    expect(result.numberOfEpisodes).toBe(62)
    expect(result.description).toBe("3 of 20 cast members (15%) have passed away.")
    expect(result.image).toBe("https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg")
    expect(result.url).toBe("https://deadonfilm.com/show/breaking-bad-2008-1396")
  })

  it("handles null posterPath", () => {
    const result = buildTVSeriesSchema(
      { ...baseShow, posterPath: null },
      baseStats,
      "breaking-bad-2008-1396"
    )
    expect(result.image).toBeUndefined()
  })

  it("handles null firstAirDate", () => {
    const result = buildTVSeriesSchema(
      { ...baseShow, firstAirDate: null },
      baseStats,
      "breaking-bad-2008-1396"
    )
    expect(result.datePublished).toBeUndefined()
  })
})

describe("buildTVEpisodeSchema", () => {
  const baseShow = {
    name: "Breaking Bad",
    firstAirDate: "2008-01-20",
    id: 1396,
  }

  const baseEpisode = {
    name: "Ozymandias",
    seasonNumber: 5,
    episodeNumber: 14,
    airDate: "2013-09-15",
    overview: "Everyone copes with radically changed circumstances.",
    runtime: 47,
    stillPath: "/abc123.jpg",
  }

  const baseStats = {
    deceasedCount: 2,
    totalCast: 15,
    mortalityPercentage: 13,
  }

  it("builds correct TVEpisode schema", () => {
    const result = buildTVEpisodeSchema(
      baseShow,
      baseEpisode,
      baseStats,
      "https://deadonfilm.com/episode/breaking-bad-s5e14-ozymandias-1396",
      "breaking-bad-2008-1396"
    )

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("TVEpisode")
    expect(result.name).toBe("Ozymandias")
    expect(result.episodeNumber).toBe(14)
    expect(result.seasonNumber).toBe(5)
    expect(result.datePublished).toBe("2013-09-15")
    expect(result.description).toBe("Everyone copes with radically changed circumstances.")
    expect(result.image).toBe("https://image.tmdb.org/t/p/w500/abc123.jpg")
    expect(result.duration).toBe("PT47M")
    expect(result.url).toBe("https://deadonfilm.com/episode/breaking-bad-s5e14-ozymandias-1396")

    const partOfSeries = result.partOfSeries as Record<string, unknown>
    expect(partOfSeries["@type"]).toBe("TVSeries")
    expect(partOfSeries.name).toBe("Breaking Bad")
    expect(partOfSeries.url).toBe("https://deadonfilm.com/show/breaking-bad-2008-1396")
  })

  it("uses mortality description when overview is empty", () => {
    const result = buildTVEpisodeSchema(
      baseShow,
      { ...baseEpisode, overview: "" },
      baseStats,
      "https://deadonfilm.com/episode/breaking-bad-s5e14-ozymandias-1396",
      "breaking-bad-2008-1396"
    )

    expect(result.description).toBe(
      "2 of 15 cast members (13%) from Breaking Bad S5E14 have passed away."
    )
  })

  it("handles null airDate, stillPath, and runtime", () => {
    const result = buildTVEpisodeSchema(
      baseShow,
      { ...baseEpisode, airDate: null, stillPath: null, runtime: null },
      baseStats,
      "https://deadonfilm.com/episode/breaking-bad-s5e14-ozymandias-1396",
      "breaking-bad-2008-1396"
    )

    expect(result.datePublished).toBeUndefined()
    expect(result.image).toBeUndefined()
    expect(result.duration).toBeUndefined()
  })

  it("formats duration with hours correctly", () => {
    const result = buildTVEpisodeSchema(
      baseShow,
      { ...baseEpisode, runtime: 90 },
      baseStats,
      "https://deadonfilm.com/episode/test",
      "breaking-bad-2008-1396"
    )
    expect(result.duration).toBe("PT1H30M")
  })

  it("formats duration for exact hours", () => {
    const result = buildTVEpisodeSchema(
      baseShow,
      { ...baseEpisode, runtime: 60 },
      baseStats,
      "https://deadonfilm.com/episode/test",
      "breaking-bad-2008-1396"
    )
    expect(result.duration).toBe("PT1H")
  })
})

describe("buildCollectionPageSchema", () => {
  it("builds correct CollectionPage schema", () => {
    const items = [
      { name: "Actor A", url: "https://deadonfilm.com/actor/actor-a-1" },
      { name: "Actor B", url: "https://deadonfilm.com/actor/actor-b-2" },
    ]

    const result = buildCollectionPageSchema(
      "Death Watch",
      "Living actors ranked by death probability",
      "https://deadonfilm.com/death-watch",
      items
    )

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("CollectionPage")
    expect(result.name).toBe("Death Watch")
    expect(result.description).toBe("Living actors ranked by death probability")
    expect(result.url).toBe("https://deadonfilm.com/death-watch")

    const mainEntity = result.mainEntity as Record<string, unknown>
    expect(mainEntity["@type"]).toBe("ItemList")
    expect(mainEntity.numberOfItems).toBe(2)

    const elements = mainEntity.itemListElement as Array<Record<string, unknown>>
    expect(elements).toHaveLength(2)
    expect(elements[0].position).toBe(1)
    expect(elements[0].name).toBe("Actor A")
    expect(elements[0].url).toBe("https://deadonfilm.com/actor/actor-a-1")
    expect(elements[1].position).toBe(2)
  })

  it("handles empty items list", () => {
    const result = buildCollectionPageSchema(
      "Empty List",
      "Description",
      "https://deadonfilm.com/empty",
      []
    )

    const mainEntity = result.mainEntity as Record<string, unknown>
    expect(mainEntity.numberOfItems).toBe(0)
    expect(mainEntity.itemListElement).toEqual([])
  })
})

describe("buildArticleSchema", () => {
  it("builds correct BlogPosting schema", () => {
    const result = buildArticleSchema({
      title: "Test Article",
      description: "A test article description",
      slug: "test-article",
      publishedDate: "2026-01-15",
      wordCount: 1200,
      author: "Dead on Film",
    })

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("BlogPosting")
    expect(result.headline).toBe("Test Article")
    expect(result.description).toBe("A test article description")
    expect(result.datePublished).toBe("2026-01-15")
    expect(result.dateModified).toBe("2026-01-15")
    expect(result.wordCount).toBe(1200)
    expect(result.url).toBe("https://deadonfilm.com/articles/test-article")

    const author = result.author as Record<string, unknown>
    expect(author["@type"]).toBe("Organization")
    expect(author.name).toBe("Dead on Film")

    const publisher = result.publisher as Record<string, unknown>
    expect(publisher["@type"]).toBe("Organization")
    expect(publisher.name).toBe("Dead on Film")

    const mainEntity = result.mainEntityOfPage as Record<string, unknown>
    expect(mainEntity["@type"]).toBe("WebPage")
    expect(mainEntity["@id"]).toBe("https://deadonfilm.com/articles/test-article")
  })

  it("uses updatedDate as dateModified when provided", () => {
    const result = buildArticleSchema({
      title: "Test",
      description: "Test",
      slug: "test",
      publishedDate: "2026-01-15",
      updatedDate: "2026-02-01",
      wordCount: 500,
      author: "Dead on Film",
    })

    expect(result.datePublished).toBe("2026-01-15")
    expect(result.dateModified).toBe("2026-02-01")
  })

  it("falls back to publishedDate for dateModified when no updatedDate", () => {
    const result = buildArticleSchema({
      title: "Test",
      description: "Test",
      slug: "test",
      publishedDate: "2026-01-15",
      wordCount: 500,
      author: "Dead on Film",
    })

    expect(result.dateModified).toBe("2026-01-15")
  })
})

describe("buildWebsiteSchema", () => {
  it("includes SearchAction potentialAction", () => {
    const result = buildWebsiteSchema()

    expect(result["@type"]).toBe("WebSite")

    const action = result.potentialAction as Record<string, unknown>
    expect(action["@type"]).toBe("SearchAction")
    expect(action.target).toBe("https://deadonfilm.com/search?q={search_term_string}")
    expect(action["query-input"]).toBe("required name=search_term_string")
  })
})
