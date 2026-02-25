import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Route, Routes } from "react-router-dom"
import { TestMemoryRouter } from "../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastProvider } from "../../contexts/ToastContext"
import BioEnrichmentRunDetailsPage from "./BioEnrichmentRunDetailsPage"
import * as bioHooks from "../../hooks/admin/useBioEnrichmentRuns"
import * as enrichmentHooks from "../../hooks/admin/useEnrichmentRuns"
import * as adminAuthHook from "../../hooks/useAdminAuth"

vi.mock("../../hooks/admin/useBioEnrichmentRuns")
vi.mock("../../hooks/admin/useEnrichmentRuns")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("BioEnrichmentRunDetailsPage", () => {
  const mockRunDetails: bioHooks.BioEnrichmentRunDetails = {
    id: 123,
    started_at: "2025-06-15T10:00:00.000Z",
    completed_at: "2025-06-15T11:00:00.000Z",
    duration_ms: 3600000,
    status: "completed",
    actors_queried: 50,
    actors_processed: 48,
    actors_enriched: 40,
    actors_with_substantive_content: 38,
    fill_rate: "83.33",
    total_cost_usd: "2.5000",
    source_cost_usd: "1.2000",
    synthesis_cost_usd: "1.3000",
    exit_reason: "completed",
    error_count: 0,
    cost_by_source: { wikidata: 0.0, wikipedia: 0.0 },
    source_hit_rates: { wikidata: 0.9, wikipedia: 0.7 },
    sources_attempted: ["wikidata", "wikipedia"],
    config: { confidenceThreshold: 0.6 },
    errors: [],
    hostname: "prod-1",
    script_name: "enrich-biographies",
    current_actor_index: null,
    current_actor_name: null,
  }

  const mockActors: bioHooks.PaginatedResult<bioHooks.BioEnrichmentRunActor> = {
    items: [
      {
        actor_id: 101,
        actor_name: "Humphrey Bogart",
        actor_tmdb_id: 4110,
        was_enriched: true,
        has_substantive_content: true,
        narrative_confidence: "high",
        sources_attempted: [
          { source: "wikidata", success: true, costUsd: 0, confidence: 0.8, reliabilityScore: 0.9 },
          {
            source: "wikipedia",
            success: true,
            costUsd: 0,
            confidence: 0.9,
            reliabilityScore: 0.95,
          },
        ],
        sources_succeeded: 2,
        synthesis_model: "claude-sonnet-4-20250514",
        processing_time_ms: 4500,
        cost_usd: "0.0350",
        source_cost_usd: "0.0000",
        synthesis_cost_usd: "0.0350",
        error: null,
        log_entries: [],
      },
      {
        actor_id: 102,
        actor_name: "Lauren Bacall",
        actor_tmdb_id: 4111,
        was_enriched: false,
        has_substantive_content: false,
        narrative_confidence: null,
        sources_attempted: [
          {
            source: "wikidata",
            success: false,
            costUsd: 0,
            confidence: 0,
            reliabilityScore: null,
          },
        ],
        sources_succeeded: 0,
        synthesis_model: null,
        processing_time_ms: 1200,
        cost_usd: "0.0000",
        source_cost_usd: "0.0000",
        synthesis_cost_usd: "0.0000",
        error: "No biographical data found",
        log_entries: [],
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }

  const mockSourceStats: bioHooks.BioSourcePerformanceStats[] = [
    {
      source: "wikidata",
      total_attempts: 48,
      successful_attempts: 43,
      success_rate: 89.58,
      total_cost_usd: 0.0,
      average_cost_usd: 0.0,
    },
    {
      source: "wikipedia",
      total_attempts: 43,
      successful_attempts: 35,
      success_rate: 81.4,
      total_cost_usd: 0.0,
      average_cost_usd: 0.0,
    },
  ]

  const mockRunLogsData = {
    logs: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
  }

  const mockActorLogsResponse = {
    actorName: "Humphrey Bogart",
    logEntries: [
      {
        timestamp: "2025-06-15T10:01:00.000Z",
        level: "info" as const,
        message: "Starting enrichment",
        data: { source: "wikidata" },
      },
      {
        timestamp: "2025-06-15T10:01:05.000Z",
        level: "info" as const,
        message: "Source succeeded",
        data: { source: "wikipedia", confidence: 0.9 },
      },
    ],
  }

  beforeEach(() => {
    vi.mocked(bioHooks.useBioEnrichmentRunDetails).mockReturnValue({
      data: mockRunDetails,
      isLoading: false,
      error: null,
    } as ReturnType<typeof bioHooks.useBioEnrichmentRunDetails>)

    vi.mocked(bioHooks.useBioEnrichmentRunActors).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as ReturnType<typeof bioHooks.useBioEnrichmentRunActors>)

    vi.mocked(bioHooks.useBioRunSourcePerformanceStats).mockReturnValue({
      data: mockSourceStats,
      isLoading: false,
      error: null,
    } as ReturnType<typeof bioHooks.useBioRunSourcePerformanceStats>)

    vi.mocked(bioHooks.useBioEnrichmentRunProgress).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof bioHooks.useBioEnrichmentRunProgress>)

    vi.mocked(bioHooks.useStopBioEnrichmentRun).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof bioHooks.useStopBioEnrichmentRun>)

    vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

    vi.mocked(enrichmentHooks.useRunLogs).mockReturnValue({
      data: mockRunLogsData,
      isLoading: false,
      error: null,
    } as ReturnType<typeof enrichmentHooks.useRunLogs>)

    vi.mocked(adminAuthHook.useAdminAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    } as ReturnType<typeof adminAuthHook.useAdminAuth>)
  })

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TestMemoryRouter initialEntries={["/admin/bio-enrichment/runs/123"]}>
            <Routes>
              <Route
                path="/admin/bio-enrichment/runs/:id"
                element={<BioEnrichmentRunDetailsPage />}
              />
            </Routes>
          </TestMemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    )
  }

  it("renders page title with run ID", () => {
    renderPage()

    expect(screen.getByText("Run #123")).toBeInTheDocument()
  })

  it("renders loading state", () => {
    vi.mocked(bioHooks.useBioEnrichmentRunDetails).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof bioHooks.useBioEnrichmentRunDetails>)

    renderPage()

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
  })

  it("renders error message when run not found", () => {
    vi.mocked(bioHooks.useBioEnrichmentRunDetails).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Not found"),
    } as ReturnType<typeof bioHooks.useBioEnrichmentRunDetails>)

    renderPage()

    expect(screen.getByText(/Failed to load bio enrichment run details/i)).toBeInTheDocument()
  })

  it("displays summary statistics", () => {
    renderPage()

    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("completed")).toBeInTheDocument()
    expect(screen.getByText("Actors Processed")).toBeInTheDocument()
    // "48" appears in both the stat card and the source performance table (wikidata total_attempts)
    expect(screen.getAllByText("48").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Actors Enriched")).toBeInTheDocument()
    expect(screen.getByText("40")).toBeInTheDocument()
    expect(screen.getByText("Fill Rate")).toBeInTheDocument()
    expect(screen.getByText("83.33%")).toBeInTheDocument()
    // "Total Cost" appears in both stat card and source performance table header
    expect(screen.getAllByText("Total Cost").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("$2.5000")).toBeInTheDocument()
  })

  it("displays actor results table with actor rows", () => {
    renderPage()

    expect(screen.getByText("Actor Results (2)")).toBeInTheDocument()
    expect(screen.getByText("Humphrey Bogart")).toBeInTheDocument()
    expect(screen.getByText("Lauren Bacall")).toBeInTheDocument()
  })

  it("displays source performance stats", () => {
    renderPage()

    expect(screen.getByText("Source Performance")).toBeInTheDocument()
    // Source names appear in the table
    const wikidataElements = screen.getAllByText("wikidata")
    expect(wikidataElements.length).toBeGreaterThan(0)
  })

  it("renders RunLogsSection", () => {
    renderPage()

    expect(screen.getByText("Run Logs")).toBeInTheDocument()
    // RunLogsSection calls useRunLogs with runType="biography"
    expect(enrichmentHooks.useRunLogs).toHaveBeenCalledWith("biography", 123, 1, 50, undefined)
  })

  it("renders breadcrumb link to bio enrichment runs list", () => {
    renderPage()

    const backLink = screen.getByText("Bio Enrichment Runs")
    expect(backLink.closest("a")).toHaveAttribute("href", "/admin/bio-enrichment/runs")
  })

  describe("actor logs modal", () => {
    it("opens ActorLogsModal when clicking View button on an actor row", async () => {
      // Set up the mock to return logs once the actor is selected
      vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
        data: mockActorLogsResponse,
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

      const user = userEvent.setup()
      renderPage()

      // Find the View button for Humphrey Bogart by aria-label
      const viewButton = screen.getByRole("button", {
        name: "View enrichment logs for Humphrey Bogart",
      })
      await user.click(viewButton)

      // The modal should now be visible with the actor name in the title
      await waitFor(() => {
        expect(
          screen.getByText("Enrichment Logs \u2014 Humphrey Bogart")
        ).toBeInTheDocument()
      })
    })

    it("shows actor log entries in the modal", async () => {
      vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
        data: mockActorLogsResponse,
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

      const user = userEvent.setup()
      renderPage()

      const viewButton = screen.getByRole("button", {
        name: "View enrichment logs for Humphrey Bogart",
      })
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText("Starting enrichment")).toBeInTheDocument()
        expect(screen.getByText("Source succeeded")).toBeInTheDocument()
      })
    })

    it("closes the modal when clicking the close button", async () => {
      vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
        data: mockActorLogsResponse,
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

      const user = userEvent.setup()
      renderPage()

      // Open the modal
      const viewButton = screen.getByRole("button", {
        name: "View enrichment logs for Humphrey Bogart",
      })
      await user.click(viewButton)

      // Verify the modal is visible
      await waitFor(() => {
        expect(
          screen.getByText("Enrichment Logs \u2014 Humphrey Bogart")
        ).toBeInTheDocument()
      })

      // Click the close button (has aria-label="Close modal")
      const closeButton = screen.getByRole("button", { name: "Close modal" })
      await user.click(closeButton)

      // The modal title should no longer be present
      await waitFor(() => {
        expect(
          screen.queryByText("Enrichment Logs \u2014 Humphrey Bogart")
        ).not.toBeInTheDocument()
      })
    })

    it("opens modal for different actors independently", async () => {
      vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
        data: { actorName: "Lauren Bacall", logEntries: [] },
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

      const user = userEvent.setup()
      renderPage()

      const viewButton = screen.getByRole("button", {
        name: "View enrichment logs for Lauren Bacall",
      })
      await user.click(viewButton)

      await waitFor(() => {
        expect(
          screen.getByText("Enrichment Logs \u2014 Lauren Bacall")
        ).toBeInTheDocument()
      })
    })

    it("displays subtitle with run ID in the modal", async () => {
      vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
        data: mockActorLogsResponse,
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

      const user = userEvent.setup()
      renderPage()

      const viewButton = screen.getByRole("button", {
        name: "View enrichment logs for Humphrey Bogart",
      })
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText("Bio enrichment run #123")).toBeInTheDocument()
      })
    })

    it("shows empty state when actor has no log entries", async () => {
      vi.mocked(bioHooks.useBioActorEnrichmentLogs).mockReturnValue({
        data: { actorName: "Humphrey Bogart", logEntries: [] },
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioActorEnrichmentLogs>)

      const user = userEvent.setup()
      renderPage()

      const viewButton = screen.getByRole("button", {
        name: "View enrichment logs for Humphrey Bogart",
      })
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText("No log entries recorded")).toBeInTheDocument()
      })
    })
  })

  describe("configuration section", () => {
    it("displays configuration when present", () => {
      renderPage()

      expect(screen.getByText("Configuration")).toBeInTheDocument()
    })

    it("hides configuration section when config is empty", () => {
      vi.mocked(bioHooks.useBioEnrichmentRunDetails).mockReturnValue({
        data: { ...mockRunDetails, config: {} },
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioEnrichmentRunDetails>)

      renderPage()

      expect(screen.queryByText("Configuration")).not.toBeInTheDocument()
    })
  })

  describe("errors section", () => {
    it("displays errors when present", () => {
      vi.mocked(bioHooks.useBioEnrichmentRunDetails).mockReturnValue({
        data: {
          ...mockRunDetails,
          error_count: 1,
          errors: [{ actorId: 999, actorName: "Test Actor", error: "Source timeout" }],
        },
        isLoading: false,
        error: null,
      } as ReturnType<typeof bioHooks.useBioEnrichmentRunDetails>)

      renderPage()

      expect(screen.getByText("Errors (1)")).toBeInTheDocument()
      expect(screen.getByText("Test Actor")).toBeInTheDocument()
      expect(screen.getByText(/Source timeout/)).toBeInTheDocument()
    })

    it("hides errors section when no errors", () => {
      renderPage()

      expect(screen.queryByText(/^Errors/)).not.toBeInTheDocument()
    })
  })
})
