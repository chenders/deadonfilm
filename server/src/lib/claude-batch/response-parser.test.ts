import { describe, it, expect } from "vitest"
import {
  stripMarkdownCodeFences,
  repairJson,
  parseClaudeResponse,
  safeParseClaudeResponse,
} from "./response-parser.js"

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

describe("repairJson", () => {
  it("returns valid JSON unchanged", () => {
    const json = '{"cause": "cancer", "tmdb_id": 12345}'
    expect(repairJson(json)).toBe(json)
  })

  it("fixes number+garbage values like 97aborr", () => {
    const broken = '{"tmdb_id": 97aborr, "name": "test"}'
    const repaired = repairJson(broken)
    expect(repaired).toBe('{"tmdb_id": null, "name": "test"}')
    expect(() => JSON.parse(repaired)).not.toThrow()
  })

  it("fixes various number+letter combinations", () => {
    expect(repairJson('{"id": 123abc}')).toBe('{"id": null}')
    expect(repairJson('{"id": 1x}')).toBe('{"id": null}')
    expect(repairJson('{"id": 99error}')).toBe('{"id": null}')
  })

  it("fixes NaN values", () => {
    const broken = '{"value": NaN}'
    expect(repairJson(broken)).toBe('{"value": null}')
  })

  it("fixes undefined values", () => {
    const broken = '{"value": undefined}'
    expect(repairJson(broken)).toBe('{"value": null}')
  })

  it("fixes Infinity values", () => {
    const broken = '{"value": Infinity}'
    expect(repairJson(broken)).toBe('{"value": null}')
  })

  it("removes trailing commas before }", () => {
    const broken = '{"cause": "cancer",}'
    const repaired = repairJson(broken)
    expect(repaired).toBe('{"cause": "cancer"}')
    expect(() => JSON.parse(repaired)).not.toThrow()
  })

  it("removes trailing commas before ]", () => {
    const broken = '{"items": ["a", "b",]}'
    const repaired = repairJson(broken)
    expect(repaired).toBe('{"items": ["a", "b"]}')
    expect(() => JSON.parse(repaired)).not.toThrow()
  })

  it("preserves true/false/null literals", () => {
    const json = '{"active": true, "deleted": false, "value": null}'
    expect(repairJson(json)).toBe(json)
  })

  it("handles the real-world Cicely Tyson case", () => {
    const broken = `{
  "last_project": {
    "title": "Cherish the Day",
    "year": 2020,
    "tmdb_id": 97aborr,
    "imdb_id": "tt10883226"
  }
}`
    const repaired = repairJson(broken)
    expect(() => JSON.parse(repaired)).not.toThrow()
    const parsed = JSON.parse(repaired)
    expect(parsed.last_project.tmdb_id).toBe(null)
    expect(parsed.last_project.year).toBe(2020)
    expect(parsed.last_project.imdb_id).toBe("tt10883226")
  })
})

describe("parseClaudeResponse", () => {
  it("parses valid Claude response", () => {
    const response = JSON.stringify({
      cause: "heart failure",
      cause_confidence: "high",
      details: "Had been battling heart disease for several years.",
      manner: "natural",
      categories: ["heart_disease"],
      corrections: null,
    })

    const parsed = parseClaudeResponse(response)
    expect(parsed.cause).toBe("heart failure")
    expect(parsed.cause_confidence).toBe("high")
    expect(parsed.details).toBe("Had been battling heart disease for several years.")
    expect(parsed.manner).toBe("natural")
    expect(parsed.categories).toEqual(["heart_disease"])
  })

  it("parses response wrapped in code fences", () => {
    const response = `\`\`\`json
{
  "cause": "cardiac arrest",
  "details": "Found unresponsive at home.",
  "manner": "natural"
}
\`\`\``
    const parsed = parseClaudeResponse(response)
    expect(parsed.cause).toBe("cardiac arrest")
    expect(parsed.manner).toBe("natural")
  })

  it("handles partial response with missing fields", () => {
    const response = JSON.stringify({
      cause: "cancer",
    })
    const parsed = parseClaudeResponse(response)
    expect(parsed.cause).toBe("cancer")
    expect(parsed.details).toBeUndefined()
    expect(parsed.manner).toBeUndefined()
  })

  it("throws on invalid JSON", () => {
    expect(() => parseClaudeResponse("not valid json")).toThrow()
  })
})

describe("safeParseClaudeResponse", () => {
  it("returns success with data for valid response", () => {
    const response = JSON.stringify({
      cause: "heart failure",
      manner: "natural",
    })

    const result = safeParseClaudeResponse(response)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cause).toBe("heart failure")
    }
  })

  it("returns failure with error for invalid response", () => {
    const result = safeParseClaudeResponse("not valid json")
    expect(result.success).toBe(false)
    if (!result.success) {
      // The exact error message depends on whether jsonrepair can repair the input
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})
