/**
 * Tests for CombinedEnrichmentPage.
 *
 * Covers: actor list with skip pills, skip counts, tab switching,
 * submit with correct actor subsets, partial failure, all-skip edge case.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import CombinedEnrichmentPage from "./CombinedEnrichmentPage"

// ── Mock data ───────────────────────────────────────────────────────────

const mockActors = [
  {
    id: 1,
    name: "Actor One",
    popularity: 50.0,
    tmdb_id: 100,
    enrichment_version: null,
    biography_version: null,
  },
  {
    id: 2,
    name: "Actor Two",
    popularity: 30.0,
    tmdb_id: 200,
    enrichment_version: "4.0.0",
    biography_version: null,
  },
  {
    id: 3,
    name: "Actor Three",
    popularity: 10.0,
    tmdb_id: 300,
    enrichment_version: null,
    biography_version: 2,
  },
]

// ── Hook mocks ──────────────────────────────────────────────────────────

const mockDeathMutateAsync = vi.fn()
const mockBioMutateAsync = vi.fn()

vi.mock("../../hooks/admin/useEnrichmentRuns", () => ({
  useStartEnrichmentRun: () => ({
    mutateAsync: mockDeathMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock("../../hooks/admin/useBioEnrichmentRuns", () => ({
  useStartBioEnrichmentRun: () => ({
    mutateAsync: mockBioMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}))

// Mock fetch for actor details API
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage(actorIds: number[] = [1, 2, 3]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          { pathname: "/admin/enrichment/combined", state: { selectedActorIds: actorIds } },
        ]}
      >
        <CombinedEnrichmentPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("CombinedEnrichmentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockActors),
    })
    mockDeathMutateAsync.mockResolvedValue({ id: 101, status: "running", message: "ok" })
    mockBioMutateAsync.mockResolvedValue({ success: true, runId: 201 })
  })

  it("shows empty state when no actor IDs passed", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CombinedEnrichmentPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByText(/no actors selected/i)).toBeInTheDocument()
  })

  it("renders actor list with skip status pills", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actor One")).toBeInTheDocument()
    })

    // Actor Two has enrichment_version "4.0.0" -> death skip pill
    expect(screen.getByTestId("skip-death-2")).toHaveTextContent("Death ✓")
    // Actor Three has biography_version 2 -> bio skip pill
    expect(screen.getByTestId("skip-bio-3")).toHaveTextContent("Bio ✓")

    // Actor One has neither -> no pills
    expect(screen.queryByTestId("skip-death-1")).not.toBeInTheDocument()
    expect(screen.queryByTestId("skip-bio-1")).not.toBeInTheDocument()
  })

  it("shows correct skip counts in summary", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("3 Actors Selected")).toBeInTheDocument()
    })

    expect(screen.getByText("1 skip death")).toBeInTheDocument()
    expect(screen.getByText("1 skip bio")).toBeInTheDocument()
  })

  it("tab switching works between death and bio", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actor One")).toBeInTheDocument()
    })

    // Death tab should be active by default
    expect(screen.getByTestId("tab-death")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText(/source selection/i)).toBeInTheDocument()

    // Switch to bio tab
    fireEvent.click(screen.getByTestId("tab-bio"))
    expect(screen.getByTestId("tab-bio")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText(/source categories/i)).toBeInTheDocument()

    // Switch back to death
    fireEvent.click(screen.getByTestId("tab-death"))
    expect(screen.getByTestId("tab-death")).toHaveAttribute("aria-selected", "true")
  })

  it("tab badges show correct actor counts", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actor One")).toBeInTheDocument()
    })

    // Death tab badge: actors 1 and 3 need death enrichment (actor 2 skipped) = 2
    const deathTab = screen.getByTestId("tab-death")
    expect(deathTab).toHaveTextContent("2")

    // Bio tab badge: actors 1 and 2 need bio enrichment (actor 3 skipped) = 2
    const bioTab = screen.getByTestId("tab-bio")
    expect(bioTab).toHaveTextContent("2")
  })

  it("submit calls both mutations with correct actor ID subsets", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actor One")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId("submit-both"))

    await waitFor(() => {
      // Death: actors 1 and 3 (actor 2 has enrichment_version "4.0.0")
      expect(mockDeathMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          actorIds: [1, 3],
        })
      )
      // Bio: actors 1 and 2 (actor 3 has biography_version >= 1)
      expect(mockBioMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          actorIds: [1, 2],
        })
      )
    })
  })

  it("shows run links on success", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actor One")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId("submit-both"))

    await waitFor(() => {
      expect(screen.getByTestId("enrichment-results")).toBeInTheDocument()
    })

    expect(screen.getByText(/view run #101/i)).toBeInTheDocument()
    expect(screen.getByText(/view run #201/i)).toBeInTheDocument()
  })

  it("handles partial failure (death succeeds, bio fails)", async () => {
    mockBioMutateAsync.mockRejectedValue(new Error("Bio service unavailable"))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Actor One")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId("submit-both"))

    await waitFor(() => {
      expect(screen.getByTestId("enrichment-results")).toBeInTheDocument()
    })

    // Death succeeded
    expect(screen.getByText(/death enrichment started/i)).toBeInTheDocument()
    expect(screen.getByText(/view run #101/i)).toBeInTheDocument()

    // Bio failed
    expect(screen.getByText(/bio enrichment failed/i)).toBeInTheDocument()
    expect(screen.getByText(/bio service unavailable/i)).toBeInTheDocument()
  })

  it("handles case where all actors skip one type", async () => {
    // All actors already have death enrichment
    const allDeathDone = [
      {
        id: 1,
        name: "Done Actor",
        popularity: 50.0,
        tmdb_id: 100,
        enrichment_version: "4.0.0",
        biography_version: null,
      },
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(allDeathDone),
    })

    renderPage([1])

    await waitFor(() => {
      expect(screen.getByText("Done Actor")).toBeInTheDocument()
    })

    // Death tab should show "0" actors and yellow warning
    expect(screen.getByText(/all 1 actors already have death enrichment/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("submit-both"))

    await waitFor(() => {
      // Death mutation should NOT be called (0 actors)
      expect(mockDeathMutateAsync).not.toHaveBeenCalled()
      // Bio mutation should be called with the one actor
      expect(mockBioMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ actorIds: [1] }))
    })
  })
})
