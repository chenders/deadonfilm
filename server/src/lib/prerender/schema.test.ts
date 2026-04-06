import { describe, it, expect } from "vitest"
import { buildPersonSchema, buildFactsFAQSchema } from "./schema.js"

const baseActor = {
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  profile_path: "/abc123.jpg",
  tmdb_id: 4165,
}

describe("buildPersonSchema", () => {
  it("builds correct base Person schema", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("Person")
    expect(result.name).toBe("John Wayne")
    expect(result.birthDate).toBe("1907-05-26")
    expect(result.deathDate).toBe("1979-06-11")
    expect(result.image).toBe("https://image.tmdb.org/t/p/h632/abc123.jpg")
    expect(result.url).toBe("https://deadonfilm.com/actor/john-wayne-4165")
    expect(result.sameAs).toEqual(["https://www.themoviedb.org/person/4165"])
    expect(result.jobTitle).toBe("Actor")
  })

  it("omits optional fields when not provided", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")

    expect(result.alternateName).toBeUndefined()
    expect(result.gender).toBeUndefined()
    expect(result.nationality).toBeUndefined()
    expect(result.hasOccupation).toBeUndefined()
    expect(result.award).toBeUndefined()
    expect(result.alumniOf).toBeUndefined()
  })

  it("includes alumniOf as EducationalOrganization array when education_institutions provided", () => {
    const result = buildPersonSchema(
      {
        ...baseActor,
        education_institutions: ["University of Southern California", "Glendale High School"],
      },
      "john-wayne-4165"
    )
    expect(result.alumniOf).toEqual([
      { "@type": "EducationalOrganization", name: "University of Southern California" },
      { "@type": "EducationalOrganization", name: "Glendale High School" },
    ])
  })

  it("omits alumniOf when education_institutions is null", () => {
    const result = buildPersonSchema(
      { ...baseActor, education_institutions: null },
      "john-wayne-4165"
    )
    expect(result.alumniOf).toBeUndefined()
  })

  it("omits alumniOf when education_institutions is empty array", () => {
    const result = buildPersonSchema(
      { ...baseActor, education_institutions: [] },
      "john-wayne-4165"
    )
    expect(result.alumniOf).toBeUndefined()
  })

  it("omits sameAs when tmdb_id is null", () => {
    const result = buildPersonSchema({ ...baseActor, tmdb_id: null }, "john-wayne-4165")
    expect(result.sameAs).toBeUndefined()
  })

  it("omits image when profile_path is null", () => {
    const result = buildPersonSchema({ ...baseActor, profile_path: null }, "john-wayne-4165")
    expect(result.image).toBeUndefined()
  })

  it("includes knowsAbout for sourced facts", () => {
    const result = buildPersonSchema(
      {
        ...baseActor,
        lesser_known_facts: [
          {
            text: "Holds a karate black belt",
            sourceUrl: "https://theguardian.com/karate",
            sourceName: "The Guardian",
          },
          { text: "No source", sourceUrl: null, sourceName: null },
        ],
      },
      "john-wayne-4165"
    )
    const knowsAbout = result.knowsAbout as Array<Record<string, unknown>>
    expect(knowsAbout).toHaveLength(1)
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

  it("omits knowsAbout when no sourced facts", () => {
    const result = buildPersonSchema(baseActor, "john-wayne-4165")
    expect(result.knowsAbout).toBeUndefined()
  })
})

describe("buildFactsFAQSchema", () => {
  it("builds FAQPage with sourced facts", () => {
    const result = buildFactsFAQSchema("John Wayne", [
      {
        text: "Was a college football player",
        sourceUrl: "https://latimes.com/article",
        sourceName: "LA Times",
      },
    ])
    expect(result).not.toBeNull()
    expect(result!["@type"]).toBe("FAQPage")
    const answer = ((result!.mainEntity as unknown[])[0] as Record<string, unknown>)
      .acceptedAnswer as Record<string, unknown>
    expect(answer.text).toContain("Was a college football player (LA Times)")
  })

  it("returns null when no sourced facts", () => {
    expect(buildFactsFAQSchema("Nobody", [])).toBeNull()
  })
})
