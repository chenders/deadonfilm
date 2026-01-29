import { describe, it, expect, vi } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt } from "./backfill-death-links.js"
import {
  getProjectTmdbId,
  setProjectTmdbId,
  getCelebrityTmdbId,
  setCelebrityTmdbId,
  lookupProject,
  lookupActor,
} from "../src/lib/death-link-backfiller.js"
import type { ProjectInfo, RelatedCelebrity } from "../src/lib/db/types.js"

describe("parsePositiveInt", () => {
  it("parses valid positive integer", () => {
    expect(parsePositiveInt("42")).toBe(42)
    expect(parsePositiveInt("1")).toBe(1)
    expect(parsePositiveInt("1000")).toBe(1000)
  })

  it("throws InvalidArgumentError for non-numeric input", () => {
    expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("abc")).toThrow("Must be a positive integer")
  })

  it("throws InvalidArgumentError for zero", () => {
    expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
  })

  it("throws InvalidArgumentError for negative numbers", () => {
    expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
  })

  it("accepts decimal numbers that parse to positive integers", () => {
    // parseInt truncates decimals, so "3.14" becomes 3
    expect(parsePositiveInt("3.14")).toBe(3)
  })
})

describe("getProjectTmdbId", () => {
  it("returns snake_case tmdb_id when present", () => {
    const project = { title: "Test", year: 2020, type: "movie", tmdb_id: 123 } as ProjectInfo
    expect(getProjectTmdbId(project)).toBe(123)
  })

  it("returns camelCase tmdbId when snake_case is null", () => {
    const project = {
      title: "Test",
      year: 2020,
      type: "movie",
      tmdb_id: null,
      tmdbId: 456,
    } as ProjectInfo & {
      tmdbId: number
    }
    expect(getProjectTmdbId(project)).toBe(456)
  })

  it("returns null when both are null", () => {
    const project = { title: "Test", year: 2020, type: "movie", tmdb_id: null } as ProjectInfo
    expect(getProjectTmdbId(project)).toBeNull()
  })

  it("prefers snake_case over camelCase when both are present", () => {
    const project = {
      title: "Test",
      year: 2020,
      type: "movie",
      tmdb_id: 123,
      tmdbId: 456,
    } as ProjectInfo & {
      tmdbId: number
    }
    expect(getProjectTmdbId(project)).toBe(123)
  })
})

describe("setProjectTmdbId", () => {
  it("sets both snake_case and camelCase tmdb_id", () => {
    const project = { title: "Test", year: 2020, type: "movie", tmdb_id: null } as ProjectInfo & {
      tmdbId?: number | null
    }
    setProjectTmdbId(project, 789)

    expect(project.tmdb_id).toBe(789)
    expect(project.tmdbId).toBe(789)
  })

  it("overwrites existing values", () => {
    const project = {
      title: "Test",
      year: 2020,
      type: "movie",
      tmdb_id: 100,
      tmdbId: 200,
    } as ProjectInfo & {
      tmdbId: number
    }
    setProjectTmdbId(project, 300)

    expect(project.tmdb_id).toBe(300)
    expect(project.tmdbId).toBe(300)
  })
})

describe("getCelebrityTmdbId", () => {
  it("returns snake_case tmdb_id when present", () => {
    const celebrity = {
      name: "Test Actor",
      relationship: "friend",
      tmdb_id: 123,
    } as RelatedCelebrity
    expect(getCelebrityTmdbId(celebrity)).toBe(123)
  })

  it("returns camelCase tmdbId when snake_case is null", () => {
    const celebrity = {
      name: "Test Actor",
      relationship: "friend",
      tmdb_id: null,
      tmdbId: 456,
    } as RelatedCelebrity & {
      tmdbId: number
    }
    expect(getCelebrityTmdbId(celebrity)).toBe(456)
  })

  it("returns null when both are null", () => {
    const celebrity = {
      name: "Test Actor",
      relationship: "friend",
      tmdb_id: null,
    } as RelatedCelebrity
    expect(getCelebrityTmdbId(celebrity)).toBeNull()
  })

  it("prefers snake_case over camelCase when both are present", () => {
    const celebrity = {
      name: "Test Actor",
      relationship: "friend",
      tmdb_id: 123,
      tmdbId: 456,
    } as RelatedCelebrity & {
      tmdbId: number
    }
    expect(getCelebrityTmdbId(celebrity)).toBe(123)
  })
})

