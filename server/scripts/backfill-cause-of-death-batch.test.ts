import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { InvalidArgumentError } from "commander"
import fs from "fs"
import path from "path"
import os from "os"
import {
  parsePositiveInt,
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  normalizeDateToString,
  getYearFromDate,
  getMonthDayFromDate,
  stripMarkdownCodeFences,
  type Checkpoint,
} from "./backfill-cause-of-death-batch.js"
import { loadCheckpoint as loadCheckpointGeneric } from "../src/lib/checkpoint-utils.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-cause-of-death-batch argument parsing", () => {
  describe("parsePositiveInt", () => {
    it("parses valid positive integers", () => {
      expect(parsePositiveInt("1")).toBe(1)
      expect(parsePositiveInt("50")).toBe(50)
      expect(parsePositiveInt("1000")).toBe(1000)
    })

    it("rejects zero", () => {
      expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
    })

    it("rejects negative numbers", () => {
      expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("-50")).toThrow(InvalidArgumentError)
    })

    it("rejects floating point numbers", () => {
      expect(() => parsePositiveInt("1.5")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("10.0")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
      expect(() => parsePositiveInt("ten")).toThrow(InvalidArgumentError)
    })
  })
})

describe("backfill-cause-of-death-batch environment validation", () => {
  interface EnvCheck {
    databaseUrl?: string
    anthropicApiKey?: string
    dryRun?: boolean
  }

  function checkEnv(env: EnvCheck): string[] {
    const errors: string[] = []

    if (!env.databaseUrl) {
      errors.push("DATABASE_URL environment variable is required")
    }

    if (!env.anthropicApiKey && !env.dryRun) {
      errors.push("ANTHROPIC_API_KEY environment variable is required")
    }

    return errors
  }

  it("requires DATABASE_URL", () => {
    const errors = checkEnv({ anthropicApiKey: "key" })
    expect(errors).toContain("DATABASE_URL environment variable is required")
  })

  it("requires ANTHROPIC_API_KEY when not in dry-run mode", () => {
    const errors = checkEnv({ databaseUrl: "postgres://..." })
    expect(errors).toContain("ANTHROPIC_API_KEY environment variable is required")
  })

  it("allows missing ANTHROPIC_API_KEY in dry-run mode", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", dryRun: true })
    expect(errors).not.toContain("ANTHROPIC_API_KEY environment variable is required")
  })

  it("passes when all required env vars are present", () => {
    const errors = checkEnv({ databaseUrl: "postgres://...", anthropicApiKey: "key" })
    expect(errors).toHaveLength(0)
  })
})

describe("backfill-cause-of-death-batch query building logic", () => {
  interface QueryOptions {
    limit?: number
  }

  function buildQuery(options: QueryOptions): { query: string; params: number[] } {
    let query = `
      SELECT id, tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_details
      FROM actors
      WHERE deathday IS NOT NULL
        AND (cause_of_death IS NULL OR cause_of_death_details IS NULL)
      ORDER BY popularity DESC NULLS LAST
    `

    const params: number[] = []
    if (options.limit) {
      params.push(options.limit)
      query += ` LIMIT $${params.length}`
    }

    return { query, params }
  }

  it("builds basic query without options", () => {
    const { query, params } = buildQuery({})
    expect(query).toContain("FROM actors")
    expect(query).toContain("WHERE deathday IS NOT NULL")
    expect(query).toContain("cause_of_death IS NULL OR cause_of_death_details IS NULL")
    expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
    expect(params).toEqual([])
  })

  it("adds LIMIT clause with parameter", () => {
    const { query, params } = buildQuery({ limit: 50 })
    expect(query).toContain("LIMIT $1")
    expect(params).toEqual([50])
  })

  it("orders by popularity descending", () => {
    const { query } = buildQuery({})
    expect(query).toContain("ORDER BY popularity DESC NULLS LAST")
  })
})

