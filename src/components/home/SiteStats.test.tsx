import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TestMemoryRouter } from "@/test/test-utils"
import SiteStats from "./SiteStats"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getSiteStats: vi.fn(),
}))

const mockStats = {
  totalActors: 500000,
  totalDeceasedActors: 1500,
  totalMoviesAnalyzed: 350,
  topCauseOfDeath: "Cancer",
  topCauseOfDeathCategorySlug: "cancer",
  avgMortalityPercentage: 42.5,
  causeOfDeathPercentage: 25.8,
  actorsWithCauseKnown: 387,
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <TestMemoryRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </TestMemoryRouter>
  )
}

describe("SiteStats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing during loading", () => {
    vi.mocked(api.getSiteStats).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { container } = renderWithProviders(<SiteStats />)

    // Component returns null during loading
    expect(container.firstChild).toBeNull()
  })

  it("renders stats when data loads", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByTestId("site-stats")).toBeInTheDocument()
    })

    // Check that stats are displayed
    expect(screen.getByText("500,000")).toBeInTheDocument() // total actors
    expect(screen.getByText("1,500")).toBeInTheDocument() // deceased actors
    expect(screen.getByText("350")).toBeInTheDocument()
    expect(screen.getByText("42.5%")).toBeInTheDocument()
  })

  it("renders labels correctly", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("actors tracked")).toBeInTheDocument()
      expect(screen.getByText("known dead")).toBeInTheDocument()
      expect(screen.getByText("movies analyzed")).toBeInTheDocument()
      expect(screen.getByText("avg. mortality")).toBeInTheDocument()
      expect(screen.getByText("causes known")).toBeInTheDocument()
      expect(screen.getByText("leading cause")).toBeInTheDocument()
    })
  })

  it("displays top cause of death when available", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("Cancer")).toBeInTheDocument()
      expect(screen.getByText("leading cause")).toBeInTheDocument()
    })
  })

  it("links leading cause to the correct category page", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      ...mockStats,
      topCauseOfDeath: "Heart Attack",
      topCauseOfDeathCategorySlug: "heart-disease",
    })

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      const leadingCauseLink = screen.getByTestId("leading-cause-link")
      expect(leadingCauseLink).toHaveAttribute("href", "/causes-of-death/heart-disease")
    })
  })

  it("hides leading cause when category slug is null but cause exists", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      ...mockStats,
      topCauseOfDeath: "Unrecognized Cause",
      topCauseOfDeathCategorySlug: null,
    })

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByTestId("site-stats")).toBeInTheDocument()
    })

    // Leading cause should NOT be shown when slug is null
    expect(screen.queryByText("leading cause")).not.toBeInTheDocument()
    expect(screen.queryByText("Unrecognized Cause")).not.toBeInTheDocument()
  })

  it("renders nothing when stats are all zero", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      totalActors: 0,
      totalDeceasedActors: 0,
      totalMoviesAnalyzed: 0,
      topCauseOfDeath: null,
      topCauseOfDeathCategorySlug: null,
      avgMortalityPercentage: null,
      causeOfDeathPercentage: null,
      actorsWithCauseKnown: null,
    })

    const { container } = renderWithProviders(<SiteStats />)

    await waitFor(() => {
      // Wait for query to complete
      expect(api.getSiteStats).toHaveBeenCalled()
    })

    // Component should return null for empty data
    expect(container.querySelector("[data-testid='site-stats']")).toBeNull()
  })

  it("renders nothing on error", async () => {
    vi.mocked(api.getSiteStats).mockRejectedValue(new Error("API Error"))

    const { container } = renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(api.getSiteStats).toHaveBeenCalled()
    })

    // Component should return null on error
    expect(container.querySelector("[data-testid='site-stats']")).toBeNull()
  })

  it("hides optional stats when null", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      totalActors: 100000,
      totalDeceasedActors: 1000,
      totalMoviesAnalyzed: 200,
      topCauseOfDeath: null,
      topCauseOfDeathCategorySlug: null,
      avgMortalityPercentage: null,
      causeOfDeathPercentage: null,
      actorsWithCauseKnown: null,
    })

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByTestId("site-stats")).toBeInTheDocument()
    })

    // Required stats should be shown
    expect(screen.getByText("100,000")).toBeInTheDocument() // total actors
    expect(screen.getByText("1,000")).toBeInTheDocument() // deceased actors
    expect(screen.getByText("200")).toBeInTheDocument()

    // Optional stats should not be shown
    expect(screen.queryByText("avg. mortality")).not.toBeInTheDocument()
    expect(screen.queryByText("causes known")).not.toBeInTheDocument()
    expect(screen.queryByText("leading cause")).not.toBeInTheDocument()
  })

  it("displays cause of death percentage when available", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("25.8%")).toBeInTheDocument()
      expect(screen.getByText("causes known")).toBeInTheDocument()
    })
  })

  it("shows tooltip with actor counts on hover over causes known stat", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("causes known")).toBeInTheDocument()
    })

    // Find the causes known stat wrapper (HoverTooltip adds role="button")
    const causesKnownLabel = screen.getByText("causes known")
    // The HoverTooltip wrapper is a parent span with role="button"
    const tooltipTrigger = causesKnownLabel.closest('[role="button"]')
    expect(tooltipTrigger).toBeInTheDocument()

    fireEvent.mouseEnter(tooltipTrigger!)

    // Tooltip should show the actual counts
    await waitFor(() => {
      expect(screen.getByText("387 of 1,500 deceased actors")).toBeInTheDocument()
    })
  })

  it("shows mortality percentage when available", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      ...mockStats,
      topCauseOfDeath: null, // Only mortality, no cause
      topCauseOfDeathCategorySlug: null,
    })

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("42.5%")).toBeInTheDocument()
    })
  })
})
