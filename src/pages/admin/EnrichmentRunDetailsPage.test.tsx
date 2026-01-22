import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import EnrichmentRunDetailsPage from "./EnrichmentRunDetailsPage"
import * as enrichmentHooks from "../../hooks/admin/useEnrichmentRuns"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/admin/useEnrichmentRuns")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("EnrichmentRunDetailsPage", () => {
  const mockRunDetails = {
    id: 1,
    started_at: "2024-01-01T00:00:00.000Z",
    completed_at: "2024-01-01T01:00:00.000Z",
    duration_ms: 3600000,
    actors_queried: 100,
    actors_processed: 95,
    actors_enriched: 80,
    actors_with_death_page: 75,
    fill_rate: "84.21",
    total_cost_usd: "1.50",
    exit_reason: "completed",
    error_count: 0,
    cost_by_source: { wikidata: 0.5, wikipedia: 1.0 },
    source_hit_rates: { wikidata: 0.8, wikipedia: 0.6 },
    sources_attempted: ["wikidata", "wikipedia"],
    config: { maxCostPerActor: 0.05 },
    links_followed: 150,
    pages_fetched: 200,
    ai_link_selections: 50,
    ai_content_extractions: 80,
    errors: [],
    script_name: "enrich-actors",
    script_version: "1.0.0",
    hostname: "localhost",
  }

  const mockActors = {
    items: [
      {
        actor_id: 1,
        actor_name: "John Doe",
        actor_tmdb_id: 12345,
        was_enriched: true,
        created_death_page: true,
        confidence: "0.95",
        sources_attempted: ["wikidata", "wikipedia"],
        winning_source: "wikidata",
        processing_time_ms: 1500,
        cost_usd: "0.025",
        links_followed: 3,
        pages_fetched: 5,
        error: null,
      },
      {
        actor_id: 2,
        actor_name: "Jane Smith",
        actor_tmdb_id: 67890,
        was_enriched: false,
        created_death_page: false,
        confidence: null,
        sources_attempted: ["wikidata"],
        winning_source: null,
        processing_time_ms: 800,
        cost_usd: "0.010",
        links_followed: 1,
        pages_fetched: 2,
        error: "No death information found",
      },
    ],
    total: 2,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  }

  const mockSourceStats = [
    {
      source: "wikidata",
      total_attempts: 95,
      successful_attempts: 76,
      success_rate: 80.0,
      total_cost_usd: 0.5,
      average_cost_usd: 0.0053,
      total_processing_time_ms: 120000,
      average_processing_time_ms: 1263,
    },
    {
      source: "wikipedia",
      total_attempts: 19,
      successful_attempts: 4,
      success_rate: 21.05,
      total_cost_usd: 1.0,
      average_cost_usd: 0.0526,
      total_processing_time_ms: 50000,
      average_processing_time_ms: 2632,
    },
  ]

  beforeEach(() => {
    vi.mocked(enrichmentHooks.useEnrichmentRunDetails).mockReturnValue({
      data: mockRunDetails,
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(enrichmentHooks.useEnrichmentRunActors).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(enrichmentHooks.useRunSourcePerformanceStats).mockReturnValue({
      data: mockSourceStats,
      isLoading: false,
      error: null,
    } as any)

    vi.mocked(adminAuthHook.useAdminAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    } as any)
  })

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/enrichment/runs/1"]}>
          <Routes>
            <Route path="/admin/enrichment/runs/:id" element={<EnrichmentRunDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders page title with run ID", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Enrichment Run #1")).toBeInTheDocument()
    })
  })

  it("renders loading state", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRunDetails).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error message when run not found", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRunDetails).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Not found"),
    } as any)

    renderPage()

    expect(screen.getByText(/Failed to load enrichment run details/i)).toBeInTheDocument()
  })

  it("displays summary statistics", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actors Processed")).toBeInTheDocument()
    })
  })

  it("displays fill rate", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Fill Rate")).toBeInTheDocument()
      expect(screen.getByText("84.21%")).toBeInTheDocument()
    })
  })

  it("displays total cost", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Total Cost")).toBeInTheDocument()
      expect(screen.getByText("$1.50")).toBeInTheDocument()
    })
  })

  it("displays duration", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Duration")).toBeInTheDocument()
      expect(screen.getByText("3600s")).toBeInTheDocument()
    })
  })

  it("displays configuration metadata", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Configuration")).toBeInTheDocument()
      expect(screen.getByText("completed")).toBeInTheDocument()
    })
  })

  it("displays source performance stats", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Source Performance")).toBeInTheDocument()
    })
  })

  it("displays actor results table", () => {
    renderPage()

    expect(screen.getByText("Actor Results")).toBeInTheDocument()
    expect(screen.getByText("John Doe")).toBeInTheDocument()
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
  })

  it("displays enriched status indicator", () => {
    renderPage()

    const enrichedMarkers = screen.getAllByText("✓")
    const notEnrichedMarkers = screen.getAllByText("—")

    expect(enrichedMarkers.length).toBeGreaterThan(0)
    expect(notEnrichedMarkers.length).toBeGreaterThan(0)
  })

  it("displays winning source", async () => {
    renderPage()

    await waitFor(() => {
      const wikidataElements = screen.getAllByText("wikidata")
      expect(wikidataElements.length).toBeGreaterThan(0)
    })
  })

  it("displays actor costs", () => {
    renderPage()

    expect(screen.getByText("$0.025")).toBeInTheDocument()
    expect(screen.getByText("$0.010")).toBeInTheDocument()
  })

  it("displays processing times", () => {
    renderPage()

    expect(screen.getByText("1500ms")).toBeInTheDocument()
    expect(screen.getByText("800ms")).toBeInTheDocument()
  })

  it("displays average time per actor", () => {
    renderPage()

    // 3600000ms / 95 actors = 37895ms
    expect(screen.getByText(/Avg: 37895ms\/actor/i)).toBeInTheDocument()
  })

  it("displays back to runs link", () => {
    renderPage()

    const backLink = screen.getByText("← Back to Runs")
    expect(backLink.closest("a")).toHaveAttribute("href", "/admin/enrichment/runs")
  })

  it("displays script metadata", () => {
    renderPage()

    expect(screen.getByText(/enrich-actors v1.0.0/i)).toBeInTheDocument()
    expect(screen.getByText("localhost")).toBeInTheDocument()
  })

  it("handles missing source stats gracefully", () => {
    vi.mocked(enrichmentHooks.useRunSourcePerformanceStats).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as any)

    renderPage()

    expect(screen.getByText("Failed to load source stats")).toBeInTheDocument()
  })

  it("hides source performance section when no stats", () => {
    vi.mocked(enrichmentHooks.useRunSourcePerformanceStats).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    renderPage()

    expect(screen.queryByText("Source Performance")).not.toBeInTheDocument()
  })

  it("displays pagination when multiple pages", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRunActors).mockReturnValue({
      data: {
        ...mockActors,
        total: 100,
        totalPages: 2,
      },
      isLoading: false,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
  })
})
