import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as api from "@/services/api"
import {
  useCauseCategoryIndex,
  useCauseCategoryDetail,
  useSpecificCauseDetail,
} from "./useCausesOfDeath"

// Mock the API
vi.mock("@/services/api", () => ({
  getCauseCategoryIndex: vi.fn(),
  getCauseCategoryDetail: vi.fn(),
  getSpecificCauseDetail: vi.fn(),
}))

const mockCategoryIndex = {
  categories: [
    {
      slug: "cancer",
      label: "Cancer",
      count: 100,
      percentage: 25,
      avgAge: 68,
      avgYearsLost: 10,
      topCauses: [],
    },
  ],
  totalWithKnownCause: 400,
  overallAvgAge: 70,
  overallAvgYearsLost: 10,
  mostCommonCategory: "Cancer",
}

const mockCategoryDetail = {
  slug: "cancer",
  label: "Cancer",
  count: 100,
  avgAge: 68,
  avgYearsLost: 10,
  percentage: 25,
  notableActors: [],
  decadeBreakdown: [],
  specificCauses: [],
  actors: [],
  pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 100 },
}

const mockSpecificCauseDetail = {
  cause: "Lung cancer",
  slug: "lung-cancer",
  categorySlug: "cancer",
  categoryLabel: "Cancer",
  count: 50,
  avgAge: 70,
  avgYearsLost: 8,
  notableActors: [],
  decadeBreakdown: [],
  actors: [],
  pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 50 },
}

function createWrapper() {
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

describe("useCauseCategoryIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches category index successfully", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockResolvedValue(mockCategoryIndex)

    const { result } = renderHook(() => useCauseCategoryIndex(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockCategoryIndex)
    expect(api.getCauseCategoryIndex).toHaveBeenCalledTimes(1)
  })

  it("handles error state", async () => {
    vi.mocked(api.getCauseCategoryIndex).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useCauseCategoryIndex(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe("API Error")
  })
})

describe("useCauseCategoryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches category detail successfully", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    const { result } = renderHook(() => useCauseCategoryDetail("cancer"), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockCategoryDetail)
    expect(api.getCauseCategoryDetail).toHaveBeenCalledWith("cancer", {
      page: 1,
      includeObscure: false,
      specificCause: undefined,
    })
  })

  it("passes options to API call", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    const { result } = renderHook(
      () =>
        useCauseCategoryDetail("cancer", {
          page: 2,
          includeObscure: true,
          specificCause: "lung-cancer",
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(api.getCauseCategoryDetail).toHaveBeenCalledWith("cancer", {
      page: 2,
      includeObscure: true,
      specificCause: "lung-cancer",
    })
  })

  it("does not fetch when categorySlug is empty", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockResolvedValue(mockCategoryDetail)

    const { result } = renderHook(() => useCauseCategoryDetail(""), {
      wrapper: createWrapper(),
    })

    // Should not be loading because query is disabled
    expect(result.current.isLoading).toBe(false)
    expect(api.getCauseCategoryDetail).not.toHaveBeenCalled()
  })

  it("handles error state", async () => {
    vi.mocked(api.getCauseCategoryDetail).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useCauseCategoryDetail("cancer"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe("API Error")
  })
})

describe("useSpecificCauseDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches specific cause detail successfully", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    const { result } = renderHook(() => useSpecificCauseDetail("cancer", "lung-cancer"), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockSpecificCauseDetail)
    expect(api.getSpecificCauseDetail).toHaveBeenCalledWith("cancer", "lung-cancer", {
      page: 1,
      includeObscure: false,
    })
  })

  it("passes options to API call", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    const { result } = renderHook(
      () => useSpecificCauseDetail("cancer", "lung-cancer", { page: 3, includeObscure: true }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(api.getSpecificCauseDetail).toHaveBeenCalledWith("cancer", "lung-cancer", {
      page: 3,
      includeObscure: true,
    })
  })

  it("does not fetch when categorySlug is empty", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    const { result } = renderHook(() => useSpecificCauseDetail("", "lung-cancer"), {
      wrapper: createWrapper(),
    })

    // Should not be loading because query is disabled
    expect(result.current.isLoading).toBe(false)
    expect(api.getSpecificCauseDetail).not.toHaveBeenCalled()
  })

  it("does not fetch when causeSlug is empty", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockResolvedValue(mockSpecificCauseDetail)

    const { result } = renderHook(() => useSpecificCauseDetail("cancer", ""), {
      wrapper: createWrapper(),
    })

    // Should not be loading because query is disabled
    expect(result.current.isLoading).toBe(false)
    expect(api.getSpecificCauseDetail).not.toHaveBeenCalled()
  })

  it("handles error state", async () => {
    vi.mocked(api.getSpecificCauseDetail).mockRejectedValue(new Error("API Error"))

    const { result } = renderHook(() => useSpecificCauseDetail("cancer", "lung-cancer"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe("API Error")
  })
})
