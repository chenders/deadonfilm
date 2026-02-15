import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import CategoryPreviewTab from "./CategoryPreviewTab"

vi.mock("../../../hooks/admin/useCauseMappings", () => ({
  useCategoryPreview: vi.fn(),
}))

import { useCategoryPreview } from "../../../hooks/admin/useCauseMappings"

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper>
        <CategoryPreviewTab />
      </AdminTestWrapper>
    </QueryClientProvider>
  )
}

describe("CategoryPreviewTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state", () => {
    vi.mocked(useCategoryPreview).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useCategoryPreview>)

    renderTab()
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders error state", () => {
    vi.mocked(useCategoryPreview).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
    } as unknown as ReturnType<typeof useCategoryPreview>)

    renderTab()
    expect(screen.getByText("Failed to load category preview")).toBeInTheDocument()
  })

  it("renders preview data with summary", () => {
    vi.mocked(useCategoryPreview).mockReturnValue({
      data: {
        entries: [
          {
            normalizedCause: "Gunshot wound",
            manner: "homicide",
            currentCategory: "other",
            proposedCategory: "homicide",
            actorCount: 42,
            changed: true,
          },
        ],
        summary: {
          totalCauses: 100,
          changedCauses: 5,
          totalActorsAffected: 42,
          movements: { "other → homicide": 3 },
        },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCategoryPreview>)

    renderTab()
    expect(screen.getByText("Gunshot wound")).toBeInTheDocument()
    expect(screen.getByText("100")).toBeInTheDocument() // totalCauses
    expect(screen.getByText("5")).toBeInTheDocument() // changedCauses
    // 42 appears both in summary and table row — use getAllByText
    expect(screen.getAllByText("42")).toHaveLength(2)
    expect(screen.getByText(/other → homicide/)).toBeInTheDocument()
  })

  it("renders empty state with changes-only message", () => {
    vi.mocked(useCategoryPreview).mockReturnValue({
      data: {
        entries: [],
        summary: { totalCauses: 100, changedCauses: 0, totalActorsAffected: 0, movements: {} },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCategoryPreview>)

    renderTab()
    expect(screen.getByText("No category changes detected")).toBeInTheDocument()
  })

  it("toggles changes-only filter", async () => {
    vi.mocked(useCategoryPreview).mockReturnValue({
      data: {
        entries: [],
        summary: { totalCauses: 0, changedCauses: 0, totalActorsAffected: 0, movements: {} },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCategoryPreview>)

    renderTab()

    // Changes-only starts checked (default true)
    const toggle = screen.getByTestId("changes-only-toggle")
    expect(toggle).toBeChecked()

    // Initially called with changesOnly=true
    expect(useCategoryPreview).toHaveBeenCalledWith(true)

    // Uncheck it
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(useCategoryPreview).toHaveBeenCalledWith(false)
    })
  })

  it("highlights changed entries", () => {
    vi.mocked(useCategoryPreview).mockReturnValue({
      data: {
        entries: [
          {
            normalizedCause: "Changed cause",
            manner: "homicide",
            currentCategory: "other",
            proposedCategory: "homicide",
            actorCount: 10,
            changed: true,
          },
        ],
        summary: { totalCauses: 1, changedCauses: 1, totalActorsAffected: 10, movements: {} },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCategoryPreview>)

    renderTab()
    expect(screen.getByText("changed")).toBeInTheDocument()
  })
})
