import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useCovidDeaths } from "./useCovidDeaths"
import * as api from "@/services/api"

// Mock the api module
vi.mock("@/services/api", () => ({
  getCovidDeaths: vi.fn(),
}))

describe("useCovidDeaths", () => {
  let queryClient: QueryClient

  const mockResponse = {
    persons: [
      {
        id: 1,
        rank: 1,
        name: "Actor One",
        deathday: "2021-03-15",
        causeOfDeath: "COVID-19",
        causeOfDeathDetails: "Complications from COVID-19",
        profilePath: "/path.jpg",
        ageAtDeath: 72,
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

  it("fetches covid deaths with default params", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useCovidDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getCovidDeaths).toHaveBeenCalledWith({
      page: 1,
      includeObscure: false,
    })
    expect(result.current.data).toEqual(mockResponse)
  })

  it("fetches with custom page param", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValueOnce({
      ...mockResponse,
      pagination: { ...mockResponse.pagination, page: 2 },
    })

    const { result } = renderHook(() => useCovidDeaths({ page: 2 }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getCovidDeaths).toHaveBeenCalledWith({
      page: 2,
      includeObscure: false,
    })
  })

  it("fetches with includeObscure param", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useCovidDeaths({ includeObscure: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getCovidDeaths).toHaveBeenCalledWith({
      page: 1,
      includeObscure: true,
    })
  })

  it("handles combined params", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useCovidDeaths({ page: 3, includeObscure: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getCovidDeaths).toHaveBeenCalledWith({
      page: 3,
      includeObscure: true,
    })
  })

  it("handles API errors", async () => {
    vi.mocked(api.getCovidDeaths).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useCovidDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })

  it("refetches when params change", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue(mockResponse)

    // First render with page 1
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useCovidDeaths({ page }),
      { wrapper, initialProps: { page: 1 } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Rerender with page 2
    rerender({ page: 2 })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should have made two calls with different pages
    expect(api.getCovidDeaths).toHaveBeenCalledTimes(2)
    expect(api.getCovidDeaths).toHaveBeenNthCalledWith(1, {
      page: 1,
      includeObscure: false,
    })
    expect(api.getCovidDeaths).toHaveBeenNthCalledWith(2, {
      page: 2,
      includeObscure: false,
    })
  })

  it("refetches when includeObscure changes", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue(mockResponse)

    // First render with includeObscure=false
    const { result, rerender } = renderHook(
      ({ includeObscure }: { includeObscure: boolean }) => useCovidDeaths({ includeObscure }),
      { wrapper, initialProps: { includeObscure: false } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Rerender with includeObscure=true
    rerender({ includeObscure: true })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should have made two calls with different includeObscure values
    expect(api.getCovidDeaths).toHaveBeenCalledTimes(2)
    expect(api.getCovidDeaths).toHaveBeenNthCalledWith(1, {
      page: 1,
      includeObscure: false,
    })
    expect(api.getCovidDeaths).toHaveBeenNthCalledWith(2, {
      page: 1,
      includeObscure: true,
    })
  })
})
