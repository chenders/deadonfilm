import { describe, it, expect } from "vitest"
import { createMovieSlug, createActorSlug, createShowSlug } from "./slug-utils.js"

describe("slug-utils", () => {
  describe("createMovieSlug", () => {
    it("creates a basic slug with title, year, and id", () => {
      expect(createMovieSlug("The Matrix", 1999, 603)).toBe("the-matrix-1999-603")
    })

    it("handles straight apostrophes", () => {
      expect(createMovieSlug("Breakfast at Tiffany's", 1961, 14629)).toBe(
        "breakfast-at-tiffanys-1961-14629"
      )
    })

    it("handles curly apostrophes (U+2019)", () => {
      expect(createMovieSlug("Breakfast at Tiffany\u2019s", 1961, 14629)).toBe(
        "breakfast-at-tiffanys-1961-14629"
      )
    })

    it("handles modifier letter apostrophes (U+02BC)", () => {
      expect(createMovieSlug("Breakfast at Tiffany\u02BCs", 1961, 14629)).toBe(
        "breakfast-at-tiffanys-1961-14629"
      )
    })

    it("handles null release year", () => {
      expect(createMovieSlug("Unknown Movie", null, 12345)).toBe("unknown-movie-unknown-12345")
    })

    it("handles special characters", () => {
      expect(createMovieSlug("Die Hard: With a Vengeance", 1995, 1572)).toBe(
        "die-hard-with-a-vengeance-1995-1572"
      )
    })

    it("handles multiple spaces and special chars", () => {
      expect(createMovieSlug("Some   Movie!!! (Part 2)", 2020, 999)).toBe(
        "some-movie-part-2-2020-999"
      )
    })

    it("removes leading and trailing hyphens", () => {
      expect(createMovieSlug("  The Movie  ", 2000, 1)).toBe("the-movie-2000-1")
    })

    it("handles non-ASCII characters", () => {
      expect(createMovieSlug("Amélie", 2001, 194)).toBe("am-lie-2001-194")
    })
  })

  describe("createActorSlug", () => {
    it("creates a basic slug with name and id", () => {
      expect(createActorSlug("Tom Hanks", 31)).toBe("tom-hanks-31")
    })

    it("handles apostrophes in names", () => {
      expect(createActorSlug("Sinéad O'Connor", 12345)).toBe("sin-ad-oconnor-12345")
    })

    it("handles curly apostrophes (U+2019)", () => {
      expect(createActorSlug("Sinéad O\u2019Connor", 12345)).toBe("sin-ad-oconnor-12345")
    })

    it("handles special characters in names", () => {
      expect(createActorSlug("Robert Downey Jr.", 3223)).toBe("robert-downey-jr-3223")
    })

    it("handles names with multiple parts", () => {
      expect(createActorSlug("Mary-Kate Olsen", 17052)).toBe("mary-kate-olsen-17052")
    })
  })

  describe("createShowSlug", () => {
    it("creates a basic slug with name, year, and id", () => {
      expect(createShowSlug("Breaking Bad", 2008, 1396)).toBe("breaking-bad-2008-1396")
    })

    it("handles apostrophes", () => {
      expect(createShowSlug("Grey's Anatomy", 2005, 1416)).toBe("greys-anatomy-2005-1416")
    })

    it("handles curly apostrophes (U+2019)", () => {
      expect(createShowSlug("Grey\u2019s Anatomy", 2005, 1416)).toBe("greys-anatomy-2005-1416")
    })

    it("handles null first air year", () => {
      expect(createShowSlug("Unknown Show", null, 99999)).toBe("unknown-show-unknown-99999")
    })

    it("handles special characters", () => {
      expect(createShowSlug("The Office (US)", 2005, 2316)).toBe("the-office-us-2005-2316")
    })

    it("handles colons and other punctuation", () => {
      expect(createShowSlug("Star Trek: The Next Generation", 1987, 655)).toBe(
        "star-trek-the-next-generation-1987-655"
      )
    })
  })
})
