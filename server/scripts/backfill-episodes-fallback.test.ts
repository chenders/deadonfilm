import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, parseSource } from "./backfill-episodes-fallback.js"

describe("backfill-episodes-fallback argument parsing", () => {
  describe("parsePositiveInt", () => {
    it("parses valid positive integers", () => {
      expect(parsePositiveInt("1")).toBe(1)
      expect(parsePositiveInt("123")).toBe(123)
      expect(parsePositiveInt("9999")).toBe(9999)
    })

    it("rejects zero", () => {
      expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
    })

    it("rejects negative numbers", () => {
      expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
    })

    it("rejects non-integer values", () => {
      expect(() => parsePositiveInt("1.5")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("3.14")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("12abc")).toThrow(InvalidArgumentError)
    })

    it("rejects whitespace-only strings", () => {
      expect(() => parsePositiveInt("   ")).toThrow(InvalidArgumentError)
    })
  })

  describe("parseSource", () => {
    it("accepts 'tvmaze' as valid source", () => {
      expect(parseSource("tvmaze")).toBe("tvmaze")
    })

    it("accepts 'thetvdb' as valid source", () => {
      expect(parseSource("thetvdb")).toBe("thetvdb")
    })

    it("rejects 'tmdb' (not a fallback source)", () => {
      expect(() => parseSource("tmdb")).toThrow(InvalidArgumentError)
      expect(() => parseSource("tmdb")).toThrow("Source must be 'tvmaze' or 'thetvdb'")
    })

    it("rejects empty string", () => {
      expect(() => parseSource("")).toThrow(InvalidArgumentError)
    })

    it("rejects invalid source names", () => {
      expect(() => parseSource("tvrage")).toThrow(InvalidArgumentError)
      expect(() => parseSource("imdb")).toThrow(InvalidArgumentError)
      expect(() => parseSource("TVmaze")).toThrow(InvalidArgumentError) // Case-sensitive
    })
  })
})

describe("backfill-episodes-fallback validation logic", () => {
  // These tests validate the logic that would be used in runBackfill
  // without actually running the backfill (which requires database/API access)

  interface BackfillOptions {
    detectGaps?: boolean
    show?: number
    source?: "tvmaze" | "thetvdb"
    dryRun?: boolean
  }

  function validateOptions(options: BackfillOptions): string | null {
    if (!options.detectGaps && !options.show) {
      return "Must specify either --detect-gaps or --show <id>"
    }
    return null
  }

  it("requires either --detect-gaps or --show option", () => {
    expect(validateOptions({})).toBe("Must specify either --detect-gaps or --show <id>")
  })

  it("accepts --detect-gaps without --show", () => {
    expect(validateOptions({ detectGaps: true })).toBeNull()
  })

  it("accepts --show without --detect-gaps", () => {
    expect(validateOptions({ show: 123 })).toBeNull()
  })

  it("accepts both --detect-gaps and --show (detect-gaps takes precedence)", () => {
    expect(validateOptions({ detectGaps: true, show: 123 })).toBeNull()
  })

  it("accepts --dry-run with either mode", () => {
    expect(validateOptions({ detectGaps: true, dryRun: true })).toBeNull()
    expect(validateOptions({ show: 123, dryRun: true })).toBeNull()
  })

  it("accepts --source with --show", () => {
    expect(validateOptions({ show: 123, source: "tvmaze" })).toBeNull()
    expect(validateOptions({ show: 123, source: "thetvdb" })).toBeNull()
  })
})

describe("backfill-episodes-fallback environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
    tmdbApiToken?: string
    dryRun?: boolean
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl && !env.dryRun) {
      errors.push("DATABASE_URL environment variable is required (or use --dry-run)")
    }

    if (!env.tmdbApiToken) {
      errors.push("TMDB_API_TOKEN environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL when not in dry-run mode", () => {
    const errors = checkEnv({ tmdbApiToken: "token" })
    expect(errors).toContain("DATABASE_URL environment variable is required (or use --dry-run)")
  })

  it("allows missing DATABASE_URL in dry-run mode", () => {
    const errors = checkEnv({ tmdbApiToken: "token", dryRun: true })
    expect(errors).not.toContain("DATABASE_URL environment variable is required (or use --dry-run)")
  })

  it("always requires TMDB_API_TOKEN", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", dryRun: true })
    expect(errors).toContain("TMDB_API_TOKEN environment variable is required")
  })

  it("passes when all required env vars are present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", tmdbApiToken: "token" })
    expect(errors).toHaveLength(0)
  })
})
