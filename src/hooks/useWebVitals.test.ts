import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

vi.mock("web-vitals", () => ({
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}))

vi.mock("react-router-dom", () => ({
  useLocation: vi.fn(),
}))

vi.mock("../lib/newrelic-browser", () => ({
  trackPageAction: vi.fn(),
}))

import { useWebVitals, getPageType } from "./useWebVitals"
import { onCLS, onINP, onLCP, onTTFB } from "web-vitals"
import { useLocation } from "react-router-dom"
import { trackPageAction } from "../lib/newrelic-browser"
import type { Metric } from "web-vitals"
import type { Location } from "react-router-dom"

type ReportFn = (metric: Metric) => void
type MockOnMetric = ReturnType<typeof vi.fn> & { mock: { calls: [[ReportFn]] } }

const mockOnCLS = onCLS as unknown as MockOnMetric
const mockOnINP = onINP as unknown as MockOnMetric
const mockOnLCP = onLCP as unknown as MockOnMetric
const mockOnTTFB = onTTFB as unknown as MockOnMetric
const mockUseLocation = vi.mocked(useLocation)
const mockTrackPageAction = vi.mocked(trackPageAction)

function fakeLocation(pathname: string): Location {
  return { pathname, search: "", hash: "", state: null, key: "default" }
}

function createMetric(overrides: Partial<Metric> = {}) {
  return {
    name: "LCP",
    value: 2500,
    id: "v4-1234567890",
    rating: "good",
    delta: 2500,
    entries: [],
    navigationType: "navigate",
    ...overrides,
  } as unknown as Metric
}

describe("getPageType", () => {
  it("returns 'home' for /", () => {
    expect(getPageType("/")).toBe("home")
  })

  it("returns 'actor' for /actor/ paths", () => {
    expect(getPageType("/actor/john-wayne-2157")).toBe("actor")
  })

  it("returns 'movie' for /movie/ paths", () => {
    expect(getPageType("/movie/the-searchers-1956-3114")).toBe("movie")
  })

  it("returns 'show' for /show/ paths", () => {
    expect(getPageType("/show/breaking-bad-2008-1396")).toBe("show")
  })

  it("returns 'episode' for /episode/ paths", () => {
    expect(getPageType("/episode/breaking-bad-s01e01-pilot-1396")).toBe("episode")
  })

  it("returns 'admin' for /admin paths", () => {
    expect(getPageType("/admin/dashboard")).toBe("admin")
  })

  it("returns 'other' for unknown paths", () => {
    expect(getPageType("/about")).toBe("other")
    expect(getPageType("/faq")).toBe("other")
  })
})