describe("backfill-cause-of-death-batch response parsing", () => {
  interface ClaudeResponse {
    cause: string | null
    details: string | null
    corrections: {
      birthYear?: number
      deathYear?: number
      deathDate?: string
    } | null
  }

  function parseResponse(responseText: string): ClaudeResponse | null {
    try {
      // Strip markdown code fences if present (Claude sometimes wraps JSON in ```json ... ```)
      let jsonText = responseText.trim()
      if (jsonText.startsWith("```")) {
        // Extract content between code fences, ignoring any text after closing fence
        const match = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (match) {
          jsonText = match[1].trim()
        } else {
          // Fallback: just strip opening fence if no closing fence found
          jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").trim()
        }
      }
      return JSON.parse(jsonText) as ClaudeResponse
    } catch {
      return null
    }
  }

  it("parses valid cause and details", () => {
    const response = parseResponse(
      JSON.stringify({
        cause: "heart failure",
        details: "Had been battling heart disease for several years.",
        corrections: null,
      })
    )
    expect(response).toEqual({
      cause: "heart failure",
      details: "Had been battling heart disease for several years.",
      corrections: null,
    })
  })

  it("parses response with date corrections", () => {
    const response = parseResponse(
      JSON.stringify({
        cause: "pancreatic cancer",
        details: null,
        corrections: {
          birthYear: 1945,
          deathYear: 2023,
          deathDate: "2023-07-14",
        },
      })
    )
    expect(response?.corrections).toEqual({
      birthYear: 1945,
      deathYear: 2023,
      deathDate: "2023-07-14",
    })
  })

  it("parses response with null values", () => {
    const response = parseResponse(
      JSON.stringify({
        cause: null,
        details: null,
        corrections: null,
      })
    )
    expect(response).toEqual({
      cause: null,
      details: null,
      corrections: null,
    })
  })

  it("returns null for invalid JSON", () => {
    expect(parseResponse("not valid json")).toBeNull()
    expect(parseResponse("")).toBeNull()
    expect(parseResponse("{cause: missing quotes}")).toBeNull()
  })

  it("strips markdown code fences from response", () => {
    const response = parseResponse(`\`\`\`json
{
  "cause": "cardiac arrest",
  "details": "Found unresponsive at home.",
  "corrections": null
}
\`\`\``)
    expect(response).toEqual({
      cause: "cardiac arrest",
      details: "Found unresponsive at home.",
      corrections: null,
    })
  })

  it("strips markdown code fences without json language tag", () => {
    const response = parseResponse(`\`\`\`
{
  "cause": "cancer",
  "details": null,
  "corrections": null
}
\`\`\``)
    expect(response).toEqual({
      cause: "cancer",
      details: null,
      corrections: null,
    })
  })

  it("handles text after closing code fence", () => {
    const response = parseResponse(`\`\`\`json
{
  "cause": null,
  "details": null,
  "corrections": null
}
\`\`\`

Note: As of my knowledge cutoff, this person was still alive.`)
    expect(response).toEqual({
      cause: null,
      details: null,
      corrections: null,
    })
  })

  it("handles opening code fence without closing fence (fallback)", () => {
    const response = parseResponse(`\`\`\`json
{"cause": "cancer", "details": null, "corrections": null}`)
    expect(response).toEqual({
      cause: "cancer",
      details: null,
      corrections: null,
    })
  })
})

describe("backfill-cause-of-death-batch update logic", () => {
  interface ActorState {
    cause_of_death: string | null
    cause_of_death_details: string | null
    birthday: string | null
    deathday: string
  }

  interface ClaudeResponse {
    cause: string | null
    details: string | null
    corrections: {
      birthYear?: number
      deathYear?: number
      deathDate?: string
    } | null
  }

  function getUpdates(actor: ActorState, response: ClaudeResponse): string[] {
    const updates: string[] = []

    // Only update cause if actor doesn't have one
    if (response.cause && !actor.cause_of_death) {
      updates.push("cause_of_death")
    }

    // Only update details if actor doesn't have them
    if (response.details && !actor.cause_of_death_details) {
      updates.push("cause_of_death_details")
    }

    // Handle corrections
    if (response.corrections) {
      if (response.corrections.birthYear) {
        // Parse year directly from YYYY-MM-DD string to avoid timezone issues
        const currentBirthYear = actor.birthday ? parseInt(actor.birthday.split("-")[0], 10) : null
        if (currentBirthYear !== response.corrections.birthYear) {
          updates.push("birthday")
        }
      }
      if (response.corrections.deathDate || response.corrections.deathYear) {
        const newDeathday = response.corrections.deathDate || actor.deathday
        if (newDeathday !== actor.deathday) {
          updates.push("deathday")
        }
      }
    }

    return updates
  }

  it("updates cause when actor has none", () => {
    const updates = getUpdates(
      {
        cause_of_death: null,
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: "heart attack", details: null, corrections: null }
    )
    expect(updates).toContain("cause_of_death")
  })

  it("does not update cause when actor already has one", () => {
    const updates = getUpdates(
      {
        cause_of_death: "cancer",
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: "heart attack", details: null, corrections: null }
    )
    expect(updates).not.toContain("cause_of_death")
  })

  it("updates details when actor has none", () => {
    const updates = getUpdates(
      {
        cause_of_death: "cancer",
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: null, details: "Battled for 2 years", corrections: null }
    )
    expect(updates).toContain("cause_of_death_details")
  })

  it("does not update details when actor already has them", () => {
    const updates = getUpdates(
      {
        cause_of_death: "cancer",
        cause_of_death_details: "Already has details",
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: null, details: "New details", corrections: null }
    )
    expect(updates).not.toContain("cause_of_death_details")
  })

  it("updates birthday when year is different", () => {
    const updates = getUpdates(
      {
        cause_of_death: null,
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: null, details: null, corrections: { birthYear: 1951 } }
    )
    expect(updates).toContain("birthday")
  })

  it("does not update birthday when year matches", () => {
    const updates = getUpdates(
      {
        cause_of_death: null,
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: null, details: null, corrections: { birthYear: 1950 } }
    )
    expect(updates).not.toContain("birthday")
  })

  it("updates deathday when date is different", () => {
    const updates = getUpdates(
      {
        cause_of_death: null,
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: null, details: null, corrections: { deathDate: "2020-07-20" } }
    )
    expect(updates).toContain("deathday")
  })

  it("handles multiple updates", () => {
    const updates = getUpdates(
      {
        cause_of_death: null,
        cause_of_death_details: null,
        birthday: "1950-01-01",
        deathday: "2020-05-15",
      },
      { cause: "heart attack", details: "Sudden", corrections: { birthYear: 1951 } }
    )
    expect(updates).toContain("cause_of_death")
    expect(updates).toContain("cause_of_death_details")
    expect(updates).toContain("birthday")
  })
})

