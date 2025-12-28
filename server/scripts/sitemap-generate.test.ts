import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { computeCombinedHash, submitToGoogle, submitToBing } from "./sitemap-generate.js"

describe("computeCombinedHash", () => {
  it("produces consistent hash for same content", () => {
    const files = new Map([
      ["sitemap.xml", "<xml>content</xml>"],
      ["sitemap-movies.xml", "<xml>movies</xml>"],
    ])

    const hash1 = computeCombinedHash(files)
    const hash2 = computeCombinedHash(files)

    expect(hash1).toBe(hash2)
  })

  it("produces different hash for different content", () => {
    const files1 = new Map([["sitemap.xml", "<xml>content1</xml>"]])
    const files2 = new Map([["sitemap.xml", "<xml>content2</xml>"]])

    const hash1 = computeCombinedHash(files1)
    const hash2 = computeCombinedHash(files2)

    expect(hash1).not.toBe(hash2)
  })

  it("is order-independent (sorted by filename)", () => {
    const files1 = new Map([
      ["a.xml", "content-a"],
      ["b.xml", "content-b"],
    ])

    const files2 = new Map([
      ["b.xml", "content-b"],
      ["a.xml", "content-a"],
    ])

    const hash1 = computeCombinedHash(files1)
    const hash2 = computeCombinedHash(files2)

    expect(hash1).toBe(hash2)
  })

  it("includes filename in hash computation", () => {
    const files1 = new Map([["file1.xml", "content"]])
    const files2 = new Map([["file2.xml", "content"]])

    const hash1 = computeCombinedHash(files1)
    const hash2 = computeCombinedHash(files2)

    expect(hash1).not.toBe(hash2)
  })

  it("handles empty map", () => {
    const files = new Map<string, string>()
    const hash = computeCombinedHash(files)

    // Should produce a valid hash (SHA-256 of empty string)
    expect(hash).toHaveLength(64)
  })

  it("produces valid SHA-256 hash format", () => {
    const files = new Map([["test.xml", "test content"]])
    const hash = computeCombinedHash(files)

    // SHA-256 produces 64 hex characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe("submitToGoogle", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("makes GET request to correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    })
    global.fetch = mockFetch

    await submitToGoogle("https://example.com/sitemap.xml")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.google.com/ping?sitemap=https%3A%2F%2Fexample.com%2Fsitemap.xml"
    )
  })

  it("returns true on 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    })

    const result = await submitToGoogle("https://example.com/sitemap.xml")

    expect(result).toBe(true)
  })

  it("returns false on error response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const result = await submitToGoogle("https://example.com/sitemap.xml")

    expect(result).toBe(false)
  })

  it("returns false on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    const result = await submitToGoogle("https://example.com/sitemap.xml")

    expect(result).toBe(false)
  })
})

describe("submitToBing", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("includes key in IndexNow URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    })
    global.fetch = mockFetch

    await submitToBing("https://example.com/sitemap.xml", "test-api-key")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.indexnow.org/indexnow?url=https%3A%2F%2Fexample.com%2Fsitemap.xml&key=test-api-key"
    )
  })

  it("returns true on 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    })

    const result = await submitToBing("https://example.com/sitemap.xml", "key")

    expect(result).toBe(true)
  })

  it("treats 202 (accepted) as success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, // 202 is not considered "ok" by fetch
      status: 202,
      statusText: "Accepted",
    })

    const result = await submitToBing("https://example.com/sitemap.xml", "key")

    expect(result).toBe(true)
  })

  it("returns false on 400 error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    })

    const result = await submitToBing("https://example.com/sitemap.xml", "key")

    expect(result).toBe(false)
  })

  it("returns false on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    const result = await submitToBing("https://example.com/sitemap.xml", "key")

    expect(result).toBe(false)
  })
})
