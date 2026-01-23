import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePageViewSummary, useTopViewedPages, usePageViewTrends } from "./usePageViews"

// Mock fetch globally
global.fetch = vi.fn()

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe("usePageViewSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches page view summary successfully", async () => {
    const mockSummary = {
      total_views: 5000,
      death_page_views: 1200,
      movie_views: 2000,
      show_views: 1500,
      episode_views: 300,
      unique_entities_viewed: 850,
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSummary,
    } as Response)

    const startDate = "2024-01-01"
    const endDate = "2024-01-31"

    const { result } = renderHook(() => usePageViewSummary(startDate, endDate, "all"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockSummary)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/api/page-views/summary?"),
      expect.objectContaining({ credentials: "include" })
    )
  })

  it("handles fetch errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const { result } = renderHook(() => usePageViewSummary("2024-01-01", "2024-01-31"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })
})

describe("useTopViewedPages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches top viewed pages", async () => {
    const mockPages = [
      {
        page_type: "actor_death" as const,
        entity_id: 1,
        view_count: 500,
        last_viewed_at: "2024-01-31T12:00:00Z",
        entity_name: "Test Actor",
        entity_tmdb_id: 123,
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPages,
    } as Response)

    const { result } = renderHook(
      () => useTopViewedPages("actor_death", "2024-01-01", "2024-01-31", 20),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockPages)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/api/page-views/top-viewed?"),
      expect.objectContaining({ credentials: "include" })
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("pageType=actor_death"),
      expect.any(Object)
    )
  })
})

describe("usePageViewTrends", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches page view trends", async () => {
    const mockTrends = [
      {
        date: "2024-01-01",
        total_views: 100,
        movie_views: 40,
        show_views: 30,
        episode_views: 10,
        actor_death_views: 20,
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTrends,
    } as Response)

    const { result } = renderHook(
      () => usePageViewTrends("2024-01-01", "2024-01-31", "daily"),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockTrends)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/api/page-views/trends?"),
      expect.objectContaining({ credentials: "include" })
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("granularity=daily"),
      expect.any(Object)
    )
  })
})
