/**
 * Tests for EnrichmentReviewPage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TestMemoryRouter } from "@/test/test-utils"
import EnrichmentReviewPage from "./EnrichmentReviewPage"
import * as enrichmentReviewHooks from "../../hooks/admin/useEnrichmentReview"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/admin/useEnrichmentReview")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("EnrichmentReviewPage", () => {
  const mockPendingEnrichments = {
    items: [
      {
        enrichment_run_actor_id: 1,
        run_id: 1,
        actor_id: 100,
        actor_name: "John Doe",
        actor_tmdb_id: 1000,
        deathday: "2020-01-15",
        cause_of_death: "Natural causes",
        overall_confidence: 0.85,
        cause_confidence: "high",
        winning_source: "claude",
        cost_usd: "0.02",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        enrichment_run_actor_id: 2,
        run_id: 1,
        actor_id: 101,
        actor_name: "Jane Smith",
        actor_tmdb_id: 1001,
        deathday: "2021-03-20",
        cause_of_death: "Cancer",
        overall_confidence: 0.65,
        cause_confidence: "medium",
        winning_source: "wikidata",
        cost_usd: "0.01",
        created_at: "2024-01-01T00:01:00Z",
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }

  beforeEach(() => {
    vi.mocked(enrichmentReviewHooks.usePendingEnrichments).mockReturnValue({
      data: mockPendingEnrichments,
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
          <EnrichmentReviewPage />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(enrichmentReviewHooks.usePendingEnrichments).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error message when fetch fails", () => {
    vi.mocked(enrichmentReviewHooks.usePendingEnrichments).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as any)

    renderPage()

    expect(screen.getByText(/Failed to load pending enrichments/i)).toBeInTheDocument()
  })

  it("renders pending enrichments table", () => {
    renderPage()

    expect(screen.getByRole("heading", { name: "Review Enrichments" })).toBeInTheDocument()
    expect(screen.getByText("John Doe")).toBeInTheDocument()
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    expect(screen.getByText("Natural causes")).toBeInTheDocument()
    expect(screen.getByText("Cancer")).toBeInTheDocument()
  })

  it("displays stats cards", () => {
    renderPage()

    expect(screen.getByText("Total Pending")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("Avg Confidence")).toBeInTheDocument()
    expect(screen.getByText("0.75")).toBeInTheDocument() // (0.85 + 0.65) / 2
  })

  it("shows empty state when no enrichments", () => {
    vi.mocked(enrichmentReviewHooks.usePendingEnrichments).mockReturnValue({
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

    expect(screen.getByText("No pending enrichments found")).toBeInTheDocument()
  })

  it("renders confidence badges with correct colors", () => {
    renderPage()

    const highConfidenceBadge = screen.getByText("0.85")
    const mediumConfidenceBadge = screen.getByText("0.65")

    expect(highConfidenceBadge).toHaveClass("bg-green-900")
    expect(mediumConfidenceBadge).toHaveClass("bg-yellow-900")
  })

  it("renders cause confidence badges", () => {
    renderPage()

    const badges = screen.getAllByText("High")
    expect(badges.length).toBeGreaterThan(0)
    const mediumBadges = screen.getAllByText("Medium")
    expect(mediumBadges.length).toBeGreaterThan(0)
  })

  it("filters can be changed", () => {
    renderPage()

    const runIdInput = screen.getByLabelText("Run ID")
    fireEvent.change(runIdInput, { target: { value: "5" } })

    expect(runIdInput).toHaveValue(5)
  })

  it("shows review button for each enrichment", () => {
    renderPage()

    const reviewButtons = screen.getAllByText("Review")
    expect(reviewButtons).toHaveLength(2)
  })

  it("commit button is disabled when no runId filter is set", () => {
    renderPage()

    const commitButton = screen.getByText("Commit Approved")
    expect(commitButton).toBeDisabled()
  })

  it("renders pagination when multiple pages", () => {
    vi.mocked(enrichmentReviewHooks.usePendingEnrichments).mockReturnValue({
      data: {
        ...mockPendingEnrichments,
        totalPages: 3,
      },
      isLoading: false,
      error: null,
    } as any)

    renderPage()

    expect(screen.getByText("Previous")).toBeInTheDocument()
    expect(screen.getByText("Next")).toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
  })

  it("does not render pagination when single page", () => {
    renderPage()

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("clears filters when clear button clicked", () => {
    renderPage()

    const clearButton = screen.getByText("Clear Filters")
    fireEvent.click(clearButton)

    const runIdInput = screen.getByLabelText("Run ID") as HTMLInputElement
    expect(runIdInput.value).toBe("")
  })
})
