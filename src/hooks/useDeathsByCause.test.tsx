import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useDeathsByCause } from "./useDeathsByCause"
import * as api from "@/services/api"

// Mock the api module
vi.mock("@/services/api", () => ({
  getDeathsByCause: vi.fn(),
}))

describe("useDeathsByCause", () => {
  let queryClient: QueryClient

  const mockResponse = {
    cause: "Heart Attack",
    slug: "heart-attack",
    deaths: [
      {
        id: 1,
        name: "Actor One",
        deathday: "2020-05-15",
        causeOfDeath: "Heart Attack",
        causeOfDeathDetails: "Cardiac arrest",
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

  it("fetches deaths by cause with default params", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useDeathsByCause("heart-attack"), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
      page: 1,
      includeObscure: false,
    })
    expect(result.current.data).toEqual(mockResponse)
  })

  it("fetches with custom page param", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValueOnce({
      ...mockResponse,
      pagination: { ...mockResponse.pagination, page: 2 },
    })

    const { result } = renderHook(() => useDeathsByCause("heart-attack", { page: 2 }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
      page: 2,
      includeObscure: false,
    })
  })

  it("fetches with includeObscure param", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(
      () => useDeathsByCause("heart-attack", { includeObscure: true }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
      page: 1,
      includeObscure: true,
    })
  })

  it("handles combined params", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(
      () => useDeathsByCause("cancer", { page: 3, includeObscure: true }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getDeathsByCause).toHaveBeenCalledWith("cancer", {
      page: 3,
      includeObscure: true,
    })
  })

  it("handles API errors", async () => {
    vi.mocked(api.getDeathsByCause).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useDeathsByCause("heart-attack"), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })

  it("is disabled when causeSlug is empty", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useDeathsByCause(""), { wrapper })

    // Query should not be enabled
    expect(result.current.isFetching).toBe(false)
    expect(api.getDeathsByCause).not.toHaveBeenCalled()
  })

  it("uses correct query key for caching", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    // First call with default params
    const { result: result1 } = renderHook(() => useDeathsByCause("heart-attack"), { wrapper })
    await waitFor(() => expect(result1.current.isSuccess).toBe(true))

    // Second call with same params should use cache
    const { result: result2 } = renderHook(() => useDeathsByCause("heart-attack"), { wrapper })
    await waitFor(() => expect(result2.current.isSuccess).toBe(true))

    // Only one API call should have been made due to caching
    expect(api.getDeathsByCause).toHaveBeenCalledTimes(1)
  })

  it("refetches when params change", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    // First render with page 1
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useDeathsByCause("heart-attack", { page }),
      { wrapper, initialProps: { page: 1 } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Rerender with page 2
    rerender({ page: 2 })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should have made two calls with different pages
    expect(api.getDeathsByCause).toHaveBeenCalledTimes(2)
    expect(api.getDeathsByCause).toHaveBeenNthCalledWith(1, "heart-attack", {
      page: 1,
      includeObscure: false,
    })
    expect(api.getDeathsByCause).toHaveBeenNthCalledWith(2, "heart-attack", {
      page: 2,
      includeObscure: false,
    })
  })

  it("refetches when includeObscure changes", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    // First render with includeObscure=false
    const { result, rerender } = renderHook(
      ({ includeObscure }: { includeObscure: boolean }) =>
        useDeathsByCause("heart-attack", { includeObscure }),
      { wrapper, initialProps: { includeObscure: false } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Rerender with includeObscure=true
    rerender({ includeObscure: true })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Should have made two calls with different includeObscure values
    expect(api.getDeathsByCause).toHaveBeenCalledTimes(2)
    expect(api.getDeathsByCause).toHaveBeenNthCalledWith(1, "heart-attack", {
      page: 1,
      includeObscure: false,
    })
    expect(api.getDeathsByCause).toHaveBeenNthCalledWith(2, "heart-attack", {
      page: 1,
      includeObscure: true,
    })
  })
})
