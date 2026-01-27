/**
 * Tests for CostBySourceSection component
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "@/test/test-utils"
import CostBySourceSection from "./CostBySourceSection"
import * as analyticsHooks from "../../../hooks/admin/useAnalytics"

vi.mock("../../../hooks/admin/useAnalytics")

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as any

describe("CostBySourceSection", () => {
  const mockData = {
    sources: [
      {
        source: "wikidata",
        total_cost: 45.67,
        queries_count: 150,
        avg_cost_per_query: 0.3045,
        last_used: "2024-01-15T10:30:00Z",
      },
      {
        source: "wikipedia",
        total_cost: 0,
        queries_count: 200,
        avg_cost_per_query: 0,
        last_used: "2024-01-14T09:00:00Z",
      },
      {
        source: "deepseek",
        total_cost: 12.33,
        queries_count: 50,
        avg_cost_per_query: 0.2466,
        last_used: "2024-01-13T08:00:00Z",
      },
    ],
    totalCost: 58.0,
    totalQueries: 400,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderComponent(startDate?: string, endDate?: string) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <AdminTestWrapper>
          <CostBySourceSection startDate={startDate} endDate={endDate} />
        </AdminTestWrapper>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderComponent()

    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error state", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as any)

    renderComponent()

    expect(screen.getByText(/failed to load cost analytics/i)).toBeInTheDocument()
  })

  it("renders empty state when no data", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: { sources: [], totalCost: 0, totalQueries: 0 },
      isLoading: false,
      error: null,
    } as any)

    renderComponent()

    expect(screen.getByText(/no data available for the selected time period/i)).toBeInTheDocument()
  })

  it("renders data correctly", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
    } as any)

    renderComponent()

    expect(screen.getByText("Cost by Source")).toBeInTheDocument()

    // Check summary stats
    expect(screen.getByText("$58.00")).toBeInTheDocument()
    expect(screen.getByText("400")).toBeInTheDocument()

    // Check table data
    expect(screen.getByText("wikidata")).toBeInTheDocument()
    expect(screen.getByText("$45.67")).toBeInTheDocument()
    expect(screen.getByText("150")).toBeInTheDocument()

    expect(screen.getByText("wikipedia")).toBeInTheDocument()
    expect(screen.getByText("$0.00")).toBeInTheDocument()
    expect(screen.getByText("200")).toBeInTheDocument()

    expect(screen.getByText("deepseek")).toBeInTheDocument()
    expect(screen.getByText("$12.33")).toBeInTheDocument()
    expect(screen.getByText("50")).toBeInTheDocument()
  })

  it("formats dates correctly", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
    } as any)

    renderComponent()

    // Check that last_used dates are formatted
    // The exact format may vary by locale, so just check that dates appear
    expect(screen.getByText(/1\/15\/2024|15\/1\/2024|2024-01-15/)).toBeInTheDocument()
  })

  it("passes date range to hook", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
    } as any)

    renderComponent("2024-01-01", "2024-01-31")

    expect(analyticsHooks.useCostBySource).toHaveBeenCalledWith("2024-01-01", "2024-01-31")
  })

  it("calculates average cost per query correctly in summary", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
    } as any)

    renderComponent()

    // 58.0 / 400 = 0.145
    expect(screen.getByText("$0.1450")).toBeInTheDocument()
  })

  it("handles null last_used dates", () => {
    const dataWithNullDate = {
      sources: [
        {
          source: "newsapi",
          total_cost: 10.0,
          queries_count: 50,
          avg_cost_per_query: 0.2,
          last_used: null,
        },
      ],
      totalCost: 10.0,
      totalQueries: 50,
    }

    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: dataWithNullDate,
      isLoading: false,
      error: null,
    } as any)

    renderComponent()

    expect(screen.getByText("Never")).toBeInTheDocument()
  })
})