describe("setCelebrityTmdbId", () => {
  it("sets both snake_case and camelCase tmdb_id", () => {
    const celebrity = {
      name: "Test Actor",
      relationship: "friend",
      tmdb_id: null,
    } as RelatedCelebrity & {
      tmdbId?: number | null
    }
    setCelebrityTmdbId(celebrity, 789)

    expect(celebrity.tmdb_id).toBe(789)
    expect(celebrity.tmdbId).toBe(789)
  })

  it("overwrites existing values", () => {
    const celebrity = {
      name: "Test Actor",
      relationship: "friend",
      tmdb_id: 100,
      tmdbId: 200,
    } as RelatedCelebrity & {
      tmdbId: number
    }
    setCelebrityTmdbId(celebrity, 300)

    expect(celebrity.tmdb_id).toBe(300)
    expect(celebrity.tmdbId).toBe(300)
  })
})

describe("lookupProject", () => {
  const createMockDb = (movieRows: { tmdb_id: number }[], showRows: { tmdb_id: number }[]) => {
    return {
      query: vi.fn((query: string) => {
        if (query.includes("FROM movies")) {
          return Promise.resolve({ rows: movieRows })
        } else if (query.includes("FROM shows")) {
          return Promise.resolve({ rows: showRows })
        }
        return Promise.resolve({ rows: [] })
      }),
    } as any
  }

  it("finds movie by exact title match", async () => {
    const db = createMockDb([{ tmdb_id: 123 }], [])
    const result = await lookupProject(db, "The Matrix", null, "movie")
    expect(result).toBe(123)
  })

  it("finds movie by title and year", async () => {
    const db = createMockDb([{ tmdb_id: 456 }], [])
    const result = await lookupProject(db, "Avatar", 2009, "movie")
    expect(result).toBe(456)
  })

  it("finds show by exact name match", async () => {
    const db = createMockDb([], [{ tmdb_id: 789 }])
    const result = await lookupProject(db, "Breaking Bad", null, "show")
    expect(result).toBe(789)
  })

  it("finds show by name and year", async () => {
    const db = createMockDb([], [{ tmdb_id: 999 }])
    const result = await lookupProject(db, "Game of Thrones", 2011, "show")
    expect(result).toBe(999)
  })

  it("tries movies first when type is not 'show'", async () => {
    const db = createMockDb([{ tmdb_id: 111 }], [{ tmdb_id: 222 }])
    const result = await lookupProject(db, "Ambiguous Title", null, "movie")
    expect(result).toBe(111)
  })

  it("skips movies when type is 'show'", async () => {
    const db = createMockDb([{ tmdb_id: 111 }], [{ tmdb_id: 222 }])
    const result = await lookupProject(db, "TV Title", null, "show")
    expect(result).toBe(222)
  })

  it("falls back to shows when movie not found and type is not 'movie'", async () => {
    // When type is "movie", only movies are searched (no fallback to shows)
    // When type is not "movie" or "show", it falls back to shows
    const db = createMockDb([], [{ tmdb_id: 333 }])
    const result = await lookupProject(db, "Unknown Title", null, "unknown")
    expect(result).toBe(333)
  })

  it("returns null when no matches found", async () => {
    const db = createMockDb([], [])
    const result = await lookupProject(db, "Nonexistent", null, "movie")
    expect(result).toBeNull()
  })
})

describe("lookupActor", () => {
  const createMockDb = (
    exactRows: { tmdb_id: number }[],
    simplifiedRows: { tmdb_id: number }[] = []
  ) => {
    let callCount = 0
    return {
      query: vi.fn(() => {
        const rows = callCount === 0 ? exactRows : simplifiedRows
        callCount++
        return Promise.resolve({ rows })
      }),
    } as any
  }

  it("finds actor by exact name match", async () => {
    const db = createMockDb([{ tmdb_id: 123 }])
    const result = await lookupActor(db, "Tom Hanks")
    expect(result).toBe(123)
  })

  it("returns null when no exact match found", async () => {
    const db = createMockDb([], [])
    const result = await lookupActor(db, "Unknown Actor")
    expect(result).toBeNull()
  })

  it("tries simplified name when exact match fails", async () => {
    const db = createMockDb([], [{ tmdb_id: 456 }])
    const result = await lookupActor(db, "John Q. Smith")
    expect(result).toBe(456)
  })

  it("simplifies middle initial with period", async () => {
    const db = createMockDb([], [{ tmdb_id: 789 }])
    const result = await lookupActor(db, "Mary J. Watson")
    expect(result).toBe(789)
  })

  it("simplifies middle initial without period", async () => {
    const db = createMockDb([], [{ tmdb_id: 999 }])
    const result = await lookupActor(db, "Robert C Downey")
    expect(result).toBe(999)
  })

  it("does not try simplified lookup if name unchanged", async () => {
    const db = createMockDb([])
    const result = await lookupActor(db, "Simple Name")
    expect(result).toBeNull()
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it("returns null when both exact and simplified lookups fail", async () => {
    const db = createMockDb([], [])
    const result = await lookupActor(db, "John Q. Unknown")
    expect(result).toBeNull()
  })
})
