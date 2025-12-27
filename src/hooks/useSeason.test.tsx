import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useSeason } from "./useSeason"
import * as api from "@/services/api"

vi.mock("@/services/api", () => ({
  getSeason: vi.fn(),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useSeason", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches season data for valid showId and seasonNumber", async () => {
    const mockData = {
      show: { id: 1400, name: "Test Show", posterPath: null, firstAirDate: "1990-01-01" },
      season: {
        seasonNumber: 1,
        name: "Season 1",
        airDate: "1990-01-01",
        posterPath: null,
        episodeCount: 10,
      },
      episodes: [],
      stats: { totalEpisodes: 10, uniqueGuestStars: 20, uniqueDeceasedGuestStars: 5 },
    }
    vi.mocked(api.getSeason).mockResolvedValue(mockData)

    const { result } = renderHook(() => useSeason(1400, 1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData)
    })

    expect(api.getSeason).toHaveBeenCalledWith(1400, 1)
  })

  it("does not fetch when showId is 0", async () => {
    renderHook(() => useSeason(0, 1), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeason).not.toHaveBeenCalled()
  })

  it("does not fetch when seasonNumber is 0", async () => {
    renderHook(() => useSeason(1400, 0), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeason).not.toHaveBeenCalled()
  })

  it("does not fetch when both are 0", async () => {
    renderHook(() => useSeason(0, 0), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeason).not.toHaveBeenCalled()
  })

  it("handles API errors", async () => {
    const error = new Error("Failed to fetch")
    vi.mocked(api.getSeason).mockRejectedValue(error)

    const { result } = renderHook(() => useSeason(1400, 1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })

  it("uses correct query key", async () => {
    const mockData = {
      show: { id: 1400, name: "Test Show", posterPath: null, firstAirDate: "1990-01-01" },
      season: {
        seasonNumber: 2,
        name: "Season 2",
        airDate: "1991-01-01",
        posterPath: null,
        episodeCount: 12,
      },
      episodes: [],
      stats: { totalEpisodes: 12, uniqueGuestStars: 25, uniqueDeceasedGuestStars: 8 },
    }
    vi.mocked(api.getSeason).mockResolvedValue(mockData)

    const { result } = renderHook(() => useSeason(1400, 2), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData)
    })

    expect(api.getSeason).toHaveBeenCalledWith(1400, 2)
  })
})
