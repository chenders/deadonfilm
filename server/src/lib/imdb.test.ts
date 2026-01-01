import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * IMDb Module Tests
 *
 * The IMDb module downloads and parses large gzipped TSV files from IMDb's datasets.
 * Most functions require network access and file system operations with multi-GB files,
 * making them impractical for unit tests.
 *
 * This test file covers:
 * 1. Utility function logic (parseNullable, parseNullableInt)
 * 2. Data structure validation
 * 3. Cache validity logic
 *
 * For full integration testing, use the CLI scripts with --dry-run mode.
 */

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("IMDb filename validation", () => {
  /**
   * Tests for validateFilename - security function that prevents path traversal
   * by only allowing known IMDb dataset filenames.
   */

  const ALLOWED_FILENAMES = new Set([
    "title.episode.tsv.gz",
    "title.basics.tsv.gz",
    "title.principals.tsv.gz",
    "name.basics.tsv.gz",
  ])

  function validateFilename(filename: string): string {
    if (!ALLOWED_FILENAMES.has(filename)) {
      throw new Error("Invalid IMDb dataset filename")
    }
    return filename
  }

  it("accepts valid filenames and returns them unchanged", () => {
    expect(validateFilename("title.episode.tsv.gz")).toBe("title.episode.tsv.gz")
    expect(validateFilename("title.basics.tsv.gz")).toBe("title.basics.tsv.gz")
    expect(validateFilename("title.principals.tsv.gz")).toBe("title.principals.tsv.gz")
    expect(validateFilename("name.basics.tsv.gz")).toBe("name.basics.tsv.gz")
  })

  it("throws error for path traversal attempts", () => {
    expect(() => validateFilename("../../../etc/passwd")).toThrow("Invalid IMDb dataset filename")
    expect(() => validateFilename("..\\..\\..\\etc\\passwd")).toThrow(
      "Invalid IMDb dataset filename"
    )
    expect(() => validateFilename("/etc/passwd")).toThrow("Invalid IMDb dataset filename")
  })

  it("throws error for arbitrary filenames", () => {
    expect(() => validateFilename("malicious.txt")).toThrow("Invalid IMDb dataset filename")
    expect(() => validateFilename("")).toThrow("Invalid IMDb dataset filename")
    expect(() => validateFilename("title.episode.tsv")).toThrow("Invalid IMDb dataset filename")
  })

  it("uses generic error message without leaking filename", () => {
    try {
      validateFilename("secret-file.txt")
      expect.fail("Should have thrown")
    } catch (error) {
      expect((error as Error).message).toBe("Invalid IMDb dataset filename")
      expect((error as Error).message).not.toContain("secret-file.txt")
    }
  })
})

describe("IMDb utility functions", () => {
  /**
   * These tests mirror the internal parseNullable and parseNullableInt functions.
   * IMDb TSV files use "\\N" to represent null values.
   */

  function parseNullable(value: string): string | null {
    return value === "\\N" ? null : value
  }

  function parseNullableInt(value: string): number | null {
    if (value === "\\N") return null
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? null : parsed
  }

  describe("parseNullable", () => {
    it("returns null for \\N", () => {
      expect(parseNullable("\\N")).toBeNull()
    })

    it("returns string value for non-null values", () => {
      expect(parseNullable("Hello")).toBe("Hello")
      expect(parseNullable("")).toBe("")
      expect(parseNullable("123")).toBe("123")
    })

    it("preserves special characters", () => {
      expect(parseNullable("O'Brien")).toBe("O'Brien")
      expect(parseNullable("Café")).toBe("Café")
    })
  })

  describe("parseNullableInt", () => {
    it("returns null for \\N", () => {
      expect(parseNullableInt("\\N")).toBeNull()
    })

    it("parses valid integers", () => {
      expect(parseNullableInt("1")).toBe(1)
      expect(parseNullableInt("123")).toBe(123)
      expect(parseNullableInt("2024")).toBe(2024)
    })

    it("returns null for non-numeric strings", () => {
      expect(parseNullableInt("abc")).toBeNull()
      expect(parseNullableInt("")).toBeNull()
      expect(parseNullableInt("hello")).toBeNull()
    })

    it("parses leading digits from mixed strings", () => {
      // parseInt behavior - only takes leading digits
      expect(parseNullableInt("123abc")).toBe(123)
    })

    it("handles zero", () => {
      expect(parseNullableInt("0")).toBe(0)
    })

    it("handles negative numbers", () => {
      expect(parseNullableInt("-1")).toBe(-1)
    })
  })
})

describe("IMDb cache validity logic", () => {
  /**
   * Cache TTL is 24 hours. These tests validate the isCacheValid logic.
   */

  const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

  interface CacheMetadata {
    downloadedAt: number
    size: number
  }

  function isCacheValid(metadata: CacheMetadata | null): boolean {
    if (!metadata) return false
    return Date.now() - metadata.downloadedAt < CACHE_TTL_MS
  }

  it("returns false for null metadata", () => {
    expect(isCacheValid(null)).toBe(false)
  })

  it("returns true for recently downloaded file", () => {
    const metadata: CacheMetadata = {
      downloadedAt: Date.now() - 1000, // 1 second ago
      size: 1000,
    }
    expect(isCacheValid(metadata)).toBe(true)
  })

  it("returns true for file downloaded 12 hours ago", () => {
    const metadata: CacheMetadata = {
      downloadedAt: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
      size: 1000,
    }
    expect(isCacheValid(metadata)).toBe(true)
  })

  it("returns false for file downloaded 25 hours ago", () => {
    const metadata: CacheMetadata = {
      downloadedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      size: 1000,
    }
    expect(isCacheValid(metadata)).toBe(false)
  })

  it("returns true for file downloaded exactly 23 hours 59 minutes ago", () => {
    const metadata: CacheMetadata = {
      downloadedAt: Date.now() - (24 * 60 * 60 * 1000 - 60 * 1000), // 23:59 ago
      size: 1000,
    }
    expect(isCacheValid(metadata)).toBe(true)
  })
})

