import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import ActorManagementPage from "./ActorManagementPage"

// Mock the hooks
vi.mock("../../hooks/admin/useCoverage", () => ({
  useActorsForCoverage: vi.fn(),
}))

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useActorsForCoverage } from "../../hooks/admin/useCoverage"

const mockActors = [
  {
    id: 1,
    name: "John Wayne",
    deathday: "1979-06-11",
    popularity: 45.5,
    has_detailed_death_info: true,
    cause_of_death: "Stomach cancer",
  },
  {
    id: 2,
    name: "James Dean",
    deathday: "1955-09-30",
    popularity: 32.1,
    has_detailed_death_info: true,
    cause_of_death: "Car accident",
  },
  {
    id: 3,
    name: "Marilyn Monroe",
    deathday: "1962-08-04",
    popularity: 55.8,
    has_detailed_death_info: false,
    cause_of_death: null,
  },
]

const futureFlags = { v7_startTransition: true, v7_relativeSplatPath: true }

describe("ActorManagementPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderComponent = (initialPath = "/admin/actors") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={futureFlags} initialEntries={[initialPath]}>
          <Routes>
            <Route path="/admin/actors" element={<ActorManagementPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    renderComponent()
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
  })

  it("renders error state", () => {
    const error = new Error("Failed to load actors")
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    } as never)

    renderComponent()
    expect(screen.getByText("Failed to load actors. Please try again later.")).toBeInTheDocument()
  })

  it("renders actor list successfully", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByRole("heading", { name: "Actor Management" })).toBeInTheDocument()
    expect(screen.getByText("John Wayne")).toBeInTheDocument()
    expect(screen.getByText("James Dean")).toBeInTheDocument()
    expect(screen.getByText("Marilyn Monroe")).toBeInTheDocument()
    expect(screen.getByText("3 actors found")).toBeInTheDocument()
  })

  it("updates search input immediately on typing", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    const searchInput = screen.getByLabelText("Name Search")
    fireEvent.change(searchInput, { target: { value: "John" } })

    // Input value should update immediately
    expect(searchInput).toHaveValue("John")
  })

  it("debounces URL update - URL does not change immediately", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    const searchInput = screen.getByLabelText("Name Search")
    fireEvent.change(searchInput, { target: { value: "test" } })

    // Input value should update immediately
    expect(searchInput).toHaveValue("test")

    // The useActorsForCoverage should still be called with empty searchName
    // (since URL hasn't updated yet due to debouncing)
    const calls = vi.mocked(useActorsForCoverage).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const latestFilters = calls[calls.length - 1]?.[2]
    expect(latestFilters?.searchName).toBeUndefined()
  })

  it("updates URL after debounce delay", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    const searchInput = screen.getByLabelText("Name Search")

    act(() => {
      fireEvent.change(searchInput, { target: { value: "Wayne" } })
    })

    // Advance timer past debounce delay
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // After debounce, useActorsForCoverage should be called with the search value
    const calls = vi.mocked(useActorsForCoverage).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const latestFilters = calls[calls.length - 1]?.[2]
    expect(latestFilters?.searchName).toBe("Wayne")
  })

  it("resets pagination to page 1 when search changes", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 150,
        totalPages: 3,
      },
      isLoading: false,
      error: null,
    } as never)

    // Start on page 2
    renderComponent("/admin/actors?page=2")

    const searchInput = screen.getByLabelText("Name Search")

    act(() => {
      fireEvent.change(searchInput, { target: { value: "test" } })
    })

    // Advance timer past debounce delay
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Page should be reset to 1
    const calls = vi.mocked(useActorsForCoverage).mock.calls
    const latestCall = calls[calls.length - 1]
    expect(latestCall[0]).toBe(1) // First arg is page number
  })

  it("clears selection when search changes", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Select an actor
    const checkboxes = screen.getAllByRole("checkbox")
    // First checkbox is select all, skip it
    fireEvent.click(checkboxes[1])

    // Verify selection is shown
    expect(screen.getByText("1 actor selected")).toBeInTheDocument()

    // Type in search box
    const searchInput = screen.getByLabelText("Name Search")
    act(() => {
      fireEvent.change(searchInput, { target: { value: "test" } })
    })

    // Advance timer past debounce delay
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Selection should be cleared (action bar should disappear)
    expect(screen.queryByText("1 actor selected")).not.toBeInTheDocument()
    expect(screen.queryByText(/actors? selected/)).not.toBeInTheDocument()
  })

  it("handles individual checkbox selection", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    const checkboxes = screen.getAllByRole("checkbox")
    // First checkbox is select all, skip it
    expect(checkboxes).toHaveLength(4) // 1 select all + 3 actors

    // Select first actor
    fireEvent.click(checkboxes[1])

    // Action bar should appear
    expect(screen.getByText("1 actor selected")).toBeInTheDocument()
    expect(screen.getByText("Clear Selection")).toBeInTheDocument()
    expect(screen.getByText("Enrich Selected")).toBeInTheDocument()
  })

  it("handles select all/deselect all", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    const checkboxes = screen.getAllByRole("checkbox")
    const selectAllCheckbox = checkboxes[0]

    // Select all
    fireEvent.click(selectAllCheckbox)
    expect(screen.getByText("3 actors selected")).toBeInTheDocument()

    // Deselect all
    fireEvent.click(selectAllCheckbox)
    expect(screen.queryByText(/actors? selected/)).not.toBeInTheDocument()
  })

  it("clears selection when Clear Selection button is clicked", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Select all actors
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0])

    expect(screen.getByText("3 actors selected")).toBeInTheDocument()

    // Clear selection
    const clearButton = screen.getByText("Clear Selection")
    fireEvent.click(clearButton)

    expect(screen.queryByText(/actors? selected/)).not.toBeInTheDocument()
  })

  it("clears selection when Clear Filters button is clicked", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // Select some actors
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    fireEvent.click(checkboxes[2])

    expect(screen.getByText("2 actors selected")).toBeInTheDocument()

    // Clear filters
    const clearFiltersButton = screen.getByText("Clear Filters")
    fireEvent.click(clearFiltersButton)

    expect(screen.queryByText(/actors? selected/)).not.toBeInTheDocument()
  })

  it("renders empty state when no actors match filters", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: [],
        total: 0,
        totalPages: 0,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("No actors match the current filters")).toBeInTheDocument()
  })

  it("renders pagination when multiple pages exist", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 150,
        totalPages: 3,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Previous")).toBeInTheDocument()
    expect(screen.getByText("Next")).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
  })

  it("does not render pagination when only one page", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("displays death page status correctly", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    // John Wayne and James Dean have detailed death info
    const checkmarks = screen.getAllByText("✓")
    expect(checkmarks).toHaveLength(2)

    // Marilyn Monroe does not
    const crosses = screen.getAllByText("✗")
    expect(crosses).toHaveLength(1)
  })

  it("displays cause of death or dash when missing", () => {
    vi.mocked(useActorsForCoverage).mockReturnValue({
      data: {
        items: mockActors,
        total: 3,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as never)

    renderComponent()

    expect(screen.getByText("Stomach cancer")).toBeInTheDocument()
    expect(screen.getByText("Car accident")).toBeInTheDocument()
    // Marilyn Monroe has null cause_of_death, should show dash
    // There may be multiple dashes for popularity too, so just check it exists
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1)
  })
})
