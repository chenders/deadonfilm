import { describe, it, expect } from "vitest"
import {
  createMovieSlug,
  extractMovieId,
  extractYearFromSlug,
  createActorSlug,
  extractActorId,
} from "./slugify"

describe("createMovieSlug", () => {
  it("creates a slug from title, release date, and id", () => {
    expect(createMovieSlug("Breakfast at Tiffany's", "1961-10-05", 14629)).toBe(
      "breakfast-at-tiffanys-1961-14629"
    )
  })

  it("handles titles with special characters", () => {
    expect(
      createMovieSlug("The Lord of the Rings: The Fellowship of the Ring", "2001-12-19", 120)
    ).toBe("the-lord-of-the-rings-the-fellowship-of-the-ring-2001-120")
  })

  it("handles titles with numbers", () => {
    expect(createMovieSlug("2001: A Space Odyssey", "1968-04-02", 62)).toBe(
      "2001-a-space-odyssey-1968-62"
    )
  })

  it("removes apostrophes", () => {
    expect(createMovieSlug("Schindler's List", "1993-12-15", 424)).toBe("schindlers-list-1993-424")
  })

  it("handles curly apostrophes", () => {
    expect(createMovieSlug("It's a Wonderful Life", "1946-12-20", 1585)).toBe(
      "its-a-wonderful-life-1946-1585"
    )
  })

  it("removes leading and trailing hyphens", () => {
    expect(createMovieSlug("...And Justice for All", "1979-10-19", 10961)).toBe(
      "and-justice-for-all-1979-10961"
    )
  })

  it("handles empty release date", () => {
    expect(createMovieSlug("Unknown Movie", "", 99999)).toBe("unknown-movie-unknown-99999")
  })

  it("handles single word titles", () => {
    expect(createMovieSlug("Jaws", "1975-06-20", 578)).toBe("jaws-1975-578")
  })

  it("handles non-ASCII characters", () => {
    expect(createMovieSlug("Amélie", "2001-04-25", 194)).toBe("amelie-2001-194")
  })
})

describe("extractMovieId", () => {
  it("extracts ID from valid slug", () => {
    expect(extractMovieId("breakfast-at-tiffanys-1961-14629")).toBe(14629)
  })

  it("extracts ID from slug with large ID", () => {
    expect(extractMovieId("some-movie-2023-999999")).toBe(999999)
  })

  it("extracts ID from simple slug", () => {
    expect(extractMovieId("jaws-1975-578")).toBe(578)
  })

  it("returns 0 for invalid slug without ID", () => {
    expect(extractMovieId("invalid-slug-without-id")).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(extractMovieId("")).toBe(0)
  })

  it("handles slug with unknown year", () => {
    expect(extractMovieId("some-movie-unknown-12345")).toBe(12345)
  })
})

describe("extractYearFromSlug", () => {
  it("extracts year from valid slug", () => {
    expect(extractYearFromSlug("breakfast-at-tiffanys-1961-14629")).toBe("1961")
  })

  it("extracts year from recent movie", () => {
    expect(extractYearFromSlug("oppenheimer-2023-872585")).toBe("2023")
  })

  it("returns null for slug with unknown year", () => {
    expect(extractYearFromSlug("unknown-movie-unknown-99999")).toBe(null)
  })

  it("returns null for invalid slug", () => {
    expect(extractYearFromSlug("invalid-slug")).toBe(null)
  })

  it("returns null for empty string", () => {
    expect(extractYearFromSlug("")).toBe(null)
  })
})

describe("createActorSlug", () => {
  it("creates a slug from actor name and id", () => {
    expect(createActorSlug("John Wayne", 4165)).toBe("john-wayne-4165")
  })

  it("handles names with apostrophes", () => {
    expect(createActorSlug("Michael O'Brien", 12345)).toBe("michael-obrien-12345")
  })

  it("handles curly apostrophes", () => {
    expect(createActorSlug("Michael O'Brien", 12345)).toBe("michael-obrien-12345")
  })

  it("handles names with special characters", () => {
    expect(createActorSlug("Jean-Claude Van Damme", 5576)).toBe("jean-claude-van-damme-5576")
  })

  it("handles single word names", () => {
    expect(createActorSlug("Madonna", 65011)).toBe("madonna-65011")
  })

  it("handles names with periods and numbers", () => {
    expect(createActorSlug("Robert Downey Jr.", 3223)).toBe("robert-downey-jr-3223")
  })

  it("normalizes various accent types", () => {
    expect(createActorSlug("François Truffaut", 1)).toBe("francois-truffaut-1")
    expect(createActorSlug("Björk Guðmundsdóttir", 2)).toBe("bjork-gudmundsdottir-2")
    expect(createActorSlug("José García", 3)).toBe("jose-garcia-3")
    expect(createActorSlug("Penélope Cruz", 4)).toBe("penelope-cruz-4")
    expect(createActorSlug("Māris Liepa", 5)).toBe("maris-liepa-5")
  })
})

describe("extractActorId", () => {
  it("extracts ID from valid actor slug", () => {
    expect(extractActorId("john-wayne-4165")).toBe(4165)
  })

  it("extracts ID from actor with hyphenated name", () => {
    expect(extractActorId("jean-claude-van-damme-5576")).toBe(5576)
  })

  it("extracts ID with large number", () => {
    expect(extractActorId("some-actor-999999")).toBe(999999)
  })

  it("returns 0 for invalid slug without ID", () => {
    expect(extractActorId("invalid-slug")).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(extractActorId("")).toBe(0)
  })
})
