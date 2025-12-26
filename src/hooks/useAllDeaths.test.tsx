import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useAllDeaths } from "./useAllDeaths"
import * as api from "@/services/api"

// Mock the api module
vi.mock("@/services/api", () => ({
  getAllDeaths: vi.fn(),
}))

describe("useAllDeaths", () => {
  let queryClient: QueryClient

  const mockResponse = {
    deaths: [
      {
        id: 1,
        rank: 1,
        name: "Actor One",
        deathday: "2020-05-15",
        causeOfDeath: "Cancer",
        causeOfDeathDetails: "Lung cancer",
        profilePath: "/path.jpg",
        ageAtDeath: 75,
        yearsLost: 5,
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

  it("fetches all deaths with default params", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useAllDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getAllDeaths).toHaveBeenCalledWith({
      page: 1,
      includeObscure: false,
    })
    expect(result.current.data).toEqual(mockResponse)
  })

  it("fetches with custom page param", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValueOnce({
      ...mockResponse,
      pagination: { ...mockResponse.pagination, page: 2 },
    })

    const { result } = renderHook(() => useAllDeaths({ page: 2 }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getAllDeaths).toHaveBeenCalledWith({
      page: 2,
      includeObscure: false,
    })
  })

  it("fetches with includeObscure param", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useAllDeaths({ includeObscure: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getAllDeaths).toHaveBeenCalledWith({
      page: 1,
      includeObscure: true,
    })
  })

  it("handles combined params", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useAllDeaths({ page: 3, includeObscure: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getAllDeaths).toHaveBeenCalledWith({
      page: 3,
      includeObscure: true,
    })
  })

  it("handles API errors", async () => {
    vi.mocked(api.getAllDeaths).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useAllDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })

  it("uses correct query key for caching", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue(mockResponse)

    // First call with default params
    const { result: result1 } = renderHook(() => useAllDeaths(), { wrapper })
    await waitFor(() => expect(result1.current.isSuccess).toBe(true))

    // Second call with same params should use cache
    const { result: result2 } = renderHook(() => useAllDeaths(), { wrapper })
    await waitFor(() => expect(result2.current.isSuccess).toBe(true))

    // Only one API call should have been made due to caching
    expect(api.getAllDeaths).toHaveBeenCalledTimes(1)
  })

  it("refetches when params change", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue(mockResponse)

    // First render with page 1
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useAllDeaths({ page }),
      { wrapper, initialProps: { page: 1 } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Rerender with page 2
    rerender({ page: 2 })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should have made two calls with different pages
    expect(api.getAllDeaths).toHaveBeenCalledTimes(2)
    expect(api.getAllDeaths).toHaveBeenNthCalledWith(1, {
      page: 1,
      includeObscure: false,
    })
    expect(api.getAllDeaths).toHaveBeenNthCalledWith(2, {
      page: 2,
      includeObscure: false,
    })
  })

  it("refetches when includeObscure changes", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue(mockResponse)

    // First render with includeObscure=false
    const { result, rerender } = renderHook(
      ({ includeObscure }: { includeObscure: boolean }) => useAllDeaths({ includeObscure }),
      { wrapper, initialProps: { includeObscure: false } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Rerender with includeObscure=true
    rerender({ includeObscure: true })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should have made two calls with different includeObscure values
    expect(api.getAllDeaths).toHaveBeenCalledTimes(2)
    expect(api.getAllDeaths).toHaveBeenNthCalledWith(1, {
      page: 1,
      includeObscure: false,
    })
    expect(api.getAllDeaths).toHaveBeenNthCalledWith(2, {
      page: 1,
      includeObscure: true,
    })
  })
})
