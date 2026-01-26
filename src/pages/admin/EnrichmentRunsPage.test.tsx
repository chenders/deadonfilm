import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { TestMemoryRouter } from "../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import EnrichmentRunsPage from "./EnrichmentRunsPage"
import * as enrichmentHooks from "../../hooks/admin/useEnrichmentRuns"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/admin/useEnrichmentRuns")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("EnrichmentRunsPage", () => {
  const mockRuns = {
    items: [
      {
        id: 1,
        started_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T01:00:00Z",
        duration_ms: 3600000,
        actors_queried: 100,
        actors_processed: 95,
        actors_enriched: 80,
        actors_with_death_page: 75,
        fill_rate: "84.21",
        total_cost_usd: "1.50",
        exit_reason: "completed",
        error_count: 0,
      },
      {
        id: 2,
        started_at: "2024-01-02T00:00:00Z",
        completed_at: "2024-01-02T02:00:00Z",
        duration_ms: 7200000,
        actors_queried: 200,
        actors_processed: 180,
        actors_enriched: 160,
        actors_with_death_page: 150,
        fill_rate: "88.89",
        total_cost_usd: "3.25",
        exit_reason: "completed",
        error_count: 2,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }

  beforeEach(() => {
    vi.mocked(enrichmentHooks.useEnrichmentRuns).mockReturnValue({
      data: mockRuns,
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
        <TestMemoryRouter>
          <EnrichmentRunsPage />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRuns).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error message when fetch fails", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRuns).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as any)

    renderPage()

    expect(screen.getByText(/Failed to load enrichment runs/i)).toBeInTheDocument()
  })

  it("renders empty state when no runs exist", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRuns).mockReturnValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      },
      isLoading: false,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByText(/No enrichment runs found/i)).toBeInTheDocument()
  })

  it("displays run statistics", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("95")).toBeInTheDocument() // actors processed
      expect(screen.getByText("$1.50")).toBeInTheDocument()
    })
  })

  it("displays fill rate percentage", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("84.21%")).toBeInTheDocument()
      expect(screen.getByText("88.89%")).toBeInTheDocument()
    })
  })

  it("displays error indicator for runs with errors", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Errors")).toBeInTheDocument()
    })
  })

  it("formats duration correctly", () => {
    renderPage()

    // 3600000ms = 3600s
    expect(screen.getByText("3600s")).toBeInTheDocument()
  })

  it("displays link to run details", () => {
    renderPage()

    const links = screen.getAllByRole("link")
    const detailsLink = links.find(
      (link) => link.getAttribute("href") === "/admin/enrichment/runs/1"
    )

    expect(detailsLink).toBeInTheDocument()
  })

  it("displays pagination information", () => {
    vi.mocked(enrichmentHooks.useEnrichmentRuns).mockReturnValue({
      data: {
        ...mockRuns,
        total: 50,
        totalPages: 3,
      },
      isLoading: false,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
  })
})
