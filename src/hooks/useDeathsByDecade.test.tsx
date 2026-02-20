import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useDeathsByDecade, useDecadeCategories } from "./useDeathsByDecade"
import * as api from "@/services/api"

vi.mock("@/services/api", () => ({
  getDeathsByDecade: vi.fn(),
  getDecadeCategories: vi.fn(),
}))

describe("useDeathsByDecade", () => {
  let queryClient: QueryClient

  const mockResponse = {
    decade: 1990,
    decadeLabel: "1990s",
    deaths: [
      {
        id: 1,
        name: "Actor One",
        deathday: "1995-05-15",
        causeOfDeath: "Cancer",
        profilePath: "/path.jpg",
        ageAtDeath: 60,
        yearsLost: 10,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 1,
      totalPages: 1,
    },
  }

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it("fetches deaths by decade with default params", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useDeathsByDecade("1990s"), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getDeathsByDecade).toHaveBeenCalledWith("1990s", {
      page: 1,
      includeObscure: false,
    })
    expect(result.current.data).toEqual(mockResponse)
  })

  it("handles API errors", async () => {
    vi.mocked(api.getDeathsByDecade).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useDeathsByDecade("1990s"), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })

  it("is disabled when decade is empty", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useDeathsByDecade(""), { wrapper })

    expect(result.current.isFetching).toBe(false)
    expect(api.getDeathsByDecade).not.toHaveBeenCalled()
  })
})

describe("useDecadeCategories", () => {
  let queryClient: QueryClient

  const mockCategories = {
    decades: [
      {
        decade: 1980,
        count: 50,
        featuredActor: {
          id: 1,
          tmdbId: 123,
          name: "John Doe",
          profilePath: "/test.jpg",
          causeOfDeath: "Natural causes",
        },
        topCauses: [
          { cause: "Natural causes", count: 20, slug: "natural-causes" },
          { cause: "Heart attack", count: 15, slug: "heart-attack" },
        ],
        topMovie: {
          tmdbId: 100,
          title: "The Shining",
          releaseYear: 1980,
          backdropPath: "/shining.jpg",
        },
      },
      {
        decade: 1990,
        count: 100,
        featuredActor: {
          id: 2,
          tmdbId: 456,
          name: "Jane Doe",
          profilePath: "/test2.jpg",
          causeOfDeath: "Cancer",
        },
        topCauses: [
          { cause: "Cancer", count: 40, slug: "cancer" },
          { cause: "Heart attack", count: 30, slug: "heart-attack" },
        ],
        topMovie: {
          tmdbId: 200,
          title: "Titanic",
          releaseYear: 1997,
          backdropPath: "/titanic.jpg",
        },
      },
      {
        decade: 2000,
        count: 150,
        featuredActor: null,
        topCauses: [],
        topMovie: null,
      },
    ],
  }

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it("fetches decade categories", async () => {
    vi.mocked(api.getDecadeCategories).mockResolvedValueOnce(mockCategories)

    const { result } = renderHook(() => useDecadeCategories(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getDecadeCategories).toHaveBeenCalled()
    expect(result.current.data).toEqual(mockCategories)
  })

  it("handles API errors", async () => {
    vi.mocked(api.getDecadeCategories).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useDecadeCategories(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })
})
