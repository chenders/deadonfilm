import { describe, it, expect } from "vitest"
import {
  buildPersonSchema,
  buildTVSeriesSchema,
  buildTVEpisodeSchema,
  buildCollectionPageSchema,
  buildWebsiteSchema,
  buildFactsFAQSchema,
} from "./schema"

describe("buildPersonSchema", () => {
  const baseActor = {
    name: "John Wayne",
    birthday: "1907-05-26",
    deathday: "1979-06-11",
    biography: "An American actor who became a popular icon.",
    profilePath: "/abc123.jpg",
    placeOfBirth: "Winterset, Iowa, USA",
    tmdbId: 4165,
  }

  it("builds correct base Person schema", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("Person")
    expect(result.name).toBe("John Wayne")
    expect(result.birthDate).toBe("1907-05-26")
    expect(result.deathDate).toBe("1979-06-11")
    expect(result.url).toBe("https://deadonfilm.com/actor/john-wayne-4165")
  })

  it("defaults jobTitle to Actor when no knownForDepartment", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")
    expect(result.jobTitle).toBe("Actor")
  })

  it("maps knownForDepartment Directing to Director", () => {
    const result = buildPersonSchema(
      { ...baseActor, knownForDepartment: "Directing" },
      "john-wayne-4165"
    )
    expect(result.jobTitle).toBe("Director")
  })

  it("maps knownForDepartment Writing to Writer", () => {
    const result = buildPersonSchema(
      { ...baseActor, knownForDepartment: "Writing" },
      "john-wayne-4165"
    )
    expect(result.jobTitle).toBe("Writer")
  })

  it("maps knownForDepartment Acting to Actor", () => {
    const result = buildPersonSchema(
      { ...baseActor, knownForDepartment: "Acting" },
      "john-wayne-4165"
    )
    expect(result.jobTitle).toBe("Actor")
  })

  it("falls back to Actor for unknown department", () => {
    const result = buildPersonSchema(
      { ...baseActor, knownForDepartment: "SomethingNew" },
      "john-wayne-4165"
    )
    expect(result.jobTitle).toBe("Actor")
  })

  it("includes alternateName when alternateNames is provided", () => {
    const result = buildPersonSchema(
      { ...baseActor, alternateNames: ["Marion Morrison", "The Duke"] },
      "john-wayne-4165"
    )
    expect(result.alternateName).toEqual(["Marion Morrison", "The Duke"])
  })

  it("omits alternateName when alternateNames is empty array", () => {
    const result = buildPersonSchema({ ...baseActor, alternateNames: [] }, "john-wayne-4165")
    expect(result.alternateName).toBeUndefined()
  })

  it("omits alternateName when alternateNames is null", () => {
    const result = buildPersonSchema({ ...baseActor, alternateNames: null }, "john-wayne-4165")
    expect(result.alternateName).toBeUndefined()
  })

  it("includes gender when provided", () => {
    const result = buildPersonSchema({ ...baseActor, gender: "Male" }, "john-wayne-4165")
    expect(result.gender).toBe("Male")
  })

  it("omits gender when null", () => {
    const result = buildPersonSchema({ ...baseActor, gender: null }, "john-wayne-4165")
    expect(result.gender).toBeUndefined()
  })

  it("includes nationality as Country object when provided", () => {
    const result = buildPersonSchema({ ...baseActor, nationality: "American" }, "john-wayne-4165")
    expect(result.nationality).toEqual({ "@type": "Country", name: "American" })
  })

  it("omits nationality when null", () => {
    const result = buildPersonSchema({ ...baseActor, nationality: null }, "john-wayne-4165")
    expect(result.nationality).toBeUndefined()
  })

  it("includes hasOccupation as Occupation array when occupations provided", () => {
    const result = buildPersonSchema(
      { ...baseActor, occupations: ["Actor", "Producer", "Director"] },
      "john-wayne-4165"
    )
    expect(result.hasOccupation).toEqual([
      { "@type": "Occupation", name: "Actor" },
      { "@type": "Occupation", name: "Producer" },
      { "@type": "Occupation", name: "Director" },
    ])
  })

  it("omits hasOccupation when occupations is empty array", () => {
    const result = buildPersonSchema({ ...baseActor, occupations: [] }, "john-wayne-4165")
    expect(result.hasOccupation).toBeUndefined()
  })

  it("omits hasOccupation when occupations is null", () => {
    const result = buildPersonSchema({ ...baseActor, occupations: null }, "john-wayne-4165")
    expect(result.hasOccupation).toBeUndefined()
  })

  it("includes award when awards provided", () => {
    const result = buildPersonSchema(
      { ...baseActor, awards: ["Academy Award", "Golden Globe"] },
      "john-wayne-4165"
    )
    expect(result.award).toEqual(["Academy Award", "Golden Globe"])
  })

  it("omits award when awards is empty array", () => {
    const result = buildPersonSchema({ ...baseActor, awards: [] }, "john-wayne-4165")
    expect(result.award).toBeUndefined()
  })

  it("includes alumniOf as EducationalOrganization array when educationInstitutions provided", () => {
    const result = buildPersonSchema(
      {
        ...baseActor,
        educationInstitutions: ["University of Southern California", "Yale School of Drama"],
      },
      "john-wayne-4165"
    )
    expect(result.alumniOf).toEqual([
      { "@type": "EducationalOrganization", name: "University of Southern California" },
      { "@type": "EducationalOrganization", name: "Yale School of Drama" },
    ])
  })

  it("omits alumniOf when educationInstitutions is null", () => {
    const result = buildPersonSchema(
      { ...baseActor, educationInstitutions: null },
      "john-wayne-4165"
    )
    expect(result.alumniOf).toBeUndefined()
  })

  it("omits alumniOf when educationInstitutions is empty array", () => {
    const result = buildPersonSchema({ ...baseActor, educationInstitutions: [] }, "john-wayne-4165")
    expect(result.alumniOf).toBeUndefined()
  })

  it("omits all SEO fields when not provided", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")

    expect(result.alternateName).toBeUndefined()
    expect(result.gender).toBeUndefined()
    expect(result.nationality).toBeUndefined()
    expect(result.hasOccupation).toBeUndefined()
    expect(result.award).toBeUndefined()
    expect(result.alumniOf).toBeUndefined()
  })

  it("includes knowsAbout for sourced facts", () => {
    const facts = [
      {
        text: "Holds a karate black belt",
        sourceUrl: "https://theguardian.com/karate",
        sourceName: "The Guardian",
        sourceReliable: true,
      },
      {
        text: "Begged to be in Fast & Furious",
        sourceUrl: "https://people.com/furious",
        sourceName: "People",
        sourceReliable: false,
      },
    ]
    const result = buildPersonSchema({ ...baseActor, lesserKnownFacts: facts }, "john-wayne-4165")
    const knowsAbout = result.knowsAbout as Array<Record<string, unknown>>
    expect(knowsAbout).toHaveLength(2)
    expect(knowsAbout[0]).toEqual({
      "@type": "Thing",
      name: "Holds a karate black belt",
      description: "Holds a karate black belt",
      subjectOf: {
        "@type": "Article",
        url: "https://theguardian.com/karate",
        publisher: { "@type": "Organization", name: "The Guardian" },
      },
    })
  })

  it("excludes facts without sourceUrl from knowsAbout", () => {
    const facts = [
      { text: "No source fact", sourceUrl: null, sourceName: null },
      {
        text: "Sourced fact",
        sourceUrl: "https://bbc.com/article",
        sourceName: "BBC",
        sourceReliable: true,
      },
    ]
    const result = buildPersonSchema({ ...baseActor, lesserKnownFacts: facts }, "john-wayne-4165")
    const knowsAbout = result.knowsAbout as Array<Record<string, unknown>>
    expect(knowsAbout).toHaveLength(1)
    expect((knowsAbout[0].subjectOf as Record<string, unknown>).url).toBe("https://bbc.com/article")
  })

  it("limits knowsAbout to 10 facts", () => {
    const facts = Array.from({ length: 15 }, (_, i) => ({
      text: `Fact ${i}`,
      sourceUrl: `https://nytimes.com/${i}`,
      sourceName: "NYT",
      sourceReliable: true,
    }))
    const result = buildPersonSchema({ ...baseActor, lesserKnownFacts: facts }, "john-wayne-4165")
    expect((result.knowsAbout as unknown[]).length).toBe(10)
  })

  it("omits knowsAbout when no sourced facts exist", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")
    expect(result.knowsAbout).toBeUndefined()
  })

  it("omits knowsAbout when lesserKnownFacts is empty", () => {
    const result = buildPersonSchema({ ...baseActor, lesserKnownFacts: [] }, "john-wayne-4165")
    expect(result.knowsAbout).toBeUndefined()
  })
})

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
      "Notable Deaths",
      "Actors with detailed death circumstances",
      "https://deadonfilm.com/deaths/notable",
      items
    )

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("CollectionPage")
    expect(result.name).toBe("Notable Deaths")
    expect(result.description).toBe("Actors with detailed death circumstances")
    expect(result.url).toBe("https://deadonfilm.com/deaths/notable")

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