describe("useWebVitals", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLocation.mockReturnValue(fakeLocation("/movie/test-2024-123"))
    delete (window as unknown as Record<string, unknown>).gtag
  })

  it("registers all four web-vitals callbacks on mount", () => {
    renderHook(() => useWebVitals())

    expect(mockOnCLS).toHaveBeenCalledTimes(1)
    expect(mockOnINP).toHaveBeenCalledTimes(1)
    expect(mockOnLCP).toHaveBeenCalledTimes(1)
    expect(mockOnTTFB).toHaveBeenCalledTimes(1)
  })

  it("only registers callbacks once even on re-render", () => {
    const { rerender } = renderHook(() => useWebVitals())
    rerender()

    expect(mockOnCLS).toHaveBeenCalledTimes(1)
    expect(mockOnINP).toHaveBeenCalledTimes(1)
    expect(mockOnLCP).toHaveBeenCalledTimes(1)
    expect(mockOnTTFB).toHaveBeenCalledTimes(1)
  })

  describe("GA4 reporting", () => {
    it("sends web_vitals event to GA4 when gtag is available", () => {
      const mockGtag = vi.fn()
      ;(window as unknown as Record<string, unknown>).gtag = mockGtag

      renderHook(() => useWebVitals())

      const reportCallback = mockOnLCP.mock.calls[0][0]
      const metric = createMetric({ name: "LCP", value: 2500 })
      reportCallback(metric)

      expect(mockGtag).toHaveBeenCalledWith("event", "web_vitals", {
        metric_name: "LCP",
        metric_value: 2500,
        metric_id: metric.id,
        metric_rating: "good",
        page_type: "movie",
      })
    })

    it("scales CLS value by 1000 for GA4", () => {
      const mockGtag = vi.fn()
      ;(window as unknown as Record<string, unknown>).gtag = mockGtag

      renderHook(() => useWebVitals())

      const reportCallback = mockOnCLS.mock.calls[0][0]
      const metric = createMetric({ name: "CLS", value: 0.125 })
      reportCallback(metric)

      expect(mockGtag).toHaveBeenCalledWith(
        "event",
        "web_vitals",
        expect.objectContaining({
          metric_name: "CLS",
          metric_value: 125, // 0.125 * 1000 = 125
        })
      )
    })

    it("does not call gtag when it is not available", () => {
      renderHook(() => useWebVitals())

      const reportCallback = mockOnLCP.mock.calls[0][0]
      reportCallback(createMetric())

      // No error thrown, gtag not called
      expect(window.gtag).toBeUndefined()
    })
  })

  describe("New Relic reporting", () => {
    it("sends page action to New Relic via trackPageAction", () => {
      renderHook(() => useWebVitals())

      const reportCallback = mockOnLCP.mock.calls[0][0]
      const metric = createMetric({
        name: "LCP",
        value: 2500,
        rating: "good",
      })
      reportCallback(metric)

      expect(mockTrackPageAction).toHaveBeenCalledWith("WebVital", {
        metricName: "LCP",
        metricValue: 2500,
        metricId: metric.id,
        metricRating: "good",
        pageType: "movie",
      })
    })

    it("sends raw CLS value to New Relic (not scaled)", () => {
      renderHook(() => useWebVitals())

      const reportCallback = mockOnCLS.mock.calls[0][0]
      const metric = createMetric({ name: "CLS", value: 0.125 })
      reportCallback(metric)

      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({
          metricName: "CLS",
          metricValue: 0.125, // raw value, not scaled
        })
      )
    })
  })

  describe("page type detection", () => {
    it("includes correct pageType based on current location", () => {
      mockUseLocation.mockReturnValue(fakeLocation("/actor/john-wayne-2157"))

      renderHook(() => useWebVitals())

      const reportCallback = mockOnLCP.mock.calls[0][0]
      reportCallback(createMetric())

      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({ pageType: "actor" })
      )
    })

    it("uses latest location when metric fires", () => {
      mockUseLocation.mockReturnValue(fakeLocation("/"))

      const { rerender } = renderHook(() => useWebVitals())

      // Simulate navigation
      mockUseLocation.mockReturnValue(fakeLocation("/actor/john-wayne-2157"))
      rerender()

      // Fire a metric — should use the updated location
      const reportCallback = mockOnLCP.mock.calls[0][0]
      reportCallback(createMetric())

      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({ pageType: "actor" })
      )
    })
  })

  describe("all metric types", () => {
    it("reports CLS metric to New Relic", () => {
      renderHook(() => useWebVitals())
      const cb = mockOnCLS.mock.calls[0][0]
      cb(createMetric({ name: "CLS", value: 0.1 }))
      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({ metricName: "CLS" })
      )
    })

    it("reports INP metric to New Relic", () => {
      renderHook(() => useWebVitals())
      const cb = mockOnINP.mock.calls[0][0]
      cb(createMetric({ name: "INP", value: 200 }))
      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({ metricName: "INP" })
      )
    })

    it("reports LCP metric to New Relic", () => {
      renderHook(() => useWebVitals())
      const cb = mockOnLCP.mock.calls[0][0]
      cb(createMetric({ name: "LCP", value: 2500 }))
      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({ metricName: "LCP" })
      )
    })

    it("reports TTFB metric to New Relic", () => {
      renderHook(() => useWebVitals())
      const cb = mockOnTTFB.mock.calls[0][0]
      cb(createMetric({ name: "TTFB", value: 800 }))
      expect(mockTrackPageAction).toHaveBeenCalledWith(
        "WebVital",
        expect.objectContaining({ metricName: "TTFB" })
      )
    })
  })
})