describe("backfill-cause-of-death-batch checkpoint functionality", () => {
  let testDir: string
  let testCheckpointFile: string

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-test-"))
    testCheckpointFile = path.join(testDir, "test-checkpoint.json")
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true })
    }
  })

  describe("loadCheckpoint", () => {
    it("returns null when checkpoint file does not exist", () => {
      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toBeNull()
    })

    it("loads checkpoint from existing file", () => {
      const checkpoint: Checkpoint = {
        batchId: "msgbatch_123",
        processedActorIds: [1, 2, 3],
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T01:00:00.000Z",
        stats: {
          submitted: 10,
          succeeded: 8,
          errored: 1,
          expired: 1,
          updatedCause: 5,
          updatedDetails: 3,
          updatedBirthday: 1,
          updatedDeathday: 0,
        },
      }
      fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))

      const result = loadCheckpoint(testCheckpointFile)
      expect(result).toEqual(checkpoint)
    })

    it("throws on invalid JSON (via generic loader)", () => {
      fs.writeFileSync(testCheckpointFile, "invalid json")
      expect(() => loadCheckpointGeneric<Checkpoint>(testCheckpointFile)).toThrow(SyntaxError)
    })
  })

  describe("saveCheckpoint", () => {
    it("saves checkpoint to file", () => {
      const checkpoint: Checkpoint = {
        batchId: "msgbatch_456",
        processedActorIds: [10, 20],
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        stats: {
          submitted: 5,
          succeeded: 5,
          errored: 0,
          expired: 0,
          updatedCause: 3,
          updatedDetails: 2,
          updatedBirthday: 0,
          updatedDeathday: 0,
        },
      }

      saveCheckpoint(checkpoint, testCheckpointFile)

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.batchId).toBe("msgbatch_456")
      expect(saved.processedActorIds).toEqual([10, 20])
      expect(saved.stats.succeeded).toBe(5)
    })

    it("updates lastUpdated timestamp", () => {
      const checkpoint: Checkpoint = {
        batchId: null,
        processedActorIds: [],
        startedAt: "2024-01-01T00:00:00.000Z",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        stats: {
          submitted: 0,
          succeeded: 0,
          errored: 0,
          expired: 0,
          updatedCause: 0,
          updatedDetails: 0,
          updatedBirthday: 0,
          updatedDeathday: 0,
        },
      }

      saveCheckpoint(checkpoint, testCheckpointFile)

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(new Date(saved.lastUpdated).getTime()).toBeGreaterThan(
        new Date("2024-01-01T00:00:00.000Z").getTime()
      )
    })
  })

  describe("deleteCheckpoint", () => {
    it("deletes existing checkpoint file", () => {
      fs.writeFileSync(testCheckpointFile, "{}")
      expect(fs.existsSync(testCheckpointFile)).toBe(true)

      deleteCheckpoint(testCheckpointFile)

      expect(fs.existsSync(testCheckpointFile)).toBe(false)
    })

    it("does not throw when file does not exist", () => {
      expect(() => deleteCheckpoint(testCheckpointFile)).not.toThrow()
    })
  })
})

