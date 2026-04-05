import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { verifyClaim, extractDomain, isReliableDomain } from "./verifier.js"

// Mock the logger to suppress output during tests
vi.mock("../../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// ── Fixture data ──────────────────────────────────────────────────────────────

const GUARDIAN_RESULT = {
  title: "Helen Mirren's secret life as a karate student | The Guardian",
  link: "https://www.theguardian.com/film/2022/jan/01/helen-mirren-karate",
  snippet:
    "Helen Mirren trained in karate for several years before her acting career took off, earning a black belt.",
}

const VARIETY_RESULT = {
  title: "Helen Mirren on karate training | Variety",
  link: "https://variety.com/2022/film/helen-mirren-karate-training/",
  snippet: "The actress discussed her early karate training in a recent interview.",
}

const BLOG_RESULT = {
  title: "Helen Mirren karate blog post",
  link: "https://someblog.com/helen-mirren-karate",
  snippet: "A fan blog entry about Helen Mirren's karate background.",
}

const TMZ_RESULT = {
  title: "TMZ exclusive: Helen Mirren karate",
  link: "https://www.tmz.com/2022/helen-mirren-karate/",
  snippet: "TMZ reports on the actress's surprising martial arts background.",
}

// ── Helper: build a successful fetch mock ─────────────────────────────────────

function mockGoogleResponse(items: Array<{ title: string; link: string; snippet: string }>) {
  return {
    ok: true,
    json: async () => ({ items }),
  } as Response
}

function mockBraveResponse(results: Array<{ title: string; url: string; description: string }>) {
  return {
    ok: true,
    json: async () => ({ web: { results } }),
  } as Response
}

// ── Unit tests: domain utilities ──────────────────────────────────────────────

describe("extractDomain", () => {
  it("strips www. prefix from hostname", () => {
    expect(extractDomain("https://www.theguardian.com/film/article")).toBe("theguardian.com")
  })

  it("returns bare hostname when no www. present", () => {
    expect(extractDomain("https://apnews.com/article/123")).toBe("apnews.com")
  })

  it("handles subdomains other than www", () => {
    expect(extractDomain("https://edition.cnn.com/2022/story")).toBe("edition.cnn.com")
  })

  it("returns empty string for an invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("")
  })
})

describe("isReliableDomain", () => {
  it("accepts exact reliable domain", () => {
    expect(isReliableDomain("theguardian.com")).toBe(true)
  })

  it("accepts subdomain of a reliable domain", () => {
    // news.bbc.co.uk → bbc.co.uk is in RELIABLE_DOMAINS
    expect(isReliableDomain("news.bbc.co.uk")).toBe(true)
  })

  it("accepts www-stripped guardian domain via exact match", () => {
    // extractDomain already strips www., so isReliableDomain receives "theguardian.com"
    expect(isReliableDomain("theguardian.com")).toBe(true)
  })

  it("rejects unknown blog domain", () => {
    expect(isReliableDomain("someblog.com")).toBe(false)
  })

  it("rejects tmz.com (unreliable tier)", () => {
    expect(isReliableDomain("tmz.com")).toBe(false)
  })

  it("rejects edition.cnn.com (cnn.com not in reliable set)", () => {
    expect(isReliableDomain("edition.cnn.com")).toBe(false)
  })
})

// ── Integration tests: verifyClaim ────────────────────────────────────────────

