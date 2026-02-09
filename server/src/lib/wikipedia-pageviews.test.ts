import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  extractArticleTitle,
  fetchMonthlyPageviews,
  calculateAnnualPageviews,
  fetchActorPageviews,
  type MonthlyPageview,
} from "./wikipedia-pageviews.js"

describe("extractArticleTitle", () => {
  it("extracts title from standard Wikipedia URL", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/Tom_Cruise")).toBe("Tom_Cruise")
  })

  it("extracts title from mobile Wikipedia URL", () => {
    expect(extractArticleTitle("https://en.m.wikipedia.org/wiki/Tom_Cruise")).toBe("Tom_Cruise")
  })

  it("handles URL with fragment", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/Tom_Cruise#Filmography")).toBe(
      "Tom_Cruise"
    )
  })

  it("handles URL with percent-encoded characters", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/Ren%C3%A9e_Zellweger")).toBe(
      "Renée_Zellweger"
    )
  })

  it("returns null for non-English Wikipedia URLs", () => {
    expect(extractArticleTitle("https://fr.wikipedia.org/wiki/Tom_Cruise")).toBeNull()
  })

  it("returns null for non-Wikipedia URLs", () => {
    expect(extractArticleTitle("https://example.com/wiki/Tom_Cruise")).toBeNull()
  })

  it("returns null for invalid URLs", () => {
    expect(extractArticleTitle("not-a-url")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(extractArticleTitle("")).toBeNull()
  })

  it("returns null for Wikipedia URL without /wiki/ path", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/w/index.php?title=Tom_Cruise")).toBeNull()
  })
})

describe("fetchMonthlyPageviews", () => {
  const mockFetchOriginal = global.fetch

  beforeEach(() => {
    // Mock fetch before each test — do NOT use fake timers here because the
    // rate limiter uses setTimeout, which fake timers would block.
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = mockFetchOriginal
  })

  it("returns monthly pageview data on success", async () => {
    const mockResponse = {
      items: [
        { timestamp: "2025010100", views: 50000 },
        { timestamp: "2025020100", views: 45000 },
        { timestamp: "2025030100", views: 48000 },
      ],
    }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await fetchMonthlyPageviews("Tom_Cruise")

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ timestamp: "2025010100", views: 50000 })
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Check User-Agent header is set
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(options.headers["User-Agent"]).toContain("DeadOnFilm")
  })

  it("returns empty array on 404", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    })

    const result = await fetchMonthlyPageviews("Nonexistent_Article_12345")
    expect(result).toEqual([])
  })

  it("returns empty array on server error", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    })

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await fetchMonthlyPageviews("Tom_Cruise")
    expect(result).toEqual([])
    consoleSpy.mockRestore()
  })

  it("returns empty array on network error", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"))

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await fetchMonthlyPageviews("Tom_Cruise")
    expect(result).toEqual([])
    consoleSpy.mockRestore()
  })

  it("encodes article title in URL", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    })

    await fetchMonthlyPageviews("Renée_Zellweger")

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain(encodeURIComponent("Renée_Zellweger"))
  })
})

