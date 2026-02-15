/**
 * Tests for CostAnalyticsTab component.
 * Migrated from AnalyticsPage.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import CostAnalyticsTab from "./CostAnalyticsTab"
import * as analyticsHooks from "../../../hooks/admin/useAnalytics"

vi.mock("../../../hooks/admin/useAnalytics")

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as any

describe("CostAnalyticsTab", () => {
  const mockCostBySourceData = {
    sources: [
      {
        source: "wikidata",
        total_cost: 25.5,
        queries_count: 100,
        avg_cost_per_query: 0.255,
        last_used: "2024-01-15T10:30:00Z",
      },
      {
        source: "wikipedia",
        total_cost: 0,
        queries_count: 200,
        avg_cost_per_query: 0,
        last_used: "2024-01-14T09:00:00Z",
      },
    ],
    totalCost: 25.5,
    totalQueries: 300,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: mockCostBySourceData,
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(analyticsHooks.usePageVisitStats).mockReturnValue({
      data: {
        total_visits: 1000,
        internal_referrals: 600,
        external_referrals: 250,
        direct_visits: 150,
        unique_sessions: 400,
        avg_pages_per_session: 2.5,
      },
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(analyticsHooks.useHourlyPatterns).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)
  })

  function renderTab() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <AdminTestWrapper>
          <CostAnalyticsTab />
        </AdminTestWrapper>
      </QueryClientProvider>
    )
  }

  it("renders date range picker", () => {
    renderTab()
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument()
    expect(screen.getByText("Last 7 Days")).toBeInTheDocument()
    expect(screen.getByText("Last 30 Days")).toBeInTheDocument()
  })

  it("renders cost by source section with data", () => {
    renderTab()
    expect(screen.getByText("Cost by Source")).toBeInTheDocument()
    expect(screen.getAllByText("$25.50").length).toBeGreaterThan(0)
    expect(screen.getByText("300")).toBeInTheDocument()
  })

  it("updates date range when quick filter is clicked", async () => {
    renderTab()

    const lastSevenDaysButton = screen.getByText("Last 7 Days")
    fireEvent.click(lastSevenDaysButton)

    await waitFor(() => {
      expect(analyticsHooks.useCostBySource).toHaveBeenCalled()
    })
  })

  it("updates date range when custom dates are selected", async () => {
    renderTab()

    const startDateInput = screen.getByLabelText(/start date/i) as HTMLInputElement
    const endDateInput = screen.getByLabelText(/end date/i) as HTMLInputElement

    fireEvent.change(startDateInput, { target: { value: "2024-01-01" } })
    fireEvent.change(endDateInput, { target: { value: "2024-01-31" } })

    await waitFor(() => {
      expect(startDateInput.value).toBe("2024-01-01")
      expect(endDateInput.value).toBe("2024-01-31")
    })
  })

  it("shows loading state", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderTab()
    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("shows error state", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as any)

    renderTab()
    expect(screen.getByText(/failed to load cost analytics/i)).toBeInTheDocument()
  })

  it("shows empty state when no data available", () => {
    vi.mocked(analyticsHooks.useCostBySource).mockReturnValue({
      data: { sources: [], totalCost: 0, totalQueries: 0 },
      isLoading: false,
      error: null,
    } as any)

    renderTab()
    const emptyStateMessages = screen.getAllByText(
      /no data available for the selected time period/i
    )
    expect(emptyStateMessages.length).toBeGreaterThan(0)
  })
})
