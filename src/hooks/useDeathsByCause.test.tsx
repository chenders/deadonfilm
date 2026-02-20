import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useDeathsByCause } from "./useDeathsByCause"
import * as api from "@/services/api"

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

    expect(result.current.isFetching).toBe(false)
    expect(api.getDeathsByCause).not.toHaveBeenCalled()
  })
})
