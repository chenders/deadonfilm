import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  useCoverageStats,
  useActorsForCoverage,
  useCoverageTrends,
  useCausesOfDeath,
  useActorPreview,
} from "./useCoverage"

// Mock fetch globally
globalThis.fetch = vi.fn()

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

describe("useCoverageStats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches coverage stats successfully", async () => {
    const mockStats = {
      total_deceased_actors: 1000,
      actors_with_death_pages: 250,
      actors_without_death_pages: 750,
      coverage_percentage: 25.0,
      enrichment_candidates_count: 500,
      high_priority_count: 100,
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response)

    const { result } = renderHook(() => useCoverageStats(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockStats)
    expect(fetch).toHaveBeenCalledWith("/admin/api/coverage/stats", { credentials: "include" })
  })

  it("handles fetch errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const { result } = renderHook(() => useCoverageStats(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })
})

describe("useActorsForCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches actors with filters", async () => {
    const mockData = {
      items: [
        {
          id: 1,
          name: "Test Actor",
          tmdb_id: 123,
          deathday: "2020-01-01",
          popularity: 50.5,
          has_detailed_death_info: false,
          enriched_at: null,
          age_at_death: 75,
          cause_of_death: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response)

    const { result } = renderHook(
      () =>
        useActorsForCoverage(1, 50, {
          hasDeathPage: false,
          minPopularity: 10,
        }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/api/coverage/actors?"),
      expect.objectContaining({ credentials: "include" })
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("hasDeathPage=false"),
      expect.any(Object)
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("minPopularity=10"),
      expect.any(Object)
    )
  })
})

describe("useCoverageTrends", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches coverage trends", async () => {
    const mockTrends = [
      {
        captured_at: "2024-01-01T00:00:00Z",
        total_deceased_actors: 1000,
        actors_with_death_pages: 250,
        actors_without_death_pages: 750,
        coverage_percentage: 25.0,
        enrichment_candidates_count: 500,
        high_priority_count: 100,
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTrends,
    } as Response)

    const startDate = "2024-01-01"
    const endDate = "2024-01-31"

    const { result } = renderHook(() => useCoverageTrends(startDate, endDate, "daily"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockTrends)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/api/coverage/trends?"),
      expect.objectContaining({ credentials: "include" })
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("granularity=daily"),
      expect.any(Object)
    )
  })
})

describe("useCausesOfDeath", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches distinct causes of death", async () => {
    const mockCauses = [
      { value: "heart attack", label: "heart attack", count: 50 },
      { value: "cancer", label: "cancer", count: 45 },
      { value: "natural causes", label: "natural causes", count: 30 },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCauses,
    } as Response)

    const { result } = renderHook(() => useCausesOfDeath(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockCauses)
    expect(fetch).toHaveBeenCalledWith("/admin/api/coverage/causes", { credentials: "include" })
  })

  it("handles fetch errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const { result } = renderHook(() => useCausesOfDeath(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })
})

describe("useActorPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches actor preview data", async () => {
    const mockPreview = {
      topMovies: [{ title: "Movie 1", releaseYear: 2020, character: "Hero", popularity: 100 }],
      topShows: [{ name: "Show 1", firstAirYear: 2015, character: "Lead", episodeCount: 50 }],
      totalMovies: 10,
      totalShows: 5,
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreview,
    } as Response)

    const { result } = renderHook(() => useActorPreview(123), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockPreview)
    expect(fetch).toHaveBeenCalledWith("/admin/api/coverage/actors/123/preview", {
      credentials: "include",
    })
  })

  it("does not fetch when actorId is null", async () => {
    const { result } = renderHook(() => useActorPreview(null), {
      wrapper: createWrapper(),
    })

    // Query should not run when actorId is null (enabled: false)
    expect(result.current.fetchStatus).toBe("idle")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("handles fetch errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const { result } = renderHook(() => useActorPreview(999), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })
})
