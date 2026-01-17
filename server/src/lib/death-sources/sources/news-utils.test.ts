import { describe, it, expect } from "vitest"
import {
  extractLocation,
  extractNotableFactors,
  extractDeathSentences,
  isAboutActor,
  extractUrlFromSearchResults,
} from "./news-utils.js"
import type { ActorForEnrichment } from "../types.js"

const testActor: ActorForEnrichment = {
  id: 123,
  tmdbId: 456,
  name: "John Smith",
  birthday: "1950-01-15",
  deathday: "2023-05-20",
  causeOfDeath: null,
  causeOfDeathDetails: null,
  popularity: 25.0,
}

describe("news-utils", () => {
  describe("extractLocation", () => {
    it("extracts location from 'died in' pattern", () => {
      const text = "The actor died in Los Angeles on May 20."
      expect(extractLocation(text)).toBe("Los Angeles")
    })

    it("extracts location from 'died at' pattern", () => {
      // "died at" matches the location directly after "at"
      const text = "He died at Cedars Sinai Hospital."
      expect(extractLocation(text)).toBe("Cedars Sinai Hospital")
    })

    it("extracts location from 'passed away in' pattern", () => {
      const text = "Smith passed away in New York City from natural causes."
      expect(extractLocation(text)).toBe("New York City")
    })

    it("extracts location from 'death in' pattern", () => {
      const text = "His death in London, England shocked the industry."
      // The pattern stops at the comma
      expect(extractLocation(text)).toBe("London")
    })

    it("extracts location ending at comma", () => {
      // The regex stops at punctuation like commas when followed by more location-like text
      const text = "She died in Santa Monica, California on Tuesday."
      // Returns just "Santa Monica" because the comma triggers a stop
      expect(extractLocation(text)).toBe("Santa Monica")
    })

    it("returns null when no location pattern found", () => {
      const text = "The actor passed away peacefully surrounded by family."
      expect(extractLocation(text)).toBeNull()
    })

    it("returns null for locations that are too short", () => {
      const text = "He died in LA."
      expect(extractLocation(text)).toBeNull()
    })

    it("returns null for locations starting with digits", () => {
      const text = "He died in 2023 after a long illness."
      expect(extractLocation(text)).toBeNull()
    })

    it("returns null for month names (false positives)", () => {
      const text = "He died in January from cardiac arrest."
      expect(extractLocation(text)).toBeNull()
    })
  })

  describe("extractNotableFactors", () => {
    it("extracts notable factor keywords from text", () => {
      const text = "His death was sudden and unexpected. An autopsy was performed."
      const factors = extractNotableFactors(text)
      expect(factors).toContain("sudden")
      expect(factors).toContain("unexpected")
      expect(factors).toContain("autopsy")
    })

    it("extracts circumstance keywords as factors", () => {
      const text = "The actor suffered a cardiac arrest at his home due to cancer."
      const factors = extractNotableFactors(text)
      expect(factors).toContain("cardiac")
      expect(factors).toContain("cancer")
    })

    it("returns empty array when no keywords found", () => {
      const text = "The actor was known for his role in the film."
      const factors = extractNotableFactors(text)
      expect(factors).toEqual([])
    })

    it("limits to 5 factors maximum", () => {
      const text =
        "His sudden unexpected death from cancer after a long illness " +
        "resulted in autopsy and investigation by the coroner."
      const factors = extractNotableFactors(text)
      expect(factors.length).toBeLessThanOrEqual(5)
    })

    it("removes duplicates", () => {
      const text = "His sudden death was sudden. Very sudden indeed."
      const factors = extractNotableFactors(text)
      const suddenCount = factors.filter((f) => f === "sudden").length
      expect(suddenCount).toBe(1)
    })
  })

  describe("extractDeathSentences", () => {
    it("extracts sentences containing death keywords", () => {
      const text = "John Smith was a great actor. He died on May 20, 2023. His legacy lives on."
      const sentences = extractDeathSentences(text, testActor)
      expect(sentences.length).toBe(1)
      expect(sentences[0]).toContain("died")
    })

    it("returns empty array when no death keywords present", () => {
      const text = "John Smith was a great actor. He won many awards. His legacy lives on."
      const sentences = extractDeathSentences(text, testActor)
      expect(sentences).toEqual([])
    })

    it("filters sentences that are too short", () => {
      const text = "He died. That was sad."
      const sentences = extractDeathSentences(text, testActor)
      expect(sentences).toEqual([])
    })

    it("filters sentences that are too long", () => {
      const longSentence = "He died " + "word ".repeat(200)
      const sentences = extractDeathSentences(longSentence, testActor)
      expect(sentences).toEqual([])
    })

    it("limits to maxSentences parameter", () => {
      const text =
        "Smith died on Monday. Smith passed away peacefully. Smith lost his life. " +
        "Smith departed this world. Smith breathed his last."
      const sentences = extractDeathSentences(text, testActor, 2)
      expect(sentences.length).toBeLessThanOrEqual(2)
    })

    it("only includes sentences about the actor", () => {
      const text =
        "John Smith died on Monday at the age of 73. Someone else also died that day but was unrelated."
      const sentences = extractDeathSentences(text, testActor)
      // Only the sentence about Smith should be included (contains his name)
      // The second sentence doesn't reference the actor at all
      expect(sentences.length).toBe(1)
      expect(sentences[0]).toContain("Smith")
    })
  })

  describe("isAboutActor", () => {
    it("matches actor last name", () => {
      expect(isAboutActor("smith died peacefully", testActor)).toBe(true)
    })

    it("matches actor first name", () => {
      expect(isAboutActor("john was known for his roles", testActor)).toBe(true)
    })

    it("matches pronoun 'he'", () => {
      expect(isAboutActor("he died at age 73", testActor)).toBe(true)
    })

    it("matches pronoun 'she'", () => {
      expect(isAboutActor("she was beloved", testActor)).toBe(true)
    })

    it("matches pronoun 'his'", () => {
      expect(isAboutActor("a tribute to his legacy", testActor)).toBe(true)
    })

    it("matches pronoun 'her'", () => {
      expect(isAboutActor("remembering her work", testActor)).toBe(true)
    })

    it("matches sentence starting with 'he'", () => {
      expect(isAboutActor("he was 73 years old", testActor)).toBe(true)
    })

    it("matches sentence starting with 'she'", () => {
      expect(isAboutActor("she was born in 1950", testActor)).toBe(true)
    })

    it("matches 'the actor'", () => {
      expect(isAboutActor("sadly the actor died at home", testActor)).toBe(true)
    })

    it("matches 'the actress'", () => {
      expect(isAboutActor("when the actress won an award", testActor)).toBe(true)
    })

    it("matches 'the star'", () => {
      expect(isAboutActor("reportedly the star was known for many roles", testActor)).toBe(true)
    })

    it("returns false when no match", () => {
      expect(isAboutActor("someone else entirely unrelated", testActor)).toBe(false)
    })
  })

  describe("extractUrlFromSearchResults", () => {
    const varietyPattern = /https?:\/\/(?:www\.)?variety\.com\/\d{4}\/[^"'\s<>]+/gi

    it("returns null when no URLs match pattern", () => {
      const html = '<a href="https://example.com/article">Link</a>'
      expect(extractUrlFromSearchResults(html, varietyPattern, testActor)).toBeNull()
    })

    it("prefers obituary URLs", () => {
      const html = `
        <a href="https://variety.com/2023/film/interview">Interview</a>
        <a href="https://variety.com/2023/film/obituary-john-smith">Obituary</a>
        <a href="https://variety.com/2023/film/review">Review</a>
      `
      const url = extractUrlFromSearchResults(html, varietyPattern, testActor)
      expect(url).toContain("obituary")
    })

    it("prefers URLs with death-related terms", () => {
      const html = `
        <a href="https://variety.com/2023/film/interview">Interview</a>
        <a href="https://variety.com/2023/film/john-smith-dies">Death News</a>
      `
      const url = extractUrlFromSearchResults(html, varietyPattern, testActor)
      expect(url).toContain("dies")
    })

    it("falls back to URLs with actor name parts", () => {
      const html = `
        <a href="https://variety.com/2023/film/generic-article">Generic</a>
        <a href="https://variety.com/2023/film/john-smith-profile">Profile</a>
      `
      const url = extractUrlFromSearchResults(html, varietyPattern, testActor)
      expect(url).toContain("john")
    })

    it("returns first match if no better option", () => {
      const html = `
        <a href="https://variety.com/2023/film/article-one">First</a>
        <a href="https://variety.com/2023/film/article-two">Second</a>
      `
      const url = extractUrlFromSearchResults(html, varietyPattern, testActor)
      expect(url).toBe("https://variety.com/2023/film/article-one")
    })

    it("handles short name parts (ignores parts <= 2 chars)", () => {
      const actorWithShortName: ActorForEnrichment = {
        ...testActor,
        name: "Ed Li",
      }
      const html = `
        <a href="https://variety.com/2023/film/unrelated-article">Unrelated</a>
      `
      // Should not match on "Ed" or "Li" since they're too short
      const url = extractUrlFromSearchResults(html, varietyPattern, actorWithShortName)
      expect(url).toBe("https://variety.com/2023/film/unrelated-article")
    })
  })
})
