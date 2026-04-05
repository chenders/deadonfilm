import { describe, it, expect } from "vitest"
import { filterBoringSuggestions } from "./boring-filter.js"
import type { AutocompleteSuggestion } from "./types.js"
import type { BoringFilterContext } from "./boring-filter.js"

function makeSuggestion(term: string): AutocompleteSuggestion {
  return {
    fullText: `helen mirren ${term}`,
    term,
    queryPattern: "quoted-letter",
    rawQuery: `"helen mirren" ${term[0]}`,
  }
}

const context: BoringFilterContext = {
  movieTitles: ["the queen", "gosford park", "the long good friday"],
  showTitles: ["prime suspect"],
  characterNames: ["queen elizabeth", "jane tennison"],
  costarNames: ["james cromwell", "kate winslet"],
  bioText: "Helen Mirren was born Ilyena Lydia Mironovas. She married Taylor Hackford in 1997.",
}

describe("filterBoringSuggestions", () => {
  it("returns all suggestions when nothing matches filters", () => {
    const suggestions = [
      makeSuggestion("karate black belt"),
      makeSuggestion("speaks russian fluently"),
      makeSuggestion("snake phobia"),
    ]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(3)
    expect(result.dropped).toBe(0)
  })

  it("drops generic blocklist terms — exact match", () => {
    const suggestions = [
      makeSuggestion("age"),
      makeSuggestion("height"),
      makeSuggestion("net worth"),
    ]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.dropped).toBe(3)
    expect(result.droppedByReason["generic"]).toBe(3)
  })

  it("drops movie title matches — exact", () => {
    const suggestions = [makeSuggestion("the queen")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["filmography"]).toBe(1)
  })

  it("drops show title matches — exact", () => {
    const suggestions = [makeSuggestion("prime suspect")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["filmography"]).toBe(1)
  })

  it("drops character name matches — exact", () => {
    const suggestions = [makeSuggestion("queen elizabeth"), makeSuggestion("jane tennison")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["filmography"]).toBe(2)
  })

  it("drops partial filmography matches — term contains title", () => {
    // Term contains a movie title as a substring
    const suggestions = [makeSuggestion("the queen role preparation")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["filmography"]).toBe(1)
  })

  it("drops partial filmography matches — title contains term", () => {
    // Term is a substring of a movie title
    const suggestions = [makeSuggestion("gosford")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["filmography"]).toBe(1)
  })

  it("drops co-star name matches — partial", () => {
    const suggestions = [makeSuggestion("james cromwell"), makeSuggestion("cromwell")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["costar"]).toBe(2)
  })

  it("drops terms found in existing bio text", () => {
    // "taylor hackford" is mentioned in the bio
    const suggestions = [makeSuggestion("taylor hackford")]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(0)
    expect(result.droppedByReason["in-bio"]).toBe(1)
  })

  it("does not drop terms shorter than 4 chars from bio text check", () => {
    // Short terms like "born" or "and" should not trigger bio-text drop
    const suggestions = [makeSuggestion("born")]
    // "born" is in GENERIC_BLOCKLIST, so it will be dropped by generic — but the
    // point is: single short words from bio should not bleed into bio-text matching
    // Use a non-blocklisted short term
    const ctx: BoringFilterContext = {
      ...context,
      bioText: "She was wed in 1997.",
    }
    const nonBlocklisted = [makeSuggestion("wed")]
    // "wed" is 3 chars — below the 4-char threshold, should be kept
    const result = filterBoringSuggestions(nonBlocklisted, ctx)
    expect(result.kept).toHaveLength(1)
  })

  it("subset detection — drops shorter term when more specific one exists", () => {
    // "kurt cobain" is a prefix of "kurt cobain gps" — drop the shorter one
    const suggestions = [makeSuggestion("kurt cobain gps"), makeSuggestion("kurt cobain")]
    const ctx: BoringFilterContext = {
      movieTitles: [],
      showTitles: [],
      characterNames: [],
      costarNames: [],
      bioText: "",
    }
    const result = filterBoringSuggestions(suggestions, ctx)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].term).toBe("kurt cobain gps")
    expect(result.droppedByReason["subset"]).toBe(1)
  })

  it("subset detection — keeps term when no more-specific superset exists", () => {
    const suggestions = [makeSuggestion("snake phobia"), makeSuggestion("karate black belt")]
    const ctx: BoringFilterContext = {
      movieTitles: [],
      showTitles: [],
      characterNames: [],
      costarNames: [],
      bioText: "",
    }
    const result = filterBoringSuggestions(suggestions, ctx)
    expect(result.kept).toHaveLength(2)
    expect(result.dropped).toBe(0)
  })

  it("subset detection uses space/apostrophe boundary — avoids false positives", () => {
    // "kate" should not match as a prefix of "kate winslet" to trigger subset drop
    // unless it is an actual prefix followed by space/apostrophe
    const suggestions = [makeSuggestion("kate"), makeSuggestion("kate winslet")]
    const ctx: BoringFilterContext = {
      movieTitles: [],
      showTitles: [],
      characterNames: [],
      costarNames: [],
      bioText: "",
    }
    const result = filterBoringSuggestions(suggestions, ctx)
    // "kate" is prefix of "kate winslet" (followed by space) → drop "kate"
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].term).toBe("kate winslet")
  })

  it("tracks droppedByReason counts correctly across mixed suggestions", () => {
    const suggestions = [
      makeSuggestion("age"), // generic
      makeSuggestion("the queen"), // filmography
      makeSuggestion("james cromwell"), // costar
      makeSuggestion("taylor hackford"), // in-bio
      makeSuggestion("karate black belt"), // kept
    ]
    const result = filterBoringSuggestions(suggestions, context)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].term).toBe("karate black belt")
    expect(result.dropped).toBe(4)
    expect(result.droppedByReason["generic"]).toBe(1)
    expect(result.droppedByReason["filmography"]).toBe(1)
    expect(result.droppedByReason["costar"]).toBe(1)
    expect(result.droppedByReason["in-bio"]).toBe(1)
  })
})
