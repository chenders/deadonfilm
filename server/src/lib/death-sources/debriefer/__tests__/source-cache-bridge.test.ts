import { describe, it, expect, vi, beforeEach } from "vitest"
import { DataSourceType } from "../../types.js"

// Mock the cache module
const mockSetCachedQuery = vi.fn().mockResolvedValue(undefined)
vi.mock("../../cache.js", () => ({
  setCachedQuery: (...args: unknown[]) => mockSetCachedQuery(...args),
}))

// Mock logger
vi.mock("../../../logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), warn: vi.fn() }) },
}))

import {
  resolveSourceType,
  cacheSourceFinding,
  cacheSourceFailure,
} from "../source-cache-bridge.js"

beforeEach(() => {
  mockSetCachedQuery.mockClear()
})

describe("resolveSourceType", () => {
  it("maps known display names to DataSourceType", () => {
    expect(resolveSourceType("Wikipedia")).toBe(DataSourceType.WIKIPEDIA)
    expect(resolveSourceType("Wikidata")).toBe(DataSourceType.WIKIDATA)
    expect(resolveSourceType("Google Search")).toBe(DataSourceType.GOOGLE_SEARCH)
    expect(resolveSourceType("The Guardian")).toBe(DataSourceType.GUARDIAN)
    expect(resolveSourceType("New York Times")).toBe(DataSourceType.NYTIMES)
    expect(resolveSourceType("Find a Grave")).toBe(DataSourceType.FINDAGRAVE)
    expect(resolveSourceType("Legacy.com")).toBe(DataSourceType.LEGACY)
  })

  it("returns null for unknown source names", () => {
    expect(resolveSourceType("Unknown Source")).toBeNull()
    expect(resolveSourceType("")).toBeNull()
    expect(resolveSourceType("google-search")).toBeNull() // type string, not display name
  })
})

describe("cacheSourceFinding", () => {
  it("writes successful finding to cache with correct fields", async () => {
    cacheSourceFinding(
      123,
      "Wikipedia",
      {
        text: "Died of natural causes",
        confidence: 0.9,
        url: "https://en.wikipedia.org/wiki/Test",
      },
      0.001
    )

    // Allow the promise to settle
    await vi.waitFor(() => expect(mockSetCachedQuery).toHaveBeenCalled())

    expect(mockSetCachedQuery).toHaveBeenCalledWith({
      sourceType: DataSourceType.WIKIPEDIA,
      actorId: 123,
      queryString: "debriefer:Wikipedia:actor:123",
      responseStatus: 200,
      responseData: {
        text: "Died of natural causes",
        confidence: 0.9,
        url: "https://en.wikipedia.org/wiki/Test",
      },
      costUsd: 0.001,
    })
  })

  it("skips unknown source names", () => {
    cacheSourceFinding(123, "Unknown Source", { text: "some text", confidence: 0.5 }, 0)

    expect(mockSetCachedQuery).not.toHaveBeenCalled()
  })

  it("does not throw when cache write fails", async () => {
    mockSetCachedQuery.mockRejectedValueOnce(new Error("DB down"))

    // Should not throw
    cacheSourceFinding(123, "Wikipedia", { text: "text", confidence: 0.5 }, 0)

    await vi.waitFor(() => expect(mockSetCachedQuery).toHaveBeenCalled())
  })
})

describe("cacheSourceFailure", () => {
  it("writes failure to cache with error message and cost", async () => {
    cacheSourceFailure(123, "The Guardian", "404 Not Found", 0.005)

    await vi.waitFor(() => expect(mockSetCachedQuery).toHaveBeenCalled())

    expect(mockSetCachedQuery).toHaveBeenCalledWith({
      sourceType: DataSourceType.GUARDIAN,
      actorId: 123,
      queryString: "debriefer:The Guardian:actor:123",
      responseStatus: 500,
      errorMessage: "404 Not Found",
      costUsd: 0.005,
    })
  })

  it("defaults costUsd to null when not provided", async () => {
    cacheSourceFailure(123, "The Guardian", "no result")

    await vi.waitFor(() => expect(mockSetCachedQuery).toHaveBeenCalled())

    expect(mockSetCachedQuery).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null }))
  })

  it("skips unknown source names", () => {
    cacheSourceFailure(123, "Unknown", "error")

    expect(mockSetCachedQuery).not.toHaveBeenCalled()
  })
})
