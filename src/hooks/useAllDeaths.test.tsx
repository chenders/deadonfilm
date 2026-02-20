import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useAllDeaths } from "./useAllDeaths"
import * as api from "@/services/api"

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

  it("handles API errors", async () => {
    vi.mocked(api.getAllDeaths).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useAllDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })

  it("fetches with search param", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useAllDeaths({ search: "John" }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getAllDeaths).toHaveBeenCalledWith({
      page: 1,
      includeObscure: false,
      search: "John",
    })
  })

  it("refetches when search changes", async () => {
    vi.mocked(api.getAllDeaths).mockResolvedValue(mockResponse)

    const { result, rerender } = renderHook(
      ({ search }: { search: string | undefined }) => useAllDeaths({ search }),
      { wrapper, initialProps: { search: undefined as string | undefined } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ search: "John" })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.getAllDeaths).toHaveBeenCalledTimes(2)
    expect(api.getAllDeaths).toHaveBeenNthCalledWith(1, {
      page: 1,
      includeObscure: false,
      search: undefined,
    })
    expect(api.getAllDeaths).toHaveBeenNthCalledWith(2, {
      page: 1,
      includeObscure: false,
      search: "John",
    })
  })
})