describe("backfill-cause-of-death-batch prompt generation", () => {
  interface ActorInfo {
    name: string
    birthday: string | null
    deathday: string
  }

  function buildPrompt(actor: ActorInfo): string {
    const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const deathYear = new Date(actor.deathday).getFullYear()
    const birthInfo = birthYear ? `born ${birthYear}, ` : ""

    return `What was the cause of death for ${actor.name} (${birthInfo}died ${deathYear})?`
  }

  it("includes actor name", () => {
    const prompt = buildPrompt({
      name: "John Smith",
      birthday: "1950-05-15",
      deathday: "2020-03-20",
    })
    expect(prompt).toContain("John Smith")
  })

  it("includes birth year when available", () => {
    const prompt = buildPrompt({
      name: "Jane Doe",
      birthday: "1945-08-22",
      deathday: "2019-11-10",
    })
    expect(prompt).toContain("born 1945")
  })

  it("omits birth year when not available", () => {
    const prompt = buildPrompt({
      name: "Unknown Actor",
      birthday: null,
      deathday: "2018-06-30",
    })
    expect(prompt).not.toContain("born")
    expect(prompt).toContain("died 2018")
  })

  it("includes death year", () => {
    const prompt = buildPrompt({
      name: "Actor Name",
      birthday: "1960-01-01",
      deathday: "2022-12-25",
    })
    expect(prompt).toContain("died 2022")
  })
})

describe("backfill-cause-of-death-batch stats tracking", () => {
  interface Stats {
    submitted: number
    succeeded: number
    errored: number
    expired: number
    updatedCause: number
    updatedDetails: number
    updatedBirthday: number
    updatedDeathday: number
  }

  function createEmptyStats(): Stats {
    return {
      submitted: 0,
      succeeded: 0,
      errored: 0,
      expired: 0,
      updatedCause: 0,
      updatedDetails: 0,
      updatedBirthday: 0,
      updatedDeathday: 0,
    }
  }

  it("initializes with zero values", () => {
    const stats = createEmptyStats()
    expect(stats.submitted).toBe(0)
    expect(stats.succeeded).toBe(0)
    expect(stats.errored).toBe(0)
    expect(stats.expired).toBe(0)
    expect(stats.updatedCause).toBe(0)
    expect(stats.updatedDetails).toBe(0)
    expect(stats.updatedBirthday).toBe(0)
    expect(stats.updatedDeathday).toBe(0)
  })

  it("tracks submitted count", () => {
    const stats = createEmptyStats()
    stats.submitted = 100
    expect(stats.submitted).toBe(100)
  })

  it("tracks result types separately", () => {
    const stats = createEmptyStats()
    stats.succeeded = 85
    stats.errored = 10
    stats.expired = 5
    expect(stats.succeeded + stats.errored + stats.expired).toBe(100)
  })

  it("tracks update types separately", () => {
    const stats = createEmptyStats()
    stats.updatedCause = 50
    stats.updatedDetails = 40
    stats.updatedBirthday = 5
    stats.updatedDeathday = 3
    expect(stats.updatedCause).toBe(50)
    expect(stats.updatedDetails).toBe(40)
    expect(stats.updatedBirthday).toBe(5)
    expect(stats.updatedDeathday).toBe(3)
  })
})