describe("calculateAnnualPageviews", () => {
  // These tests use real timers — calculateAnnualPageviews uses new Date()
  // internally, so we use vi.useFakeTimers to control "now".

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-06-15T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 0 for empty data", () => {
    expect(calculateAnnualPageviews([])).toBe(0)
  })

  it("sums all monthly views for a full year", () => {
    const monthlyData: MonthlyPageview[] = Array.from({ length: 12 }, (_, i) => ({
      timestamp: `2025${String(i + 1).padStart(2, "0")}0100`,
      views: 10000,
    }))

    expect(calculateAnnualPageviews(monthlyData)).toBe(120000)
  })

  it("handles partial year data", () => {
    const monthlyData: MonthlyPageview[] = [
      { timestamp: "2025010100", views: 50000 },
      { timestamp: "2025020100", views: 45000 },
      { timestamp: "2025030100", views: 48000 },
    ]

    expect(calculateAnnualPageviews(monthlyData)).toBe(143000)
  })

  it("uses pre-death baseline when actor died recently", () => {
    // Actor died May 2025, we're in June 2025 (1 month ago)
    const monthlyData: MonthlyPageview[] = [
      { timestamp: "2024070100", views: 10000 },
      { timestamp: "2024080100", views: 12000 },
      { timestamp: "2024090100", views: 11000 },
      { timestamp: "2024100100", views: 10000 },
      { timestamp: "2024110100", views: 9000 },
      { timestamp: "2024120100", views: 11000 },
      { timestamp: "2025010100", views: 10000 },
      { timestamp: "2025020100", views: 10500 },
      { timestamp: "2025030100", views: 10000 },
      { timestamp: "2025040100", views: 11000 },
      // Death spike months
      { timestamp: "2025050100", views: 500000 }, // Death month
      { timestamp: "2025060100", views: 200000 }, // Spike continues
    ]

    // Pre-death months: 2024-07 through 2025-04 = 10 months
    // Pre-death average = (10000+12000+11000+10000+9000+11000+10000+10500+10000+11000) / 10 = 10450
    // Annual estimate = 10450 * 12 = 125400
    const result = calculateAnnualPageviews(monthlyData, "2025-05-15")
    expect(result).toBe(125400)
  })

  it("does not apply death spike handling for deaths > 3 months ago", () => {
    // Actor died January 2025, we're in June 2025 (5 months ago)
    const monthlyData: MonthlyPageview[] = [
      { timestamp: "2024070100", views: 10000 },
      { timestamp: "2024080100", views: 10000 },
      { timestamp: "2024090100", views: 10000 },
      { timestamp: "2024100100", views: 10000 },
      { timestamp: "2024110100", views: 10000 },
      { timestamp: "2024120100", views: 10000 },
      { timestamp: "2025010100", views: 500000 }, // Death month - spike
      { timestamp: "2025020100", views: 200000 },
      { timestamp: "2025030100", views: 50000 },
      { timestamp: "2025040100", views: 30000 },
      { timestamp: "2025050100", views: 15000 },
      { timestamp: "2025060100", views: 12000 },
    ]

    // Death was 5 months ago — no spike handling, sum all
    const total = monthlyData.reduce((sum, m) => sum + m.views, 0)
    const result = calculateAnnualPageviews(monthlyData, "2025-01-10")
    expect(result).toBe(total)
  })

  it("handles null death date", () => {
    const monthlyData: MonthlyPageview[] = [
      { timestamp: "2025010100", views: 50000 },
      { timestamp: "2025020100", views: 45000 },
    ]

    expect(calculateAnnualPageviews(monthlyData, null)).toBe(95000)
  })

  it("handles undefined death date", () => {
    const monthlyData: MonthlyPageview[] = [{ timestamp: "2025010100", views: 50000 }]

    expect(calculateAnnualPageviews(monthlyData)).toBe(50000)
  })

  it("falls through to simple sum when no pre-death data exists", () => {
    // Actor died in the first month of data — no pre-death months available
    const monthlyData: MonthlyPageview[] = [
      { timestamp: "2025050100", views: 500000 },
      { timestamp: "2025060100", views: 200000 },
    ]

    // Death is recent (May 2025, we're in June 2025) but no pre-death data
    // Falls through to simple sum
    const result = calculateAnnualPageviews(monthlyData, "2025-05-01")
    expect(result).toBe(700000)
  })
})

describe("fetchActorPageviews", () => {
  const mockFetchOriginal = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = mockFetchOriginal
  })

  it("returns annual pageviews for a valid Wikipedia URL", async () => {
    const mockResponse = {
      items: Array.from({ length: 12 }, (_, i) => ({
        timestamp: `2025${String(i + 1).padStart(2, "0")}0100`,
        views: 50000,
      })),
    }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await fetchActorPageviews("https://en.wikipedia.org/wiki/Tom_Cruise")
    expect(result).toBe(600000)
  })

  it("returns null for invalid Wikipedia URL", async () => {
    const result = await fetchActorPageviews("https://example.com/not-wikipedia")
    expect(result).toBeNull()
  })

  it("returns null when API returns no data", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    })

    const result = await fetchActorPageviews("https://en.wikipedia.org/wiki/Unknown_Person")
    expect(result).toBeNull()
  })

  it("applies death spike handling", async () => {
    // Use fake timers with shouldAdvanceTime to control "now" while still
    // allowing setTimeout (used by rate limiter) to resolve naturally.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2025-06-15T00:00:00Z"))

    const mockResponse = {
      items: [
        { timestamp: "2024070100", views: 10000 },
        { timestamp: "2024080100", views: 10000 },
        { timestamp: "2024090100", views: 10000 },
        { timestamp: "2024100100", views: 10000 },
        { timestamp: "2024110100", views: 10000 },
        { timestamp: "2024120100", views: 10000 },
        { timestamp: "2025010100", views: 10000 },
        { timestamp: "2025020100", views: 10000 },
        { timestamp: "2025030100", views: 10000 },
        { timestamp: "2025040100", views: 10000 },
        { timestamp: "2025050100", views: 500000 }, // Death spike
        { timestamp: "2025060100", views: 200000 }, // Continued spike
      ],
    }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await fetchActorPageviews(
      "https://en.wikipedia.org/wiki/Actor_Name",
      "2025-05-15"
    )

    // Pre-death baseline: 10 months × 10000 views = avg 10000, annual = 120000
    expect(result).toBe(120000)

    vi.useRealTimers()
  })
})
