import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminThemeProvider } from "../../contexts/AdminThemeContext"
import PageViewsPage from "./PageViewsPage"

// Mock the hooks
vi.mock("../../hooks/admin/usePageViews", () => ({
  usePageViewSummary: vi.fn(),
  usePageViewTrends: vi.fn(),
  useTopViewedPages: vi.fn(),
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

import {
  usePageViewSummary,
  usePageViewTrends,
  useTopViewedPages,
} from "../../hooks/admin/usePageViews"

const mockSummary = {
  total_views: 10000,
  death_page_views: 5000,
  movie_views: 2500,
  show_views: 1500,
  episode_views: 1000,
}

const mockTrends = [
  {
    date: "2024-01-01",
    actor_death_views: 100,
    movie_views: 50,
    show_views: 30,
    episode_views: 20,
  },
  {
    date: "2024-01-02",
    actor_death_views: 150,
    movie_views: 60,
    show_views: 40,
    episode_views: 25,
  },
]

const mockTopViewed = [
  {
    entity_id: 2157,
    entity_name: "Tom Hanks",
    view_count: 500,
    last_viewed_at: "2024-01-02T12:00:00Z",
  },
  {
    entity_id: 3084,
    entity_name: "Marlon Brando",
    view_count: 450,
    last_viewed_at: "2024-01-02T11:00:00Z",
  },
]

describe("PageViewsPage", () => {
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
          <AdminThemeProvider>
            <PageViewsPage />
          </AdminThemeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    renderComponent()
    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error state", () => {
    const error = new Error("Failed to load page view data")
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()
    expect(screen.getByText("Failed to load page view data")).toBeInTheDocument()
  })

  it("renders page view analytics successfully", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Page View Analytics")).toBeInTheDocument()
    expect(screen.getByText("10,000")).toBeInTheDocument() // total_views
    expect(screen.getByText("5,000")).toBeInTheDocument() // death_page_views
    expect(screen.getByText("2,500")).toBeInTheDocument() // movie_views
    expect(screen.getByText("1,500")).toBeInTheDocument() // show_views
    expect(screen.getByText("1,000")).toBeInTheDocument() // episode_views
  })

  it("hooks are called with stable date values on initial render", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // usePageViewSummary should be called once with stable dates
    expect(usePageViewSummary).toHaveBeenCalledTimes(1)
    const summaryCall = vi.mocked(usePageViewSummary).mock.calls[0]
    expect(typeof summaryCall[0]).toBe("string") // startDate
    expect(typeof summaryCall[1]).toBe("string") // endDate
    expect(summaryCall[2]).toBe("all") // pageTypeFilter

    // usePageViewTrends should be called once with stable dates
    expect(usePageViewTrends).toHaveBeenCalledTimes(1)
    const trendsCall = vi.mocked(usePageViewTrends).mock.calls[0]
    expect(typeof trendsCall[0]).toBe("string") // startDate
    expect(typeof trendsCall[1]).toBe("string") // endDate
    expect(trendsCall[2]).toBe("daily") // default granularity

    // useTopViewedPages should be called once with stable dates
    expect(useTopViewedPages).toHaveBeenCalledTimes(1)
    const topViewedCall = vi.mocked(useTopViewedPages).mock.calls[0]
    expect(topViewedCall[0]).toBe("actor_death") // page_type
    expect(typeof topViewedCall[1]).toBe("string") // startDate
    expect(typeof topViewedCall[2]).toBe("string") // endDate
    expect(topViewedCall[3]).toBe(20) // limit
  })

  it("does not trigger infinite re-renders", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // After initial render, hooks should only be called once
    const summaryCallCount = vi.mocked(usePageViewSummary).mock.calls.length
    const trendsCallCount = vi.mocked(usePageViewTrends).mock.calls.length
    const topViewedCallCount = vi.mocked(useTopViewedPages).mock.calls.length

    expect(summaryCallCount).toBe(1)
    expect(trendsCallCount).toBe(1)
    expect(topViewedCallCount).toBe(1)

    // Verify that the date parameters remain stable
    const firstTrendsCall = vi.mocked(usePageViewTrends).mock.calls[0]
    const startDate1 = firstTrendsCall[0]
    const endDate1 = firstTrendsCall[1]

    // Force a re-render by clicking a different granularity button
    const weeklyButton = screen.getByText("Weekly")
    fireEvent.click(weeklyButton)

    // usePageViewTrends will be called again due to granularity change
    // Verify the second call exists and has stable date parameters
    expect(vi.mocked(usePageViewTrends).mock.calls.length).toBeGreaterThan(1)
    const secondTrendsCall = vi.mocked(usePageViewTrends).mock.calls[1]
    const startDate2 = secondTrendsCall[0]
    const endDate2 = secondTrendsCall[1]

    expect(startDate1).toBe(startDate2) // Same ISO string value
    expect(endDate1).toBe(endDate2) // Same ISO string value
  })

  it("allows switching between granularities", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Click weekly button
    const weeklyButton = screen.getByText("Weekly")
    fireEvent.click(weeklyButton)

    // Verify usePageViewTrends was called with new granularity
    expect(usePageViewTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "weekly"
    )

    // Click monthly button
    const monthlyButton = screen.getByText("Monthly")
    fireEvent.click(monthlyButton)

    expect(usePageViewTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "monthly"
    )
  })

  it("renders trends chart when data is available", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Views Over Time")).toBeInTheDocument()
  })

  it("renders empty state when no trend data", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(
      screen.getByText("No view data available yet. Data is tracked as users view pages.")
    ).toBeInTheDocument()
  })

  it("renders top viewed death pages table", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Top Viewed Death Pages")).toBeInTheDocument()
    expect(screen.getByText("Tom Hanks")).toBeInTheDocument()
    expect(screen.getByText("Marlon Brando")).toBeInTheDocument()
    expect(screen.getByText("500")).toBeInTheDocument()
    expect(screen.getByText("450")).toBeInTheDocument()
  })

  it("renders empty state when no top viewed pages", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("No death page views recorded yet.")).toBeInTheDocument()
  })

  it("renders info note about page view tracking", () => {
    vi.mocked(usePageViewSummary).mockReturnValue({
      data: mockSummary,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(usePageViewTrends).mockReturnValue({
      data: mockTrends,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useTopViewedPages).mockReturnValue({
      data: mockTopViewed,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(
      screen.getByText(/Page views are tracked in real-time and filtered to exclude bot traffic/)
    ).toBeInTheDocument()
  })
})
