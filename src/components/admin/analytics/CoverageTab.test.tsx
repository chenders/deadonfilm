/**
 * Tests for CoverageTab component.
 * Migrated from CoverageDashboardPage.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import CoverageTab from "./CoverageTab"

vi.mock("../../../hooks/admin/useCoverage", () => ({
  useCoverageStats: vi.fn(),
  useCoverageTrends: vi.fn(),
}))

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never

import { useCoverageStats, useCoverageTrends } from "../../../hooks/admin/useCoverage"

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

describe("CoverageTab", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  const renderTab = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AdminTestWrapper>
          <CoverageTab />
        </AdminTestWrapper>
      </QueryClientProvider>
    )

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

    renderTab()
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

    renderTab()
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

    renderTab()

    expect(screen.getByText("1,000")).toBeInTheDocument()
    expect(screen.getByText("750")).toBeInTheDocument()
    expect(screen.getByText("250")).toBeInTheDocument()
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.getByText("200")).toBeInTheDocument()
    expect(screen.getByText("50")).toBeInTheDocument()
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

    renderTab()

    fireEvent.click(screen.getByText("Weekly"))
    expect(useCoverageTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "weekly"
    )

    fireEvent.click(screen.getByText("Monthly"))
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

    renderTab()
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

    renderTab()
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

    renderTab()
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

    renderTab()
    expect(screen.getByText("Manage Actors Without Pages")).toBeInTheDocument()
    expect(screen.getByText("View All Death Pages")).toBeInTheDocument()
    expect(screen.getByText("Start Enrichment")).toBeInTheDocument()
  })

  it("renders clickable high priority count link", () => {
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

    renderTab()
    const highPriorityLink = screen.getByText("50").closest("a")
    expect(highPriorityLink).toHaveAttribute("href", "/admin/enrichment/high-priority")
  })
})
