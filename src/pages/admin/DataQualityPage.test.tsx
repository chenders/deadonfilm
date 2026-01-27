/**
 * Tests for DataQualityPage defaults
 *
 * These tests verify that the admin UI defaults match the expected behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import DataQualityPage from "./DataQualityPage"

// Mock the hooks
vi.mock("../../hooks/admin/useDataQuality", () => ({
  useDataQualityOverview: () => ({
    data: {
      futureDeathsCount: 5,
      uncertainDeathsCount: 10,
      pendingResetCount: 100,
    },
    isLoading: false,
  }),
  useFutureDeaths: () => ({
    data: {
      actors: [],
      page: 1,
      totalPages: 1,
      total: 0,
    },
    isLoading: false,
  }),
  useUncertainDeaths: () => ({
    data: {
      actors: [],
      page: 1,
      totalPages: 1,
      total: 0,
    },
    isLoading: false,
  }),
  useCleanupFutureDeaths: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: null,
  }),
  useResetEnrichment: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: null,
    error: null,
  }),
}))

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DataQualityPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("DataQualityPage defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Tab defaults", () => {
    it("shows Overview tab as active by default", () => {
      renderPage()
      const overviewTab = screen.getByTestId("data-quality-overview-tab")
      expect(overviewTab).toHaveClass("border-admin-interactive")
    })

    it("shows all tab options", () => {
      renderPage()
      expect(screen.getByTestId("data-quality-overview-tab")).toBeInTheDocument()
      expect(screen.getByTestId("data-quality-future-deaths-tab")).toBeInTheDocument()
      expect(screen.getByTestId("data-quality-uncertain-tab")).toBeInTheDocument()
      expect(screen.getByTestId("data-quality-reset-tab")).toBeInTheDocument()
    })
  })

  describe("Reset Enrichment form defaults", () => {
    it("has resetDryRun unchecked by default", async () => {
      renderPage()

      // Navigate to Reset Enrichment tab
      const resetTab = screen.getByTestId("data-quality-reset-tab")
      fireEvent.click(resetTab)

      // Find the dry run checkbox
      const dryRunCheckbox = screen.getByRole("checkbox", { name: /dry run/i })
      expect(dryRunCheckbox).not.toBeChecked()
    })

    it("has actorId input empty by default", async () => {
      renderPage()

      // Navigate to Reset Enrichment tab
      const resetTab = screen.getByTestId("data-quality-reset-tab")
      fireEvent.click(resetTab)

      // Find the actor ID input
      const actorIdInput = screen.getByLabelText(/actor id \(internal\)/i)
      expect(actorIdInput).toHaveValue("")
    })

    it("has tmdbId input empty by default", async () => {
      renderPage()

      // Navigate to Reset Enrichment tab
      const resetTab = screen.getByTestId("data-quality-reset-tab")
      fireEvent.click(resetTab)

      // Find the TMDB ID input
      const tmdbIdInput = screen.getByLabelText(/tmdb id/i)
      expect(tmdbIdInput).toHaveValue("")
    })
  })

  describe("Overview statistics render correctly", () => {
    it("displays future deaths count", () => {
      renderPage()
      expect(screen.getByText("5")).toBeInTheDocument()
    })

    it("displays uncertain deaths count", () => {
      renderPage()
      expect(screen.getByText("10")).toBeInTheDocument()
    })

    it("displays pending reset count", () => {
      renderPage()
      expect(screen.getByText("100")).toBeInTheDocument()
    })
  })
})
