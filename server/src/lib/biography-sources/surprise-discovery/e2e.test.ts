/**
 * End-to-end integration test for the surprise discovery pipeline.
 *
 * Mocks all external APIs (fetch, Anthropic SDK, DB pool, cache) and runs
 * the full pipeline through the orchestrator. Verifies that the three phases
 * work together correctly: autocomplete → boring filter → incongruity scoring
 * → Reddit research → claim verification → integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Module mocks (must be before any imports) ─────────────────────────────────

// Mock fetch globally — we'll configure responses per-test
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Single shared mockCreate used by BOTH incongruity-scorer (Haiku) and integrator (Sonnet)
const mockCreate = vi.fn()

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

const mockPoolQuery = vi.fn()
vi.mock("../../db/pool.js", () => ({
  getPool: () => ({ query: mockPoolQuery }),
}))

vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../../claude-batch/response-parser.js", () => ({
  stripMarkdownCodeFences: (text: string) =>
    text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```$/m, "")
      .trim(),
}))

// Use fake timers so the 100ms REQUEST_DELAY_MS between autocomplete queries resolves instantly
vi.useFakeTimers()

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runSurpriseDiscovery } from "./orchestrator.js"
import { DEFAULT_DISCOVERY_CONFIG } from "./types.js"

// ── Env stubs ─────────────────────────────────────────────────────────────────

// These need to be set before each test that exercises the search providers
const ENV_STUBS = {
  GOOGLE_SEARCH_API_KEY: "test-key",
  GOOGLE_SEARCH_CX: "test-cx",
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTOR = { id: 15854, name: "Helen Mirren", tmdb_id: 15854 }

const EXISTING_NARRATIVE =
  "Helen Mirren grew up in Essex. She became one of Britain's finest actresses."

const EXISTING_FACTS = [{ text: "She is a trained dancer", sourceUrl: null, sourceName: null }]

// ── Fetch mock helpers ────────────────────────────────────────────────────────

/** Return a successful autocomplete response for the given suggestions. */
function makeAutocompleteResponse(suggestions: string[]) {
  return {
    ok: true,
    json: async () => ["query", suggestions] as [string, string[]],
  }
}

/** Return a successful Google CSE response. */
function makeGoogleCseResponse(items: Array<{ title: string; link: string; snippet: string }>) {
  return {
    ok: true,
    json: async () => ({ items }),
  }
}

// ── Anthropic response helpers ────────────────────────────────────────────────

/** Build a Haiku-style response for incongruity scoring. */
function makeHaikuResponse(candidates: Array<{ term: string; score: number; reasoning: string }>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(candidates) }],
    usage: { input_tokens: 500, output_tokens: 200 },
  }
}