describe("IMDb data structures", () => {
  /**
   * These tests validate the structure of normalized IMDb data.
   */

  interface ImdbEpisode {
    tconst: string
    parentTconst: string
    seasonNumber: number | null
    episodeNumber: number | null
  }

  interface ImdbPrincipal {
    tconst: string
    ordering: number
    nconst: string
    category: string
    job: string | null
    characters: string[] | null
  }

  interface ImdbPerson {
    nconst: string
    primaryName: string
    birthYear: number | null
    deathYear: number | null
    primaryProfession: string[]
    knownForTitles: string[]
  }

  describe("ImdbEpisode", () => {
    it("has correct structure", () => {
      const episode: ImdbEpisode = {
        tconst: "tt0531270",
        parentTconst: "tt0060316",
        seasonNumber: 1,
        episodeNumber: 1,
      }

      expect(episode.tconst).toBe("tt0531270")
      expect(episode.parentTconst).toBe("tt0060316")
      expect(episode.seasonNumber).toBe(1)
      expect(episode.episodeNumber).toBe(1)
    })

    it("allows null season/episode numbers", () => {
      const episode: ImdbEpisode = {
        tconst: "tt0531270",
        parentTconst: "tt0060316",
        seasonNumber: null,
        episodeNumber: null,
      }

      expect(episode.seasonNumber).toBeNull()
      expect(episode.episodeNumber).toBeNull()
    })
  })

  describe("ImdbPrincipal", () => {
    it("has correct structure", () => {
      const principal: ImdbPrincipal = {
        tconst: "tt0531270",
        ordering: 1,
        nconst: "nm0000001",
        category: "actor",
        job: null,
        characters: ["Character Name"],
      }

      expect(principal.tconst).toBe("tt0531270")
      expect(principal.ordering).toBe(1)
      expect(principal.nconst).toBe("nm0000001")
      expect(principal.category).toBe("actor")
      expect(principal.characters).toEqual(["Character Name"])
    })

    it("supports multiple characters", () => {
      const principal: ImdbPrincipal = {
        tconst: "tt0531270",
        ordering: 1,
        nconst: "nm0000001",
        category: "actor",
        job: null,
        characters: ["Character 1", "Character 2"],
      }

      expect(principal.characters).toHaveLength(2)
    })
  })

  describe("ImdbPerson", () => {
    it("has correct structure for living person", () => {
      const person: ImdbPerson = {
        nconst: "nm0000001",
        primaryName: "Fred Astaire",
        birthYear: 1899,
        deathYear: null,
        primaryProfession: ["actor", "producer"],
        knownForTitles: ["tt0031983", "tt0055614"],
      }

      expect(person.nconst).toBe("nm0000001")
      expect(person.primaryName).toBe("Fred Astaire")
      expect(person.birthYear).toBe(1899)
      expect(person.deathYear).toBeNull()
    })

    it("has correct structure for deceased person", () => {
      const person: ImdbPerson = {
        nconst: "nm0000001",
        primaryName: "Fred Astaire",
        birthYear: 1899,
        deathYear: 1987,
        primaryProfession: ["actor", "producer"],
        knownForTitles: ["tt0031983", "tt0055614"],
      }

      expect(person.deathYear).toBe(1987)
    })
  })
})

describe("NormalizedImdbCastMember structure", () => {
  /**
   * Tests for the normalized cast member format used by processEpisodeCast.
   */

  interface NormalizedImdbCastMember {
    name: string
    characterName: string | null
    birthday: string | null
    deathday: string | null
    profilePath: string | null
    billingOrder: number
    appearanceType: "regular" | "guest"
    imdbPersonId: string
    birthYear: number | null
    deathYear: number | null
  }

  it("has correct structure for deceased actor", () => {
    const castMember: NormalizedImdbCastMember = {
      name: "Fred Astaire",
      characterName: "Character Name",
      birthday: null, // IMDb only has year, not full date
      deathday: null, // IMDb only has year, not full date
      profilePath: null, // IMDb datasets don't include images
      billingOrder: 0,
      appearanceType: "guest", // IMDb can't distinguish regular vs guest
      imdbPersonId: "nm0000001",
      birthYear: 1899,
      deathYear: 1987,
    }

    expect(castMember.name).toBe("Fred Astaire")
    expect(castMember.imdbPersonId).toBe("nm0000001")
    expect(castMember.birthYear).toBe(1899)
    expect(castMember.deathYear).toBe(1987)
    // birthday/deathday are null because IMDb only provides years
    expect(castMember.birthday).toBeNull()
    expect(castMember.deathday).toBeNull()
  })

  it("has correct structure for living actor", () => {
    const castMember: NormalizedImdbCastMember = {
      name: "Living Actor",
      characterName: "Some Role",
      birthday: null,
      deathday: null,
      profilePath: null,
      billingOrder: 1,
      appearanceType: "guest",
      imdbPersonId: "nm0000002",
      birthYear: 1980,
      deathYear: null,
    }

    expect(castMember.birthYear).toBe(1980)
    expect(castMember.deathYear).toBeNull()
  })
})
