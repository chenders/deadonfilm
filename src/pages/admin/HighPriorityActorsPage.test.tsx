import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TestMemoryRouter } from "@/test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import HighPriorityActorsPage from "./HighPriorityActorsPage"

// Mock the hooks
vi.mock("../../hooks/admin/useCoverage", () => ({
  useEnrichmentCandidates: vi.fn(),
}))

vi.mock("../../hooks/admin/useEnrichmentRuns", () => ({
  useStartEnrichmentRun: vi.fn(),
}))

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import { useEnrichmentCandidates } from "../../hooks/admin/useCoverage"
import { useStartEnrichmentRun } from "../../hooks/admin/useEnrichmentRuns"

const mockActors = [
  {
    id: 1,
    name: "John Doe",
    deathday: "2024-01-01",
    popularity: 15.5,
    enriched_at: null,
  },
  {
    id: 2,
    name: "Jane Smith",
    deathday: "2024-02-01",
    popularity: 12.3,
    enriched_at: "2024-03-01T00:00:00Z",
  },
  {
    id: 3,
    name: "Bob Johnson",
    deathday: "2024-03-01",
    popularity: 10.0,
    enriched_at: null,
  },
]

describe("HighPriorityActorsPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter>
          <HighPriorityActorsPage />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()
    expect(screen.getByTestId("loading-message")).toBeInTheDocument()
  })

  it("renders error state", () => {
    const error = new Error("Failed to load actors")
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()
    expect(
      screen.getByText("Failed to load high-priority actors. Please try again.")
    ).toBeInTheDocument()
  })

  it("renders empty state when no actors found", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()
    expect(
      screen.getByText("No high-priority actors found needing enrichment.")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/All actors with popularity ≥ 10 have been enriched/)
    ).toBeInTheDocument()
  })

  it("renders actor list successfully", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    expect(screen.getByText("High Priority Actors")).toBeInTheDocument()
    expect(screen.getByText("John Doe")).toBeInTheDocument()
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    expect(screen.getByText("Bob Johnson")).toBeInTheDocument()
    expect(screen.getByText("Showing 3 high-priority actors")).toBeInTheDocument()
  })

  it("displays popularity with defensive null check", () => {
    const actorWithNullPopularity = [
      {
        id: 1,
        name: "Test Actor",
        deathday: "2024-01-01",
        popularity: null,
        enriched_at: null,
      },
    ]

    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: actorWithNullPopularity,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    // Should display "N/A" for null popularity (getAllByText since dates can also be N/A)
    const naElements = screen.getAllByText("N/A")
    expect(naElements.length).toBeGreaterThan(0)
  })

  it("handles individual checkbox selection", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    const checkboxes = screen.getAllByTestId("actor-checkbox")
    expect(checkboxes).toHaveLength(3)

    // Select first actor
    fireEvent.click(checkboxes[0])

    // Action bar should appear
    expect(screen.getByText("1 actor selected")).toBeInTheDocument()
    expect(screen.getByTestId("clear-selection-button")).toBeInTheDocument()
    expect(screen.getByTestId("enrich-selected-button")).toBeInTheDocument()
  })

  it("handles select all/deselect all", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    const selectAllCheckbox = screen.getByTestId("select-all-checkbox")

    // Select all
    fireEvent.click(selectAllCheckbox)
    expect(screen.getByText("3 actors selected")).toBeInTheDocument()

    // Deselect all
    fireEvent.click(selectAllCheckbox)
    expect(screen.queryByText("actors selected")).not.toBeInTheDocument()
  })

  it("clears selection when Clear Selection button is clicked", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    // Select all actors
    const selectAllCheckbox = screen.getByTestId("select-all-checkbox")
    fireEvent.click(selectAllCheckbox)

    expect(screen.getByText("3 actors selected")).toBeInTheDocument()

    // Clear selection
    const clearButton = screen.getByTestId("clear-selection-button")
    fireEvent.click(clearButton)

    expect(screen.queryByText("actors selected")).not.toBeInTheDocument()
  })

  it("starts enrichment and navigates on success", async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ id: 123 })
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as never)

    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Select first actor
    const checkboxes = screen.getAllByTestId("actor-checkbox")
    fireEvent.click(checkboxes[0])

    // Click Enrich Selected
    const enrichButton = screen.getByTestId("enrich-selected-button")
    fireEvent.click(enrichButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        actorIds: [1],
      })
      expect(mockNavigate).toHaveBeenCalledWith("/admin/enrichment/runs/123")
    })
  })

  it("displays error message when enrichment fails", async () => {
    const mockMutateAsync = vi.fn().mockRejectedValue(new Error("Enrichment failed"))
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as never)

    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Select first actor
    const checkboxes = screen.getAllByTestId("actor-checkbox")
    fireEvent.click(checkboxes[0])

    // Click Enrich Selected
    const enrichButton = screen.getByTestId("enrich-selected-button")
    fireEvent.click(enrichButton)

    await waitFor(() => {
      expect(screen.getByText("Enrichment failed")).toBeInTheDocument()
    })
  })

  it("disables enrich button when isPending", () => {
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as never)

    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Select first actor
    const checkboxes = screen.getAllByTestId("actor-checkbox")
    fireEvent.click(checkboxes[0])

    const enrichButton = screen.getByTestId("enrich-selected-button")
    expect(enrichButton).toBeDisabled()
    expect(screen.getByText("Starting...")).toBeInTheDocument()
  })

  it("has accessible labels on checkboxes", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    const selectAllCheckbox = screen.getByTestId("select-all-checkbox")
    expect(selectAllCheckbox).toHaveAttribute("aria-label", "Select all actors")

    const actorCheckboxes = screen.getAllByTestId("actor-checkbox")
    expect(actorCheckboxes[0]).toHaveAttribute("aria-label", "Select John Doe")
    expect(actorCheckboxes[1]).toHaveAttribute("aria-label", "Select Jane Smith")
    expect(actorCheckboxes[2]).toHaveAttribute("aria-label", "Select Bob Johnson")
  })

  it("has scope attributes on table headers", () => {
    vi.mocked(useEnrichmentCandidates).mockReturnValue({
      data: mockActors,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useStartEnrichmentRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderComponent()

    const headers = screen.getAllByRole("columnheader")
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col")
    })
  })
})
