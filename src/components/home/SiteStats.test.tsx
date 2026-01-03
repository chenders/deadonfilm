import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import SiteStats from "./SiteStats"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getSiteStats: vi.fn(),
}))

const mockStats = {
  totalDeceasedActors: 1500,
  totalMoviesAnalyzed: 350,
  topCauseOfDeath: "Cancer",
  avgMortalityPercentage: 42.5,
  causeOfDeathPercentage: 25.8,
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
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
    expect(screen.getByText("1,500")).toBeInTheDocument() // formatted with locale
    expect(screen.getByText("350")).toBeInTheDocument()
    expect(screen.getByText("42.5%")).toBeInTheDocument()
  })

  it("renders labels correctly", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue(mockStats)

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("actors tracked")).toBeInTheDocument()
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

  it("renders nothing when stats are all zero", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      totalDeceasedActors: 0,
      totalMoviesAnalyzed: 0,
      topCauseOfDeath: null,
      avgMortalityPercentage: null,
      causeOfDeathPercentage: null,
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
      totalDeceasedActors: 1000,
      totalMoviesAnalyzed: 200,
      topCauseOfDeath: null,
      avgMortalityPercentage: null,
      causeOfDeathPercentage: null,
    })

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByTestId("site-stats")).toBeInTheDocument()
    })

    // Required stats should be shown
    expect(screen.getByText("1,000")).toBeInTheDocument()
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

  it("shows mortality percentage when available", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      ...mockStats,
      topCauseOfDeath: null, // Only mortality, no cause
    })

    renderWithProviders(<SiteStats />)

    await waitFor(() => {
      expect(screen.getByText("42.5%")).toBeInTheDocument()
    })
  })
})