describe("verifyClaim", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "test-google-key")
    vi.stubEnv("GOOGLE_SEARCH_CX", "test-cx")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "")
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("returns verified=true when first query finds a reliable source (Guardian)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockGoogleResponse([GUARDIAN_RESULT]))

    const result = await verifyClaim(
      "Helen Mirren",
      "karate black belt",
      "Helen Mirren trained in karate before acting"
    )

    expect(result.verified).toBe(true)
    expect(result.verificationSource).toBe("theguardian.com")
    expect(result.verificationUrl).toBe(GUARDIAN_RESULT.link)
    expect(result.verificationExcerpt).toBe(GUARDIAN_RESULT.snippet)
  })

  it("returns verified=false when no reliable source is found in either query", async () => {
    // Both queries return only the blog (unreliable)
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))

    const result = await verifyClaim(
      "Helen Mirren",
      "karate black belt",
      "Helen Mirren trained in karate before acting"
    )

    expect(result.verified).toBe(false)
    expect(result.verificationSource).toBeUndefined()
    expect(result.verificationUrl).toBeUndefined()
    expect(result.verificationExcerpt).toBeUndefined()
  })

  it("rejects results from unreliable domains (someblog.com)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(false)
    // Attempts should record someblog.com as not found
    const blogAttempt = result.attempts.find((a) => a.source === "someblog.com")
    expect(blogAttempt).toBeDefined()
    expect(blogAttempt?.found).toBe(false)
  })

  it("matches subdomain of reliable domain (edition.theguardian.com → theguardian.com)", async () => {
    const subdomainResult = {
      ...GUARDIAN_RESULT,
      link: "https://edition.theguardian.com/film/article",
    }
    vi.mocked(fetch).mockResolvedValueOnce(mockGoogleResponse([subdomainResult]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(true)
    // Source should be the subdomain domain as extracted
    expect(result.verificationSource).toBe("edition.theguardian.com")
    expect(result.verificationUrl).toBe(subdomainResult.link)
  })

  it("tracks all verification attempts across both queries", async () => {
    // First query: blog + tmz (both unreliable)
    // Second query: guardian (reliable)
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT, TMZ_RESULT]))
      .mockResolvedValueOnce(mockGoogleResponse([GUARDIAN_RESULT]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(true)
    // Attempts from both queries are tracked
    const sources = result.attempts.map((a) => a.source)
    expect(sources).toContain("someblog.com")
    expect(sources).toContain("tmz.com")
    expect(sources).toContain("theguardian.com")
  })

  it("stops searching after finding first reliable source (early exit)", async () => {
    // First query returns Guardian (reliable) — second query should not be called
    vi.mocked(fetch).mockResolvedValueOnce(mockGoogleResponse([GUARDIAN_RESULT]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(true)
    // Only one fetch call — stopped after first query produced a reliable result
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("tries the second query pattern when first query has no reliable result", async () => {
    // First query: only blog. Second query: variety (reliable trade press)
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))
      .mockResolvedValueOnce(mockGoogleResponse([VARIETY_RESULT]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.verificationSource).toBe("variety.com")
  })

  it("sends the correct two query patterns to the search API", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))
      .mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT]))

    await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    const calls = vi.mocked(fetch).mock.calls
    expect(calls).toHaveLength(2)

    // URLSearchParams encodes spaces as + and quotes as %22.
    // First query: both actor and term in double quotes
    const firstUrl = String(calls[0][0])
    expect(firstUrl).toContain("%22Helen+Mirren%22+%22karate+black+belt%22")

    // Second query: actor quoted, term unquoted
    const secondUrl = String(calls[1][0])
    expect(secondUrl).toContain("%22Helen+Mirren%22+karate+black+belt")
  })

  it("uses num=10 for verification searches", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockGoogleResponse([GUARDIAN_RESULT]))

    await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    const [calledUrl] = vi.mocked(fetch).mock.calls[0]
    expect(String(calledUrl)).toContain("num=10")
  })

  it("handles search API errors gracefully and returns verified=false", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" } as Response)

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(false)
    expect(result.attempts).toHaveLength(0)
  })

  it("handles fetch network errors gracefully", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(false)
    expect(result.attempts).toHaveLength(0)
  })

  it("returns verified=false with empty attempts when no search API configured", async () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "")
    vi.stubEnv("GOOGLE_SEARCH_CX", "")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "")

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(false)
    expect(result.attempts).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("falls back to Brave when Google is not configured", async () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "")
    vi.stubEnv("GOOGLE_SEARCH_CX", "")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-key")

    const braveGuardian = {
      title: GUARDIAN_RESULT.title,
      url: GUARDIAN_RESULT.link,
      description: GUARDIAN_RESULT.snippet,
    }

    vi.mocked(fetch).mockResolvedValueOnce(mockBraveResponse([braveGuardian]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    const [calledUrl] = vi.mocked(fetch).mock.calls[0]
    expect(String(calledUrl)).toContain("search.brave.com")
    expect(result.verified).toBe(true)
    expect(result.verificationSource).toBe("theguardian.com")
  })

  it("each attempt records source, url, and found flag correctly", async () => {
    // Mix of reliable and unreliable in first query
    vi.mocked(fetch).mockResolvedValueOnce(mockGoogleResponse([BLOG_RESULT, GUARDIAN_RESULT]))

    const result = await verifyClaim("Helen Mirren", "karate black belt", "some claim")

    expect(result.verified).toBe(true)

    const blogAttempt = result.attempts.find((a) => a.source === "someblog.com")
    expect(blogAttempt).toMatchObject({ source: "someblog.com", found: false })

    const guardianAttempt = result.attempts.find((a) => a.source === "theguardian.com")
    expect(guardianAttempt).toMatchObject({ source: "theguardian.com", found: true })
  })
})
