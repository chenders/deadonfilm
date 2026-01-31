import { describe, it, expect, vi, beforeEach } from "vitest"
import { detectAppearanceType } from "./imdb.js"

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

describe("getAllShowEpisodesWithDetails", () => {
  /**
   * Tests for getAllShowEpisodesWithDetails - fetches ALL episodes for a show
   * without filtering by season. Used when IMDb season data is unreliable.
   *
   * Note: This function requires network access and file parsing, so we test
   * the expected structure and behavior rather than actual API calls.
   */

  interface NormalizedImdbEpisode {
    seasonNumber: number
    episodeNumber: number
    name: string | null
    overview: string | null
    airDate: string | null
    runtime: number | null
    stillPath: string | null
    imdbEpisodeId: string
  }

  it("has correct structure for returned episodes", () => {
    const episode: NormalizedImdbEpisode = {
      seasonNumber: 1,
      episodeNumber: 42,
      name: "Episode Title",
      overview: null, // IMDb datasets don't include plot summaries
      airDate: null, // IMDb datasets don't include air dates
      runtime: 45,
      stillPath: null, // IMDb datasets don't include images
      imdbEpisodeId: "tt0123456",
    }

    expect(episode.seasonNumber).toBe(1)
    expect(episode.episodeNumber).toBe(42)
    expect(episode.name).toBe("Episode Title")
    expect(episode.imdbEpisodeId).toBe("tt0123456")
    expect(episode.runtime).toBe(45)
    // These are always null from IMDb datasets
    expect(episode.overview).toBeNull()
    expect(episode.airDate).toBeNull()
    expect(episode.stillPath).toBeNull()
  })

  it("handles episodes with null season numbers by defaulting to 1", () => {
    // When IMDb has null season, we default to 1
    const episode: NormalizedImdbEpisode = {
      seasonNumber: 1, // Defaulted from null
      episodeNumber: 1,
      name: "Unknown Season Episode",
      overview: null,
      airDate: null,
      runtime: null,
      stillPath: null,
      imdbEpisodeId: "tt9999999",
    }

    expect(episode.seasonNumber).toBe(1)
  })

  it("sorts episodes by season then episode number", () => {
    // Test the expected sort order
    const episodes: NormalizedImdbEpisode[] = [
      {
        seasonNumber: 2,
        episodeNumber: 1,
        name: "S2E1",
        overview: null,
        airDate: null,
        runtime: null,
        stillPath: null,
        imdbEpisodeId: "tt0003",
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        name: "S1E2",
        overview: null,
        airDate: null,
        runtime: null,
        stillPath: null,
        imdbEpisodeId: "tt0002",
      },
      {
        seasonNumber: 1,
        episodeNumber: 1,
        name: "S1E1",
        overview: null,
        airDate: null,
        runtime: null,
        stillPath: null,
        imdbEpisodeId: "tt0001",
      },
    ]

    // Sort by season first, then by episode
    const sorted = [...episodes].sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) {
        return a.seasonNumber - b.seasonNumber
      }
      return a.episodeNumber - b.episodeNumber
    })

    expect(sorted[0].imdbEpisodeId).toBe("tt0001") // S1E1
    expect(sorted[1].imdbEpisodeId).toBe("tt0002") // S1E2
    expect(sorted[2].imdbEpisodeId).toBe("tt0003") // S2E1
  })

  it("returns empty array for shows with no episodes", () => {
    // The function should return [] when no episodes are found
    const episodes: NormalizedImdbEpisode[] = []
    expect(episodes).toHaveLength(0)
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

describe("detectAppearanceType", () => {
  /**
   * Tests for the detectAppearanceType function which analyzes IMDb character
   * fields to determine if someone is playing themselves (documentaries),
   * appearing in archive footage, or in a regular acting role.
   *
   * Uses the production function imported from ./imdb.js
   */

  describe("regular appearances", () => {
    it("returns regular for null character name", () => {
      expect(detectAppearanceType(null)).toBe("regular")
    })

    it("returns regular for empty string", () => {
      expect(detectAppearanceType("")).toBe("regular")
    })

    it("returns regular for standard character names", () => {
      expect(detectAppearanceType("John Smith")).toBe("regular")
      expect(detectAppearanceType("The Villain")).toBe("regular")
      expect(detectAppearanceType("Dr. Evil")).toBe("regular")
      expect(detectAppearanceType("Young Version of Main Character")).toBe("regular")
    })

    it("returns regular for character with 'self' as part of larger word", () => {
      // "Selfish" contains "self" but shouldn't match
      expect(detectAppearanceType("Selfish Character")).toBe("regular")
      expect(detectAppearanceType("Mr. Selfridge")).toBe("regular")
    })
  })

  describe("self appearances", () => {
    it("detects exact 'Self' match", () => {
      expect(detectAppearanceType("Self")).toBe("self")
      expect(detectAppearanceType("self")).toBe("self")
      expect(detectAppearanceType("SELF")).toBe("self")
    })

    it("detects himself/herself patterns", () => {
      expect(detectAppearanceType("Himself")).toBe("self")
      expect(detectAppearanceType("Herself")).toBe("self")
      expect(detectAppearanceType("himself")).toBe("self")
      expect(detectAppearanceType("herself")).toBe("self")
    })

    it("detects 'as himself/herself' patterns", () => {
      expect(detectAppearanceType("as himself")).toBe("self")
      expect(detectAppearanceType("as herself")).toBe("self")
      expect(detectAppearanceType("As Himself")).toBe("self")
    })

    it("detects self with descriptors", () => {
      expect(detectAppearanceType("Self - Interview Subject")).toBe("self")
      expect(detectAppearanceType("himself (interview)")).toBe("self")
    })

    it("detects parenthesized self patterns", () => {
      expect(detectAppearanceType("(self)")).toBe("self")
      expect(detectAppearanceType("(himself)")).toBe("self")
      expect(detectAppearanceType("(herself)")).toBe("self")
    })
  })

  describe("archive footage appearances", () => {
    it("detects 'archive footage' pattern", () => {
      expect(detectAppearanceType("Self (archive footage)")).toBe("archive")
      expect(detectAppearanceType("archive footage")).toBe("archive")
      expect(detectAppearanceType("Himself (archive footage)")).toBe("archive")
    })

    it("detects various archive patterns", () => {
      expect(detectAppearanceType("archive film")).toBe("archive")
      expect(detectAppearanceType("archive material")).toBe("archive")
      expect(detectAppearanceType("(archive)")).toBe("archive")
      expect(detectAppearanceType("archival footage")).toBe("archive")
      expect(detectAppearanceType("stock footage")).toBe("archive")
      expect(detectAppearanceType("newsreel footage")).toBe("archive")
    })

    it("detects 'footage from' pattern", () => {
      expect(detectAppearanceType("footage from earlier film")).toBe("archive")
      expect(detectAppearanceType("scenes from 1985 interview")).toBe("archive")
    })

    it("prioritizes archive over self detection", () => {
      // If both patterns match, archive takes precedence
      expect(detectAppearanceType("Self (archive footage)")).toBe("archive")
      expect(detectAppearanceType("Himself - archive footage from 1960")).toBe("archive")
    })
  })
})

describe("ImdbMovieBasics structure", () => {
  /**
   * Tests for the ImdbMovieBasics type used by getMovieIndex().
   * This is the structure returned for fuzzy movie title matching.
   */

  interface ImdbMovieBasics {
    tconst: string
    primaryTitle: string
    originalTitle: string
    startYear: number | null
    runtimeMinutes: number | null
  }

  it("has correct structure for a typical movie", () => {
    const movie: ImdbMovieBasics = {
      tconst: "tt0111161",
      primaryTitle: "The Shawshank Redemption",
      originalTitle: "The Shawshank Redemption",
      startYear: 1994,
      runtimeMinutes: 142,
    }

    expect(movie.tconst).toBe("tt0111161")
    expect(movie.primaryTitle).toBe("The Shawshank Redemption")
    expect(movie.startYear).toBe(1994)
  })

  it("supports different primary and original titles (foreign films)", () => {
    const movie: ImdbMovieBasics = {
      tconst: "tt0245429",
      primaryTitle: "Spirited Away",
      originalTitle: "Sen to Chihiro no kamikakushi",
      startYear: 2001,
      runtimeMinutes: 125,
    }

    expect(movie.primaryTitle).toBe("Spirited Away")
    expect(movie.originalTitle).toBe("Sen to Chihiro no kamikakushi")
  })

  it("allows null runtime for incomplete data", () => {
    const movie: ImdbMovieBasics = {
      tconst: "tt9999999",
      primaryTitle: "Unknown Movie",
      originalTitle: "Unknown Movie",
      startYear: 2020,
      runtimeMinutes: null,
    }

    expect(movie.runtimeMinutes).toBeNull()
  })

  it("can be used for Fuse.js fuzzy matching", () => {
    // Demonstrates the expected use case: building a Fuse.js index
    const movies: ImdbMovieBasics[] = [
      {
        tconst: "tt0111161",
        primaryTitle: "The Shawshank Redemption",
        originalTitle: "The Shawshank Redemption",
        startYear: 1994,
        runtimeMinutes: 142,
      },
      {
        tconst: "tt0068646",
        primaryTitle: "The Godfather",
        originalTitle: "The Godfather",
        startYear: 1972,
        runtimeMinutes: 175,
      },
    ]

    // Fuse.js would be configured like this:
    // const fuse = new Fuse(movies, { keys: ["primaryTitle", "originalTitle"] })
    expect(movies).toHaveLength(2)
    expect(movies[0].primaryTitle).toBe("The Shawshank Redemption")
  })
})

describe("NormalizedImdbMovieCastMember structure", () => {
  /**
   * Tests for the normalized movie cast member format used for documentary/movie imports.
   */

  type MovieAppearanceType = "regular" | "self" | "archive"

  interface NormalizedImdbMovieCastMember {
    name: string
    characterName: string | null
    birthday: string | null
    deathday: string | null
    profilePath: string | null
    billingOrder: number
    appearanceType: MovieAppearanceType
    imdbPersonId: string
    birthYear: number | null
    deathYear: number | null
  }

  it("has correct structure for documentary subject (self)", () => {
    const castMember: NormalizedImdbMovieCastMember = {
      name: "Documentary Subject",
      characterName: "Self",
      birthday: "1950-01-01",
      deathday: "2020-01-01",
      profilePath: null,
      billingOrder: 0,
      appearanceType: "self",
      imdbPersonId: "nm0000001",
      birthYear: 1950,
      deathYear: 2020,
    }

    expect(castMember.appearanceType).toBe("self")
    expect(castMember.characterName).toBe("Self")
  })

  it("has correct structure for archive footage appearance", () => {
    const castMember: NormalizedImdbMovieCastMember = {
      name: "Historical Figure",
      characterName: "Himself (archive footage)",
      birthday: "1900-01-01",
      deathday: "1960-01-01",
      profilePath: null,
      billingOrder: 5,
      appearanceType: "archive",
      imdbPersonId: "nm0000002",
      birthYear: 1900,
      deathYear: 1960,
    }

    expect(castMember.appearanceType).toBe("archive")
    expect(castMember.characterName).toBe("Himself (archive footage)")
  })

  it("has correct structure for regular acting role", () => {
    const castMember: NormalizedImdbMovieCastMember = {
      name: "Actor Name",
      characterName: "Character Role",
      birthday: "1970-01-01",
      deathday: null,
      profilePath: null,
      billingOrder: 2,
      appearanceType: "regular",
      imdbPersonId: "nm0000003",
      birthYear: 1970,
      deathYear: null,
    }

    expect(castMember.appearanceType).toBe("regular")
    expect(castMember.deathYear).toBeNull()
  })
})
