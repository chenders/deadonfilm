import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useUnnaturalDeaths } from "./useUnnaturalDeaths"
import * as api from "@/services/api"
import type { UnnaturalDeathsResponse } from "@/types"

vi.mock("@/services/api", () => ({
  getUnnaturalDeaths: vi.fn(),
}))

describe("useUnnaturalDeaths", () => {
  let queryClient: QueryClient

  const mockResponse: UnnaturalDeathsResponse = {
    persons: [
      {
        rank: 1,
        id: 1,
        name: "Actor One",
        deathday: "2020-05-15",
        causeOfDeath: "Suicide",
        causeOfDeathDetails: "Details here",
        profilePath: "/path.jpg",
        ageAtDeath: 60,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 1,
      totalPages: 1,
    },
    categories: [
      { id: "suicide", label: "Suicide", count: 10 },
      { id: "accident", label: "Accident", count: 25 },
    ],
    selectedCategory: "all",
    showSelfInflicted: false,
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

  it("fetches unnatural deaths with default params", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useUnnaturalDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
      page: 1,
      category: "all",
      showSelfInflicted: false,
      includeObscure: false,
    })
    expect(result.current.data).toEqual(mockResponse)
  })

  it("handles API errors", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useUnnaturalDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })

  it("fetches with category filter", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValueOnce({
      ...mockResponse,
      selectedCategory: "accident",
    })

    const { result } = renderHook(() => useUnnaturalDeaths({ category: "accident" }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
      page: 1,
      category: "accident",
      showSelfInflicted: false,
      includeObscure: false,
    })
  })

  it("fetches with showSelfInflicted filter", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValueOnce({
      ...mockResponse,
      showSelfInflicted: true,
    })

    const { result } = renderHook(() => useUnnaturalDeaths({ showSelfInflicted: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
      page: 1,
      category: "all",
      showSelfInflicted: true,
      includeObscure: false,
    })
  })

  it("handles combined params", async () => {
    vi.mocked(api.getUnnaturalDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(
      () =>
        useUnnaturalDeaths({
          page: 3,
          category: "overdose",
          showSelfInflicted: true,
          includeObscure: true,
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getUnnaturalDeaths).toHaveBeenCalledWith({
      page: 3,
      category: "overdose",
      showSelfInflicted: true,
      includeObscure: true,
    })
  })
})