describe("date normalization helpers", () => {
  describe("normalizeDateToString", () => {
    it("returns null for null input", () => {
      expect(normalizeDateToString(null)).toBeNull()
    })

    it("returns null for undefined input", () => {
      expect(normalizeDateToString(undefined)).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(normalizeDateToString("")).toBeNull()
    })

    it("normalizes Date object to YYYY-MM-DD", () => {
      const date = new Date(Date.UTC(1945, 5, 15)) // June 15, 1945 UTC
      expect(normalizeDateToString(date)).toBe("1945-06-15")
    })

    it("returns null for invalid Date object", () => {
      const invalidDate = new Date("invalid")
      expect(normalizeDateToString(invalidDate)).toBeNull()
    })

    it("returns YYYY-MM-DD string as-is", () => {
      expect(normalizeDateToString("1945-06-15")).toBe("1945-06-15")
    })

    it("converts year-only string to YYYY-01-01", () => {
      expect(normalizeDateToString("1945")).toBe("1945-01-01")
    })

    it("parses ISO date strings with time component", () => {
      expect(normalizeDateToString("1945-06-15T00:00:00Z")).toBe("1945-06-15")
    })

    it("parses various date string formats", () => {
      // These test that new Date() parsing works
      expect(normalizeDateToString("June 15, 1945")).toBe("1945-06-15")
    })
  })

  describe("getYearFromDate", () => {
    it("returns null for null input", () => {
      expect(getYearFromDate(null)).toBeNull()
    })

    it("returns null for undefined input", () => {
      expect(getYearFromDate(undefined)).toBeNull()
    })

    it("extracts year from Date object", () => {
      const date = new Date(Date.UTC(1945, 5, 15))
      expect(getYearFromDate(date)).toBe(1945)
    })

    it("extracts year from YYYY-MM-DD string", () => {
      expect(getYearFromDate("1945-06-15")).toBe(1945)
    })

    it("extracts year from year-only string", () => {
      expect(getYearFromDate("1945")).toBe(1945)
    })

    it("extracts year from ISO date string", () => {
      expect(getYearFromDate("2023-12-25T10:30:00Z")).toBe(2023)
    })
  })

  describe("getMonthDayFromDate", () => {
    it("returns null for null input", () => {
      expect(getMonthDayFromDate(null)).toBeNull()
    })

    it("returns null for undefined input", () => {
      expect(getMonthDayFromDate(undefined)).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(getMonthDayFromDate("")).toBeNull()
    })

    it("extracts month and day from Date object", () => {
      const date = new Date(Date.UTC(1945, 5, 15)) // June 15, 1945 UTC
      expect(getMonthDayFromDate(date)).toEqual({ month: "06", day: "15" })
    })

    it("extracts month and day from YYYY-MM-DD string", () => {
      expect(getMonthDayFromDate("1945-06-15")).toEqual({ month: "06", day: "15" })
    })

    it("returns null month and day for year-only string", () => {
      expect(getMonthDayFromDate("1945")).toEqual({ month: null, day: null })
    })

    it("returns month and null day for YYYY-MM string", () => {
      expect(getMonthDayFromDate("1945-06")).toEqual({ month: "06", day: null })
    })

    it("extracts month and day from ISO date string", () => {
      expect(getMonthDayFromDate("2023-12-25T10:30:00Z")).toEqual({ month: "12", day: "25" })
    })

    it("pads single-digit months and days", () => {
      const date = new Date(Date.UTC(2000, 0, 5)) // January 5, 2000 UTC
      expect(getMonthDayFromDate(date)).toEqual({ month: "01", day: "05" })
    })
  })

  describe("normalizeDateToString with YYYY-MM format", () => {
    it("converts year-month string to YYYY-MM-01", () => {
      expect(normalizeDateToString("1945-06")).toBe("1945-06-01")
    })

    it("handles all months correctly", () => {
      expect(normalizeDateToString("2000-01")).toBe("2000-01-01")
      expect(normalizeDateToString("2000-12")).toBe("2000-12-01")
    })
  })

  describe("stripMarkdownCodeFences", () => {
    it("returns plain JSON unchanged", () => {
      const json = '{"cause": "cancer", "details": "lung cancer"}'
      expect(stripMarkdownCodeFences(json)).toBe(json)
    })

    it("strips ```json code fence", () => {
      const wrapped = '```json\n{"cause": "cancer"}\n```'
      expect(stripMarkdownCodeFences(wrapped)).toBe('{"cause": "cancer"}')
    })

    it("strips ``` code fence without language tag", () => {
      const wrapped = '```\n{"cause": "cancer"}\n```'
      expect(stripMarkdownCodeFences(wrapped)).toBe('{"cause": "cancer"}')
    })

    it("handles code fence with extra whitespace", () => {
      const wrapped = '```json\n\n{"cause": "cancer"}\n\n```'
      expect(stripMarkdownCodeFences(wrapped)).toBe('{"cause": "cancer"}')
    })

    it("handles opening fence without closing fence", () => {
      const wrapped = '```json\n{"cause": "cancer"}'
      const result = stripMarkdownCodeFences(wrapped)
      expect(result).toBe('{"cause": "cancer"}')
    })

    it("ignores text after closing fence", () => {
      const wrapped = '```json\n{"cause": "cancer"}\n```\nSome extra text'
      expect(stripMarkdownCodeFences(wrapped)).toBe('{"cause": "cancer"}')
    })

    it("trims whitespace from result", () => {
      const wrapped = '```json\n  {"cause": "cancer"}  \n```'
      expect(stripMarkdownCodeFences(wrapped)).toBe('{"cause": "cancer"}')
    })

    it("handles multiline JSON content", () => {
      const wrapped = '```json\n{\n  "cause": "cancer",\n  "details": "lung cancer"\n}\n```'
      expect(stripMarkdownCodeFences(wrapped)).toBe(
        '{\n  "cause": "cancer",\n  "details": "lung cancer"\n}'
      )
    })
  })
})
