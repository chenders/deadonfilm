import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../test/test-utils"
import ActorEditorPage from "./ActorEditorPage"

// Mock useParams
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

// Mock useAdminAuth to avoid requiring AdminAuthProvider
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
  }),
}))

// Mock useActorEditor hook
vi.mock("../../hooks/admin/useActorEditor", () => ({
  useActorEditor: vi.fn(),
}))

import { useParams } from "react-router-dom"
import { useActorEditor } from "../../hooks/admin/useActorEditor"

// Helper to create mock return value with proper typing
function createMockEditorReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    actor: undefined,
    circumstances: undefined,
    dataQualityIssues: [],
    recentHistory: [],
    editableFields: { actor: [], circumstances: [] },
    updateActor: vi.fn(),
    updateActorAsync: vi.fn(),
    isUpdating: false,
    updateError: null,
    lastUpdateResult: undefined,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useActorEditor>
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
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper>{ui}</AdminTestWrapper>
    </QueryClientProvider>
  )
}

const mockActorData = {
  actor: {
    id: 123,
    tmdb_id: 456,
    name: "John Wayne",
    birthday: "1907-05-26",
    deathday: "1979-06-11",
    cause_of_death: "Stomach cancer",
    profile_path: "/path.jpg",
    is_obscure: false,
    tmdb_popularity: "25.5",
    dof_popularity: "80.0",
    age_at_death: 72,
    expected_lifespan: "75.5",
    years_lost: "3.5",
    enriched_at: "2024-01-15T10:00:00Z",
    enrichment_source: "claude",
    created_at: "2023-06-01T00:00:00Z",
  },
  circumstances: {
    id: 1,
    actor_id: 123,
    circumstances: "Died peacefully at home",
    circumstances_confidence: "high",
  },
  dataQualityIssues: [] as Array<{ field: string; issue: string; severity: "error" | "warning" }>,
  recentHistory: [
    {
      field_name: "cause_of_death",
      old_value: "Cancer",
      new_value: "Stomach cancer",
      source: "admin-manual-edit",
      created_at: "2024-01-15T10:00:00Z",
    },
  ],
  editableFields: {
    actor: ["name", "birthday", "deathday", "cause_of_death"],
    circumstances: ["circumstances"],
  },
}

describe("ActorEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useParams).mockReturnValue({ id: "123" })
  })

  it("renders loading state initially", async () => {
    vi.mocked(useActorEditor).mockReturnValue(createMockEditorReturn({ isLoading: true }))

    renderWithProviders(<ActorEditorPage />)

    // Should show loading skeleton
    const loadingElements = document.querySelectorAll(".animate-pulse")
    expect(loadingElements.length).toBeGreaterThan(0)
  })

  it("renders actor data when loaded", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        dataQualityIssues: mockActorData.dataQualityIssues,
        recentHistory: mockActorData.recentHistory,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText(/Edit: John Wayne/)).toBeInTheDocument()
    expect(screen.getByText(/ID: 123/)).toBeInTheDocument()
    expect(screen.getByText(/TMDB: 456/)).toBeInTheDocument()
  })

  it("renders tabs for Basic Info, Death Info, and Circumstances", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText("Basic Info")).toBeInTheDocument()
    expect(screen.getByText("Death Info")).toBeInTheDocument()
    expect(screen.getByText("Circumstances")).toBeInTheDocument()
  })

  it("switches tabs when clicked", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    // Click Death Info tab
    fireEvent.click(screen.getByText("Death Info"))

    // Should show death-related fields
    expect(screen.getByLabelText("Death Date")).toBeInTheDocument()
    expect(screen.getByLabelText("Cause of Death")).toBeInTheDocument()
  })

  it("shows data quality issues when present", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        dataQualityIssues: [
          {
            field: "deathday",
            issue: "Death date confidence: conflicting",
            severity: "error" as const,
          },
          {
            field: "circumstances",
            issue: 'Contains uncertainty marker: "reportedly"',
            severity: "warning" as const,
          },
        ],
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText("Data Quality Issues")).toBeInTheDocument()
    expect(screen.getByText(/Death date confidence: conflicting/)).toBeInTheDocument()
  })

  it("shows read-only information section", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText("Read-only Information")).toBeInTheDocument()
    expect(screen.getByText("TMDB Popularity")).toBeInTheDocument()
    expect(screen.getByText("25.5")).toBeInTheDocument()
    expect(screen.getByText("DOF Popularity")).toBeInTheDocument()
    expect(screen.getByText("80.0")).toBeInTheDocument()
  })

  it("shows error state when fetch fails", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        isError: true,
        error: new Error("Actor not found"),
      })
    )

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText("Actor not found")).toBeInTheDocument()
    expect(screen.getByText("Back to Actor Management")).toBeInTheDocument()
  })

  it("shows invalid actor ID message when ID is not a number", () => {
    vi.mocked(useParams).mockReturnValue({ id: "invalid" })
    vi.mocked(useActorEditor).mockReturnValue(createMockEditorReturn())

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText("Invalid actor ID")).toBeInTheDocument()
  })

  it("tracks pending changes and shows unsaved changes count", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    expect(screen.getByText("No changes")).toBeInTheDocument()

    // Change a field
    const nameInput = screen.getByLabelText("Name")
    fireEvent.change(nameInput, { target: { value: "New Name" } })

    expect(screen.getByText(/1 unsaved changes/)).toBeInTheDocument()
  })

  it("enables save button when there are changes", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    // Initially disabled
    expect(screen.getByText("Save Changes")).toBeDisabled()

    // Change a field
    const nameInput = screen.getByLabelText("Name")
    fireEvent.change(nameInput, { target: { value: "New Name" } })

    // Now enabled
    expect(screen.getByText("Save Changes")).not.toBeDisabled()
  })

  it("resets changes when Reset button is clicked", async () => {
    vi.mocked(useActorEditor).mockReturnValue(
      createMockEditorReturn({
        actor: mockActorData.actor,
        circumstances: mockActorData.circumstances,
        editableFields: mockActorData.editableFields,
      })
    )

    renderWithProviders(<ActorEditorPage />)

    // Change a field
    const nameInput = screen.getByLabelText("Name")
    fireEvent.change(nameInput, { target: { value: "New Name" } })

    expect(screen.getByText(/1 unsaved changes/)).toBeInTheDocument()

    // Click Reset
    fireEvent.click(screen.getByText("Reset"))

    expect(screen.getByText("No changes")).toBeInTheDocument()
  })
})