describe("buildFactsFAQSchema", () => {
  it("builds FAQPage with aggregated sourced facts", () => {
    const facts = [
      {
        text: "Holds a karate black belt",
        sourceUrl: "https://theguardian.com/karate",
        sourceName: "The Guardian",
      },
      {
        text: "Begged to be in Fast & Furious",
        sourceUrl: "https://people.com/furious",
        sourceName: "People",
      },
    ]
    const result = buildFactsFAQSchema("Helen Mirren", facts)

    expect(result).not.toBeNull()
    expect(result!["@context"]).toBe("https://schema.org")
    expect(result!["@type"]).toBe("FAQPage")
    const mainEntity = result!.mainEntity as Array<Record<string, unknown>>
    expect(mainEntity).toHaveLength(1)
    expect(mainEntity[0].name).toBe("What are some lesser-known facts about Helen Mirren?")
    const answer = mainEntity[0].acceptedAnswer as Record<string, unknown>
    expect(answer.text).toContain("Holds a karate black belt (The Guardian)")
    expect(answer.text).toContain("Begged to be in Fast & Furious (People)")
  })

  it("excludes facts without sources from the answer", () => {
    const facts = [
      { text: "No source", sourceUrl: null, sourceName: null },
      {
        text: "Has a source",
        sourceUrl: "https://bbc.com/1",
        sourceName: "BBC",
      },
    ]
    const result = buildFactsFAQSchema("John Wayne", facts)
    const answer = (result!.mainEntity as Array<Record<string, unknown>>)[0]
      .acceptedAnswer as Record<string, unknown>
    expect(answer.text).not.toContain("No source")
    expect(answer.text).toContain("Has a source (BBC)")
  })

  it("returns null when no sourced facts exist", () => {
    expect(buildFactsFAQSchema("Nobody", [])).toBeNull()
    expect(
      buildFactsFAQSchema("Nobody", [{ text: "Unsourced", sourceUrl: null, sourceName: null }])
    ).toBeNull()
  })
})
