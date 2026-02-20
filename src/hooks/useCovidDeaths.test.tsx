import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useCovidDeaths } from "./useCovidDeaths"
import * as api from "@/services/api"

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

  it("handles API errors", async () => {
    vi.mocked(api.getCovidDeaths).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useCovidDeaths(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("API Error")
  })
})