/** Build a Sonnet-style response for integration. */
function makeSonnetResponse(
  findings: Array<{
    term: string
    destination: "lesserKnownFacts" | "narrative" | "discarded"
    text: string
  }>,
  updatedNarrative: string | null = null
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ findings, updatedNarrative }),
      },
    ],
    usage: { input_tokens: 800, output_tokens: 300 },
  }
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Stub required env vars before each test
  vi.stubEnv("GOOGLE_SEARCH_API_KEY", ENV_STUBS.GOOGLE_SEARCH_API_KEY)
  vi.stubEnv("GOOGLE_SEARCH_CX", ENV_STUBS.GOOGLE_SEARCH_CX)

  // DB: return empty rows for all three filmography queries
  mockPoolQuery.mockResolvedValue({ rows: [] })

  // Default fetch: empty autocomplete for all queries
  mockFetch.mockResolvedValue(makeAutocompleteResponse([]))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("surprise discovery pipeline — end-to-end", () => {
  it("discovers, verifies, and integrates the Helen Mirren / Kurt Cobain / GPS fact", async () => {
    /**
     * Scenario:
     * - One autocomplete query returns "helen mirren kurt cobain" suggesting
     *   a surprising association
     * - Boring filter passes it (empty filmography from DB, no blocklist match)
     * - Haiku scores "kurt cobain" at 9/10 (above the 7 threshold)
     * - Reddit search (Google CSE) returns a TIL thread about Cobain/GPS
     * - Verification search (Google CSE) returns a Guardian article
     * - Sonnet integrator adds it to lesserKnownFacts
     */

    // Track CSE calls separately for routing Reddit vs. verification
    let cseCallCount = 0

    // Set up fetch mock: different responses per URL
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url)

      if (urlStr.includes("suggestqueries.google.com")) {
        // Return "kurt cobain" for the letter-k queries; empty for others
        // URLSearchParams uses + for spaces, so "Helen Mirren" k → %22Helen+Mirren%22+k
        // Helen Mirren k → Helen+Mirren+k
        if (urlStr.includes("+k&") || urlStr.includes("+k%") || urlStr.endsWith("+k")) {
          return Promise.resolve(
            makeAutocompleteResponse(["helen mirren kurt cobain gps connection"])
          )
        }
        return Promise.resolve(makeAutocompleteResponse([]))
      }

      if (urlStr.includes("googleapis.com/customsearch")) {
        const thisCallIndex = cseCallCount++

        if (thisCallIndex === 0) {
          // Reddit research: return a TIL thread
          return Promise.resolve(
            makeGoogleCseResponse([
              {
                title: "TIL Helen Mirren and Kurt Cobain share a GPS connection : r/todayilearned",
                link: "https://www.reddit.com/r/todayilearned/comments/abc123/helen_mirren_kurt_cobain_gps/",
                snippet:
                  "Helen Mirren's 1970s charity work helped fund early GPS satellite research alongside Nirvana's Kurt Cobain foundation.",
              },
            ])
          )
        } else {
          // Verification: return a Guardian article
          return Promise.resolve(
            makeGoogleCseResponse([
              {
                title: "Helen Mirren's surprising link to Kurt Cobain and GPS technology",
                link: "https://www.theguardian.com/culture/2024/helen-mirren-cobain-gps",
                snippet:
                  "A little-known fact: Helen Mirren's charitable foundation overlapped with Kurt Cobain's early work in GPS navigation advocacy.",
              },
            ])
          )
        }
      }

      return Promise.resolve(makeAutocompleteResponse([]))
    })

    // Haiku: score "kurt cobain" at 9/10
    // Sonnet: add it to lesserKnownFacts
    mockCreate.mockImplementation(
      (params: { model: string; messages: Array<{ content: string }> }) => {
        const prompt =
          typeof params.messages[0]?.content === "string" ? params.messages[0].content : ""

        if (params.model.includes("haiku")) {
          // Incongruity scorer — return high score for kurt cobain
          return Promise.resolve(
            makeHaikuResponse([
              {
                term: "kurt cobain gps connection",
                score: 9,
                reasoning:
                  "No obvious connection between a British actress and a grunge musician known for GPS work",
              },
            ])
          )
        }

        // Sonnet integrator
        return Promise.resolve(
          makeSonnetResponse([
            {
              term: "kurt cobain gps connection",
              destination: "lesserKnownFacts",
              text: "Her charitable foundation had an unexpected connection to Kurt Cobain's GPS navigation advocacy work in the early 1990s.",
            },
          ])
        )
      }
    )

    const promise = runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      DEFAULT_DISCOVERY_CONFIG
    )
    await vi.runAllTimersAsync()
    const result = await promise

    // Core assertions
    expect(result.hasFindings).toBe(true)
    expect(result.newLesserKnownFacts.length).toBeGreaterThan(0)

    // The fact mentions Cobain or GPS
    const fact = result.newLesserKnownFacts[0]
    expect(fact.text.toLowerCase()).toMatch(/cobain|gps/)

    // Source URL points to the Guardian
    expect(fact.sourceUrl).toContain("theguardian.com")

    // The researched entry is verified
    const researched = result.discoveryResults.researched
    expect(researched.length).toBeGreaterThan(0)
    const cobainEntry = researched.find((r) => r.term.toLowerCase().includes("kurt cobain"))
    expect(cobainEntry).toBeDefined()
    expect(cobainEntry!.verified).toBe(true)

    // Cost tracking
    expect(result.discoveryResults.costUsd).toBeGreaterThan(0)
  })

  it("drops unverifiable claims without integrating them", async () => {
    /**
     * Scenario:
     * - Autocomplete returns "some weird claim"
     * - Haiku scores it high (8/10)
     * - Reddit finds a thread (via CSE)
     * - Verification search returns ONLY unreliable domains (e.g. tmz.com, some-blog.com)
     * - Integrator is never called because no verified findings
     */

    let cseCallCount2 = 0

    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url)

      if (urlStr.includes("suggestqueries.google.com")) {
        // Return "some weird claim" for letter-s queries
        if (urlStr.includes("+s&") || urlStr.includes("+s%") || urlStr.endsWith("+s")) {
          return Promise.resolve(makeAutocompleteResponse(["helen mirren some weird claim"]))
        }
        return Promise.resolve(makeAutocompleteResponse([]))
      }

      if (urlStr.includes("googleapis.com/customsearch")) {
        const thisCallIndex = cseCallCount2++

        if (thisCallIndex === 0) {
          // Reddit research: one Reddit thread found
          return Promise.resolve(
            makeGoogleCseResponse([
              {
                title: "Helen Mirren and some weird claim : r/conspiracy",
                link: "https://www.reddit.com/r/conspiracy/comments/xyz/helen_mirren_weird/",
                snippet: "Supposedly Helen Mirren did something very weird back in the day.",
              },
            ])
          )
        } else {
          // Verification: only unreliable domains
          return Promise.resolve(
            makeGoogleCseResponse([
              {
                title: "Helen Mirren weird claim",
                link: "https://www.tmz.com/helen-mirren-weird",
                snippet: "TMZ gossip about Helen Mirren.",
              },
              {
                title: "More weirdness",
                link: "https://some-random-blog.net/helen-mirren",
                snippet: "An unverified blog post.",
              },
            ])
          )
        }
      }

      return Promise.resolve(makeAutocompleteResponse([]))
    })

    // Haiku: high score for "some weird claim"
    mockCreate.mockImplementation((params: { model: string }) => {
      if (params.model.includes("haiku")) {
        return Promise.resolve(
          makeHaikuResponse([
            {
              term: "some weird claim",
              score: 8,
              reasoning: "Unexpectedly weird connection for a classically trained actress",
            },
          ])
        )
      }
      // Sonnet should not be called — no verified findings
      return Promise.resolve(
        makeSonnetResponse([{ term: "some weird claim", destination: "discarded", text: "" }])
      )
    })

    const promise = runSurpriseDiscovery(
      ACTOR,
      EXISTING_NARRATIVE,
      EXISTING_FACTS,
      DEFAULT_DISCOVERY_CONFIG
    )
    await vi.runAllTimersAsync()
    const result = await promise

    // No findings integrated
    expect(result.hasFindings).toBe(false)
    expect(result.newLesserKnownFacts).toEqual([])

    // The researched entry exists but is not verified
    const researched = result.discoveryResults.researched
    expect(researched.length).toBeGreaterThan(0)
    const weirdEntry = researched.find((r) => r.term.includes("weird claim"))
    expect(weirdEntry).toBeDefined()
    expect(weirdEntry!.verified).toBe(false)
  })

  it("respects cost limits and stops when exceeded", async () => {
    /**
     * Scenario:
     * - Autocomplete returns multiple high-scoring candidates
     * - BUT the cost limit is set to 0.001 USD — extremely tight
     * - Haiku scoring alone consumes more than the limit
     * - So Phase 2 (Reddit research) should be skipped for all candidates
     */

    const tightConfig = {
      ...DEFAULT_DISCOVERY_CONFIG,
      maxCostPerActorUsd: 0.001, // tiny limit
      incongruityThreshold: 7,
    }

    // Set up autocomplete: return suggestions for letters 'a' and 'b'
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url)

      if (urlStr.includes("suggestqueries.google.com")) {
        // Letter 'a' queries: "Helen Mirren" a → ends with +a
        if (urlStr.endsWith("+a")) {
          return Promise.resolve(
            makeAutocompleteResponse([
              "helen mirren astronomy hobby",
              "helen mirren ancient languages",
            ])
          )
        }
        // Letter 'b' queries: "Helen Mirren" b → ends with +b
        if (urlStr.endsWith("+b")) {
          return Promise.resolve(makeAutocompleteResponse(["helen mirren boxing champion"]))
        }
        return Promise.resolve(makeAutocompleteResponse([]))
      }

      // CSE calls — should not be reached
      return Promise.resolve(makeGoogleCseResponse([]))
    })

    // Haiku returns multiple high-scoring candidates with high token usage
    // Haiku: 500 input + 200 output → cost = (500/1M)*1.0 + (200/1M)*5.0 = 0.0005 + 0.001 = 0.0015
    // This exceeds the 0.001 limit, so Phase 2 should be skipped
    mockCreate.mockResolvedValue(
      makeHaikuResponse([
        {
          term: "astronomy hobby",
          score: 8,
          reasoning: "Surprising interest for an actress",
        },
        {
          term: "ancient languages",
          score: 9,
          reasoning: "Very unexpected connection",
        },
        {
          term: "boxing champion",
          score: 9,
          reasoning: "Completely unexpected for a classically trained actress",
        },
      ])
    )

    const promise = runSurpriseDiscovery(ACTOR, EXISTING_NARRATIVE, EXISTING_FACTS, tightConfig)
    await vi.runAllTimersAsync()
    const result = await promise

    // Some candidates were found but not all were researched (cost limit hit)
    const { researched } = result.discoveryResults

    // The cost from Haiku alone should exceed the tiny limit (0.0015 > 0.001),
    // so zero Reddit research calls should have been made
    const cseCallCount = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("googleapis.com/customsearch")
    ).length
    expect(cseCallCount).toBe(0)

    // No candidates were researched
    expect(researched).toHaveLength(0)

    // Cost is recorded and close to (or slightly above) the limit
    expect(result.discoveryResults.costUsd).toBeGreaterThan(0)
  })
})
