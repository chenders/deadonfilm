import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import type { AutocompleteSuggestion } from "./types.js"

// Mock fetch globally before any imports
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock logger to avoid Pino setup overhead
vi.mock("../../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock cache module — cache always misses by default, writes are no-ops
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Use fake timers so the 100ms REQUEST_DELAY_MS between queries resolves instantly
vi.useFakeTimers()
afterAll(() => vi.useRealTimers())

// Import after mocks are established
import { fetchAutocompleteSuggestions } from "./autocomplete.js"
import type { AutocompleteResult } from "./autocomplete.js"
import { getCachedQuery, setCachedQuery } from "../../death-sources/cache.js"

/**
 * Build a mock Google Autocomplete response.
 * Format: ["query", ["suggestion1", "suggestion2", ...]]
 */
function makeAutocompleteResponse(query: string, suggestions: string[]) {
  return {
    ok: true,
    json: async () => [query, suggestions] as [string, string[]],
  }
}

describe("fetchAutocompleteSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return empty suggestions for all calls
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))
  })

  /**
   * Helper that runs the function under test while automatically advancing
   * fake timers so that REQUEST_DELAY_MS sleeps resolve instantly.
   */
  async function runWithTimers(name: string): Promise<AutocompleteResult> {
    const promise = fetchAutocompleteSuggestions(name)
    await vi.runAllTimersAsync()
    return promise
  }

  it("runs exactly 57 queries per actor (26 quoted-letter + 26 quoted-space-letter + 5 keyword)", async () => {
    await runWithTimers("John Wayne")
    expect(mockFetch).toHaveBeenCalledTimes(57)
  })

  it("returns fromCache: false when queries are run", async () => {
    const result = await runWithTimers("John Wayne")
    expect(result.fromCache).toBe(false)
  })

  it("collects suggestions from all query patterns", async () => {
    // Return a unique suggestion for the first call of each pattern group
    // quoted-letter pattern (call 0 = '"John Wayne" a')
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', ["john wayne actor career"])
    )
    // All other calls return empty
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it("extracts the association term by removing the actor name prefix", async () => {
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', ["john wayne afraid of horses"])
    )
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")
    const suggestion = suggestions.find((s) => s.fullText === "john wayne afraid of horses")

    expect(suggestion).toBeDefined()
    expect(suggestion!.term).toBe("afraid of horses")
    expect(suggestion!.fullText).toBe("john wayne afraid of horses")
  })

  it("deduplicates suggestions across query patterns, keeping first occurrence", async () => {
    // First pattern (quoted-letter 'a') returns a suggestion
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', ["john wayne afraid of horses"])
    )
    // Rest of pattern 1 (calls 1-25) — empty
    for (let i = 0; i < 25; i++) {
      mockFetch.mockResolvedValueOnce(makeAutocompleteResponse("", []))
    }
    // Second pattern group (quoted-space-letter 'a', call 26) returns the same term
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse("John Wayne a", ["john wayne afraid of horses"])
    )
    // Rest empty
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")
    const matches = suggestions.filter((s) => s.term === "afraid of horses")

    expect(matches).toHaveLength(1)
    // First occurrence is from quoted-letter pattern
    expect(matches[0].queryPattern).toBe("quoted-letter")
  })

  it("tags each suggestion with the correct query pattern", async () => {
    // quoted-letter pattern: calls 0-25
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', ["john wayne asthma"])
    )
    for (let i = 0; i < 25; i++) {
      mockFetch.mockResolvedValueOnce(makeAutocompleteResponse("", []))
    }
    // quoted-space-letter pattern: calls 26-51
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse("John Wayne b", ["john wayne born where"])
    )
    for (let i = 0; i < 25; i++) {
      mockFetch.mockResolvedValueOnce(makeAutocompleteResponse("", []))
    }
    // keyword pattern: calls 52-56
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" why', ["john wayne why did he wear a wig"])
    )
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")

    const quotedLetter = suggestions.find((s) => s.term === "asthma")
    const spaceLetter = suggestions.find((s) => s.term === "born where")
    const keyword = suggestions.find((s) => s.term === "why did he wear a wig")

    expect(quotedLetter?.queryPattern).toBe("quoted-letter")
    expect(spaceLetter?.queryPattern).toBe("quoted-space-letter")
    expect(keyword?.queryPattern).toBe("keyword")
  })

  it("stores the raw query on each suggestion", async () => {
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', ["john wayne actor"])
    )
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")
    const suggestion = suggestions.find((s) => s.term === "actor")

    expect(suggestion?.rawQuery).toBe('"John Wayne" a')
  })

  it("handles fetch failures gracefully, returning empty suggestions", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))

    const { suggestions } = await runWithTimers("John Wayne")

    expect(suggestions).toEqual([])
  })

  it("handles partial fetch failures, returning suggestions from successful calls", async () => {
    // First call fails
    mockFetch.mockRejectedValueOnce(new Error("Timeout"))
    // Second call succeeds with a suggestion
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" b', ["john wayne born in iowa"])
    )
    // Rest empty
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")

    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some((s) => s.term === "born in iowa")).toBe(true)
  })

  it("handles empty autocomplete responses, returning empty suggestions", async () => {
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")

    expect(suggestions).toEqual([])
  })

  it("handles non-ok HTTP responses gracefully", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 })

    const { suggestions } = await runWithTimers("John Wayne")

    expect(suggestions).toEqual([])
  })

  it("ignores suggestions that don't start with the actor name", async () => {
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', [
        "john wayne afraid of horses",
        "some unrelated suggestion",
        "another random result",
      ])
    )
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")

    // Only the suggestion starting with "john wayne" should be included
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].term).toBe("afraid of horses")
  })

  it("ignores suggestions where the actor name is the entire suggestion", async () => {
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', [
        "john wayne", // exact name only — no term
        "john wayne actor",
      ])
    )
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].term).toBe("actor")
  })

  it("returns AutocompleteSuggestion objects with all required fields", async () => {
    mockFetch.mockResolvedValueOnce(
      makeAutocompleteResponse('"John Wayne" a', ["john wayne afraid of horses"])
    )
    mockFetch.mockResolvedValue(makeAutocompleteResponse("", []))

    const { suggestions } = await runWithTimers("John Wayne")

    expect(suggestions).toHaveLength(1)
    const s: AutocompleteSuggestion = suggestions[0]
    expect(s).toMatchObject({
      fullText: "john wayne afraid of horses",
      term: "afraid of horses",
      queryPattern: "quoted-letter",
      rawQuery: '"John Wayne" a',
    })
  })

  it("returns cached suggestions on cache hit without making fetch calls", async () => {
    const cachedSuggestions: AutocompleteSuggestion[] = [
      {
        fullText: "john wayne afraid of horses",
        term: "afraid of horses",
        queryPattern: "quoted-letter",
        rawQuery: '"John Wayne" a',
      },
    ]
    vi.mocked(getCachedQuery).mockResolvedValueOnce({
      id: 1,
      sourceType: "autocomplete-discovery" as never,
      actorId: null,
      queryString: "John Wayne",
      queryHash: "abc123",
      responseStatus: 200,
      responseRaw: cachedSuggestions,
      isCompressed: false,
      responseSizeBytes: null,
      errorMessage: null,
      queriedAt: new Date(),
      responseTimeMs: null,
      costUsd: null,
    })

    const result = await fetchAutocompleteSuggestions("John Wayne")

    expect(result.suggestions).toEqual(cachedSuggestions)
    expect(result.fromCache).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(setCachedQuery).not.toHaveBeenCalled()
  })
})
