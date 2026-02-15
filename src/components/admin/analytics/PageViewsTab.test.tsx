/**
 * Tests for PageViewsTab component.
 * Migrated from PageViewsPage.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import PageViewsTab from "./PageViewsTab"

vi.mock("../../../hooks/admin/usePageViews", () => ({
  usePageViewSummary: vi.fn(),
  usePageViewTrends: vi.fn(),
  useTopViewedPages: vi.fn(),
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
} from "../../../hooks/admin/usePageViews"

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

describe("PageViewsTab", () => {
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
          <PageViewsTab />
        </AdminTestWrapper>
      </QueryClientProvider>
    )

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

    renderTab()
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

    renderTab()
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

    renderTab()

    expect(screen.getByText("10,000")).toBeInTheDocument()
    expect(screen.getByText("5,000")).toBeInTheDocument()
    expect(screen.getByText("2,500")).toBeInTheDocument()
    expect(screen.getByText("1,500")).toBeInTheDocument()
    expect(screen.getByText("1,000")).toBeInTheDocument()
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

    renderTab()

    fireEvent.click(screen.getByText("Weekly"))
    expect(usePageViewTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "weekly"
    )

    fireEvent.click(screen.getByText("Monthly"))
    expect(usePageViewTrends).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "monthly"
    )
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

    renderTab()

    expect(screen.getByText("Top Viewed Death Pages")).toBeInTheDocument()
    expect(screen.getByText("Tom Hanks")).toBeInTheDocument()
    expect(screen.getByText("Marlon Brando")).toBeInTheDocument()
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

    renderTab()

    expect(
      screen.getByText("No view data available yet. Data is tracked as users view pages.")
    ).toBeInTheDocument()
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

    renderTab()

    expect(
      screen.getByText(/Page views are tracked in real-time and filtered to exclude bot traffic/)
    ).toBeInTheDocument()
  })
})
