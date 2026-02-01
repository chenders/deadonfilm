/**
 * Tests for PopularityPage
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import PopularityPage from "./PopularityPage"

// Mock the hooks
vi.mock("../../hooks/admin/usePopularity", () => ({
  usePopularityStats: vi.fn(),
  useTopActors: vi.fn(),
  useLowConfidenceActors: vi.fn(),
  useMissingPopularityActors: vi.fn(),
  usePopularityLastRun: vi.fn(),
}))

// Mock useAdminAuth
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}))

import {
  usePopularityStats,
  useTopActors,
  useLowConfidenceActors,
  useMissingPopularityActors,
  usePopularityLastRun,
} from "../../hooks/admin/usePopularity"

const mockStats = {
  actors: {
    total: 100000,
    withScore: 85000,
    avgScore: 12.5,
    avgConfidence: 0.75,
    highConfidence: 70000,
    lowConfidence: 15000,
  },
  movies: {
    total: 50000,
    withScore: 48000,
    avgScore: 15.2,
    avgWeight: 14.8,
  },
  shows: {
    total: 10000,
    withScore: 9500,
    avgScore: 18.3,
    avgWeight: 17.1,
  },
  distribution: [
    { bucket: "50-100 (Top)", count: 500 },
    { bucket: "40-50 (High)", count: 2000 },
    { bucket: "30-40 (Medium)", count: 8000 },
    { bucket: "20-30 (Low)", count: 25000 },
    { bucket: "0-20 (Minimal)", count: 49500 },
  ],
}

const mockTopActors = {
  actors: [
    {
      id: 530,
      tmdbId: 1810,
      name: "Heath Ledger",
      dofPopularity: 42.38,
      confidence: 1.0,
      tmdbPopularity: 25.5,
      deathday: "2008-01-22",
      profilePath: "/path.jpg",
    },
    {
      id: 7211,
      tmdbId: 4566,
      name: "Alan Rickman",
      dofPopularity: 38.45,
      confidence: 1.0,
      tmdbPopularity: 18.2,
      deathday: "2016-01-14",
      profilePath: null,
    },
  ],
}

const mockLowConfidence = {
  actors: [
    {
      id: 12345,
      tmdbId: 9999,
      name: "Unknown Actor",
      dofPopularity: 15.5,
      confidence: 0.25,
      tmdbPopularity: 5.0,
      movieCount: 2,
      showCount: 1,
    },
  ],
}

const mockMissing = {
  totalMissing: 15000,
  actors: [
    {
      id: 99999,
      tmdbId: 88888,
      name: "Missing Score Actor",
      tmdbPopularity: 3.2,
      movieCount: 1,
      showCount: 0,
    },
  ],
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PopularityPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("PopularityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    vi.mocked(usePopularityStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as ReturnType<typeof usePopularityStats>)

    vi.mocked(useTopActors).mockReturnValue({
      data: mockTopActors,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTopActors>)

    vi.mocked(useLowConfidenceActors).mockReturnValue({
      data: mockLowConfidence,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useLowConfidenceActors>)

    vi.mocked(useMissingPopularityActors).mockReturnValue({
      data: mockMissing,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useMissingPopularityActors>)

    vi.mocked(usePopularityLastRun).mockReturnValue({
      data: {
        lastRun: {
          id: 1,
          job_name: "scheduled-popularity-update",
          started_at: "2026-01-31T03:00:00Z",
          completed_at: "2026-01-31T03:05:00Z",
          status: "success",
          error_message: null,
          duration_ms: 300000,
        },
        recentRuns: [],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePopularityLastRun>)
  })

  describe("Header and Tabs", () => {
    it("renders page title and description", () => {
      renderPage()

      expect(screen.getByText("DOF Popularity Scores")).toBeInTheDocument()
      expect(
        screen.getByText("View and analyze popularity scores for movies, shows, and actors")
      ).toBeInTheDocument()
    })

    it("renders all tabs", () => {
      renderPage()

      expect(screen.getByTestId("popularity-overview-tab")).toBeInTheDocument()
      expect(screen.getByTestId("popularity-top-actors-tab")).toBeInTheDocument()
      expect(screen.getByTestId("popularity-low-confidence-tab")).toBeInTheDocument()
      expect(screen.getByTestId("popularity-missing-tab")).toBeInTheDocument()
    })

    it("defaults to overview tab", () => {
      renderPage()

      const overviewTab = screen.getByTestId("popularity-overview-tab")
      expect(overviewTab).toHaveClass("border-admin-interactive")
    })
  })

  describe("Overview Tab", () => {
    it("displays actor statistics", () => {
      renderPage()

      expect(screen.getByText("Deceased Actors")).toBeInTheDocument()
      expect(screen.getByText("85,000")).toBeInTheDocument()
      expect(screen.getByText(/of 100,000 with scores/)).toBeInTheDocument()
    })

    it("displays movie statistics", () => {
      renderPage()

      expect(screen.getByText("Movies")).toBeInTheDocument()
      expect(screen.getByText("48,000")).toBeInTheDocument()
    })

    it("displays show statistics", () => {
      renderPage()

      expect(screen.getByText("TV Shows")).toBeInTheDocument()
      expect(screen.getByText("9,500")).toBeInTheDocument()
    })

    it("displays score distribution", () => {
      renderPage()

      expect(screen.getByText("Actor Score Distribution")).toBeInTheDocument()
      expect(screen.getByText("50-100 (Top)")).toBeInTheDocument()
      expect(screen.getByText("0-20 (Minimal)")).toBeInTheDocument()
    })

    it("displays recalculation script commands", () => {
      renderPage()

      expect(screen.getByText("Recalculation Scripts")).toBeInTheDocument()
      // Check that script commands section exists (multiple list items have similar text)
      const scriptsList = screen.getByText("Recalculation Scripts").closest("div")
      expect(scriptsList).toBeInTheDocument()
    })

    it("shows loading state", () => {
      vi.mocked(usePopularityStats).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as ReturnType<typeof usePopularityStats>)

      renderPage()

      expect(screen.getByText("Loading popularity statistics...")).toBeInTheDocument()
    })
  })

  describe("Top Actors Tab", () => {
    it("switches to top actors tab when clicked", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      await waitFor(() => {
        expect(screen.getByTestId("top-actors-table")).toBeInTheDocument()
      })
    })

    it("displays top actors in table", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      await waitFor(() => {
        expect(screen.getByText("Heath Ledger")).toBeInTheDocument()
        expect(screen.getByText("Alan Rickman")).toBeInTheDocument()
      })
    })

    it("displays actor DOF scores", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      await waitFor(() => {
        expect(screen.getByText("42.38")).toBeInTheDocument()
        expect(screen.getByText("38.45")).toBeInTheDocument()
      })
    })

    it("displays confidence badges", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      await waitFor(() => {
        // Both actors have 100% confidence
        const badges = screen.getAllByText("100%")
        expect(badges.length).toBeGreaterThanOrEqual(2)
      })
    })

    it("has filter controls", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      await waitFor(() => {
        expect(screen.getByLabelText("Min Confidence:")).toBeInTheDocument()
        expect(screen.getByLabelText("Show:")).toBeInTheDocument()
      })
    })

    it("calls hook with updated filter values", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      // Default call
      expect(useTopActors).toHaveBeenCalledWith(100, 0.5)

      // Change limit
      const limitSelect = screen.getByLabelText("Show:")
      fireEvent.change(limitSelect, { target: { value: "50" } })

      await waitFor(() => {
        expect(useTopActors).toHaveBeenCalledWith(50, 0.5)
      })
    })
  })

  describe("Low Confidence Tab", () => {
    it("switches to low confidence tab when clicked", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-low-confidence-tab"))

      await waitFor(() => {
        expect(screen.getByText("Low Confidence Actors")).toBeInTheDocument()
      })
    })

    it("displays low confidence actors", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-low-confidence-tab"))

      await waitFor(() => {
        expect(screen.getByText("Unknown Actor")).toBeInTheDocument()
        expect(screen.getByText("15.50")).toBeInTheDocument()
        expect(screen.getByText("25%")).toBeInTheDocument()
      })
    })

    it("displays movie and show counts", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-low-confidence-tab"))

      await waitFor(() => {
        // movieCount: 2, showCount: 1
        expect(screen.getByText("2")).toBeInTheDocument()
        expect(screen.getByText("1")).toBeInTheDocument()
      })
    })
  })

  describe("Missing Scores Tab", () => {
    it("switches to missing scores tab when clicked", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-missing-tab"))

      await waitFor(() => {
        expect(screen.getByText("Actors Missing DOF Scores")).toBeInTheDocument()
      })
    })

    it("displays total missing count", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-missing-tab"))

      await waitFor(() => {
        expect(screen.getByText("15,000 actors need scores calculated")).toBeInTheDocument()
      })
    })

    it("displays actors without scores", async () => {
      renderPage()

      fireEvent.click(screen.getByTestId("popularity-missing-tab"))

      await waitFor(() => {
        expect(screen.getByText("Missing Score Actor")).toBeInTheDocument()
        expect(screen.getByText("3.2")).toBeInTheDocument()
      })
    })
  })

  describe("Empty States", () => {
    it("shows empty message when no top actors", async () => {
      vi.mocked(useTopActors).mockReturnValue({
        data: { actors: [] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useTopActors>)

      renderPage()

      fireEvent.click(screen.getByTestId("popularity-top-actors-tab"))

      await waitFor(() => {
        expect(screen.getByText("No actors found with the selected criteria")).toBeInTheDocument()
      })
    })

    it("shows empty message when no low confidence actors", async () => {
      vi.mocked(useLowConfidenceActors).mockReturnValue({
        data: { actors: [] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useLowConfidenceActors>)

      renderPage()

      fireEvent.click(screen.getByTestId("popularity-low-confidence-tab"))

      await waitFor(() => {
        expect(screen.getByText("No low confidence actors found")).toBeInTheDocument()
      })
    })

    it("shows success message when all actors have scores", async () => {
      vi.mocked(useMissingPopularityActors).mockReturnValue({
        data: { totalMissing: 0, actors: [] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useMissingPopularityActors>)

      renderPage()

      fireEvent.click(screen.getByTestId("popularity-missing-tab"))

      await waitFor(() => {
        expect(
          screen.getByText("All deceased actors have DOF popularity scores")
        ).toBeInTheDocument()
      })
    })
  })
})
