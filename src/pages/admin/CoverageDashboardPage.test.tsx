import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import CoverageDashboardPage from "./CoverageDashboardPage"

// Mock the hooks
vi.mock("../../hooks/admin/useCoverage", () => ({
  useCoverageStats: vi.fn(),
  useCoverageTrends: vi.fn(),
}))

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never

import { useCoverageStats, useCoverageTrends } from "../../hooks/admin/useCoverage"

const mockStats = {
  total_deceased_actors: 1000,
  actors_with_death_pages: 750,
  actors_without_death_pages: 250,
  coverage_percentage: 75,
  enrichment_candidates_count: 200,
  high_priority_count: 50,
}

const mockTrends = [
  {
    captured_at: "2024-01-01T00:00:00Z",
    coverage_percentage: 70,
    actors_with_death_pages: 700,
    actors_without_death_pages: 300,
  },
  {
    captured_at: "2024-01-02T00:00:00Z",
    coverage_percentage: 75,
    actors_with_death_pages: 750,
    actors_without_death_pages: 250,
  },
]

describe("CoverageDashboardPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CoverageDashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    renderComponent()
    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error state", () => {
    const error = new Error("Failed to load coverage data")
    vi.mocked(useCoverageStats).mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()
    expect(screen.getByText("Failed to load coverage data")).toBeInTheDocument()
  })

  it("renders coverage stats successfully", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Death Detail Coverage")).toBeInTheDocument()
    expect(screen.getByText("1,000")).toBeInTheDocument() // total_deceased_actors
    expect(screen.getByText("750")).toBeInTheDocument() // actors_with_death_pages
    expect(screen.getByText("250")).toBeInTheDocument() // actors_without_death_pages
    expect(screen.getByText("75%")).toBeInTheDocument() // coverage_percentage
    expect(screen.getByText("200")).toBeInTheDocument() // enrichment_candidates_count
    expect(screen.getByText("50")).toBeInTheDocument() // high_priority_count
  })

  it("hooks are called with stable date values on initial render", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // useCoverageStats should be called once
    expect(useCoverageStats).toHaveBeenCalledTimes(1)

    // useCoverageTrends should be called once with stable date strings and initial granularity
    expect(useCoverageTrends).toHaveBeenCalledTimes(1)
    const trendsCall = vi.mocked(useCoverageTrends).mock.calls[0]
    expect(typeof trendsCall[0]).toBe("string") // startDate is ISO string
    expect(typeof trendsCall[1]).toBe("string") // endDate is ISO string
    expect(trendsCall[2]).toBe("daily") // default granularity
  })

  it("does not trigger infinite re-renders", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // After initial render, hooks should only be called once
    const statsCallCount = vi.mocked(useCoverageStats).mock.calls.length
    const trendsCallCount = vi.mocked(useCoverageTrends).mock.calls.length

    expect(statsCallCount).toBe(1)
    expect(trendsCallCount).toBe(1)

    // Verify that the date parameters remain stable (same reference/value)
    const firstTrendsCall = vi.mocked(useCoverageTrends).mock.calls[0]
    const startDate1 = firstTrendsCall[0]
    const endDate1 = firstTrendsCall[1]

    // Force a re-render by clicking a different granularity button
    const weeklyButton = screen.getByText("Weekly")
    fireEvent.click(weeklyButton)

    // useCoverageTrends will be called again due to granularity change
    // Verify the second call exists and has stable date parameters
    expect(vi.mocked(useCoverageTrends).mock.calls.length).toBeGreaterThan(1)
    const secondTrendsCall = vi.mocked(useCoverageTrends).mock.calls[1]
    const startDate2 = secondTrendsCall[0]
    const endDate2 = secondTrendsCall[1]

    expect(startDate1).toBe(startDate2) // Same ISO string value
    expect(endDate1).toBe(endDate2) // Same ISO string value
  })

  it("allows switching between granularities", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Click weekly button
    const weeklyButton = screen.getByText("Weekly")
    fireEvent.click(weeklyButton)

    // Verify useCoverageTrends was called with new granularity
    expect(useCoverageTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "weekly"
    )

    // Click monthly button
    const monthlyButton = screen.getByText("Monthly")
    fireEvent.click(monthlyButton)

    expect(useCoverageTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "monthly"
    )
  })

  it("renders trends chart when data is available", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Coverage Trends (Last 30 Days)")).toBeInTheDocument()
  })

  it("renders empty state when no trend data", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(
      screen.getByText("No trend data available yet. Data is captured daily.")
    ).toBeInTheDocument()
  })

  it("renders no data state when stats is null", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("No coverage data available")).toBeInTheDocument()
  })

  it("renders quick action links", () => {
    vi.mocked(useCoverageStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useCoverageTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Manage Actors Without Pages")).toBeInTheDocument()
    expect(screen.getByText("View All Death Pages")).toBeInTheDocument()
    expect(screen.getByText("Start Enrichment")).toBeInTheDocument()
  })
})
