import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useSeasonEpisodes } from "./useSeasonEpisodes"
import * as api from "@/services/api"

vi.mock("@/services/api", () => ({
  getSeasonEpisodes: vi.fn(),
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

describe("useSeasonEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches season episodes for valid showId and seasonNumber", async () => {
    const mockData = {
      episodes: [
        { episodeNumber: 1, seasonNumber: 1, name: "Pilot", airDate: "1990-01-01" },
        { episodeNumber: 2, seasonNumber: 1, name: "Episode 2", airDate: "1990-01-08" },
      ],
    }
    vi.mocked(api.getSeasonEpisodes).mockResolvedValue(mockData)

    const { result } = renderHook(() => useSeasonEpisodes(1400, 1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData)
    })

    expect(api.getSeasonEpisodes).toHaveBeenCalledWith(1400, 1)
  })

  it("does not fetch when showId is 0", async () => {
    renderHook(() => useSeasonEpisodes(0, 1), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeasonEpisodes).not.toHaveBeenCalled()
  })

  it("does not fetch when seasonNumber is null", async () => {
    renderHook(() => useSeasonEpisodes(1400, null), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeasonEpisodes).not.toHaveBeenCalled()
  })

  it("does not fetch when seasonNumber is 0", async () => {
    renderHook(() => useSeasonEpisodes(1400, 0), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeasonEpisodes).not.toHaveBeenCalled()
  })

  it("does not fetch when both showId and seasonNumber are invalid", async () => {
    renderHook(() => useSeasonEpisodes(0, null), {
      wrapper: createWrapper(),
    })

    // Wait a bit to make sure the query doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(api.getSeasonEpisodes).not.toHaveBeenCalled()
  })

  it("handles API errors", async () => {
    const error = new Error("Failed to fetch")
    vi.mocked(api.getSeasonEpisodes).mockRejectedValue(error)

    const { result } = renderHook(() => useSeasonEpisodes(1400, 1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })

  it("uses correct query key", async () => {
    const mockData = { episodes: [] }
    vi.mocked(api.getSeasonEpisodes).mockResolvedValue(mockData)

    const { result } = renderHook(() => useSeasonEpisodes(1400, 2), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData)
    })

    expect(api.getSeasonEpisodes).toHaveBeenCalledWith(1400, 2)
  })
})
