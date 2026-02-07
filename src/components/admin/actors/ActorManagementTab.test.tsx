import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { ToastProvider } from "../../../contexts/ToastContext"
import ToastContainer from "../../common/ToastContainer"
import ActorManagementTab from "./ActorManagementTab"

// Mock the hooks
vi.mock("../../../hooks/admin/useCoverage", () => ({
  useActorsForCoverage: vi.fn(),
  useCausesOfDeath: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
  useActorPreview: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}))

vi.mock("../../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useActorsForCoverage, useCausesOfDeath } from "../../../hooks/admin/useCoverage"

const mockActors = [
  {
    id: 1,
    name: "John Wayne",
    deathday: "1979-06-11",
    popularity: 45.5,
    has_detailed_death_info: true,
    cause_of_death: "Stomach cancer",
    age_at_death: 72,
    enriched_at: "2024-01-15T10:00:00Z",
  },
  {
    id: 2,
    name: "James Dean",
    deathday: "1955-09-30",
    popularity: 32.1,
    has_detailed_death_info: true,
    cause_of_death: "Car accident",
    age_at_death: 24,
    enriched_at: null,
  },
  {
    id: 3,
    name: "Marilyn Monroe",
    deathday: "1962-08-04",
    popularity: 55.8,
    has_detailed_death_info: false,
    cause_of_death: null,
    age_at_death: 36,
    enriched_at: "2024-02-01T10:00:00Z",
  },
]

const futureFlags = { v7_startTransition: true, v7_relativeSplatPath: true }

describe("ActorManagementTab", () => {
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
    vi.unstubAllGlobals()
  })

  const renderComponent = (initialPath = "/admin/actors?tab=management") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter future={futureFlags} initialEntries={[initialPath]}>
            <Routes>
              <Route path="/admin/actors" element={<ActorManagementTab />} />
            </Routes>
          </MemoryRouter>
          <ToastContainer />
        </ToastProvider>
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

    // Content appears in both mobile card view and desktop table
    expect(screen.getAllByText("John Wayne").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("James Dean").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Marilyn Monroe").length).toBeGreaterThanOrEqual(1)
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
    renderComponent("/admin/actors?tab=management&page=2")

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

    // Select an actor via mobile card checkbox
    fireEvent.click(screen.getAllByLabelText("Select John Wayne")[0])

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

    // Select John Wayne via accessible name
    fireEvent.click(screen.getAllByLabelText("Select John Wayne")[0])

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

    const selectAllCheckbox = screen.getAllByLabelText("Select all actors")[0]

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
    fireEvent.click(screen.getAllByLabelText("Select all actors")[0])

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

    // Select two actors via accessible names
    fireEvent.click(screen.getAllByLabelText("Select John Wayne")[0])
    fireEvent.click(screen.getAllByLabelText("Select James Dean")[0])

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

    // Empty state appears in both mobile and desktop views
    expect(
      screen.getAllByText("No actors match the current filters").length
    ).toBeGreaterThanOrEqual(1)
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

    // John Wayne and James Dean have detailed death info (mobile + desktop = 4)
    const checkmarks = screen.getAllByText("✓")
    expect(checkmarks).toHaveLength(4)

    // Marilyn Monroe does not (mobile + desktop = 2)
    const crosses = screen.getAllByText("✗")
    expect(crosses).toHaveLength(2)
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

    // Content appears in both mobile card view and desktop table
    expect(screen.getAllByText("Stomach cancer").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Car accident").length).toBeGreaterThanOrEqual(1)
    // Marilyn Monroe has null cause_of_death, should show dash
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1)
  })

  describe("Cause of Death Filter", () => {
    const mockCauses = [
      { value: "heart attack", label: "heart attack", count: 50 },
      { value: "cancer", label: "cancer", count: 45 },
      { value: "natural causes", label: "natural causes", count: 30 },
      { value: "car accident", label: "car accident", count: 20 },
    ]

    beforeEach(() => {
      vi.mocked(useCausesOfDeath).mockReturnValue({
        data: mockCauses,
        isLoading: false,
        error: null,
      } as never)

      vi.mocked(useActorsForCoverage).mockReturnValue({
        data: {
          items: mockActors,
          total: 3,
          totalPages: 1,
        },
        isLoading: false,
        error: null,
      } as never)
    })

    it("renders the cause filter input", () => {
      renderComponent()

      expect(screen.getByLabelText("Cause of Death")).toBeInTheDocument()
    })

    it("shows cause options when input is focused", () => {
      renderComponent()

      const causeInput = screen.getByLabelText("Cause of Death")
      fireEvent.focus(causeInput)

      // Should show causes (label and count in separate spans)
      expect(screen.getByText("heart attack")).toBeInTheDocument()
      expect(screen.getByText("(50)")).toBeInTheDocument()
      expect(screen.getByText("cancer")).toBeInTheDocument()
      expect(screen.getByText("(45)")).toBeInTheDocument()
      expect(screen.getByText("natural causes")).toBeInTheDocument()
      expect(screen.getByText("(30)")).toBeInTheDocument()
    })

    it("filters causes as user types", () => {
      renderComponent()

      const causeInput = screen.getByLabelText("Cause of Death")
      fireEvent.focus(causeInput)
      fireEvent.change(causeInput, { target: { value: "can" } })

      // Should only show matching causes
      expect(screen.getByText("cancer")).toBeInTheDocument()
      expect(screen.queryByText("heart attack")).not.toBeInTheDocument()
      expect(screen.queryByText("natural causes")).not.toBeInTheDocument()
    })

    it("selects a cause when clicking on an option", () => {
      renderComponent()

      const causeInput = screen.getByLabelText("Cause of Death")
      fireEvent.focus(causeInput)

      // Click on a cause option (the button contains both label and count spans)
      const cancerOption = screen.getByText("cancer")
      fireEvent.mouseDown(cancerOption)

      // Advance timers for URL update
      act(() => {
        vi.advanceTimersByTime(300)
      })

      // Should update URL params via useActorsForCoverage call
      const calls = vi.mocked(useActorsForCoverage).mock.calls
      const latestFilters = calls[calls.length - 1]?.[2]
      expect(latestFilters?.causeOfDeath).toBe("cancer")
    })

    it("clears cause filter when clear button is clicked", () => {
      // Start with a filter applied (via URL)
      renderComponent("/admin/actors?tab=management&causeOfDeath=cancer")

      // The clear button should be visible when there's a filter applied
      const clearButton = screen.getByRole("button", { name: "Clear cause filter" })
      fireEvent.click(clearButton)

      // Advance timers for URL update
      act(() => {
        vi.advanceTimersByTime(300)
      })

      // Should clear the filter
      const calls = vi.mocked(useActorsForCoverage).mock.calls
      const latestFilters = calls[calls.length - 1]?.[2]
      expect(latestFilters?.causeOfDeath).toBeUndefined()

      // Clear button should no longer be visible
      expect(screen.queryByRole("button", { name: "Clear cause filter" })).not.toBeInTheDocument()
    })

    it("resets pagination when cause filter changes", () => {
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
      renderComponent("/admin/actors?tab=management&page=2")

      const causeInput = screen.getByLabelText("Cause of Death")
      fireEvent.focus(causeInput)

      // Select a cause
      const cancerOption = screen.getByText("cancer")
      fireEvent.mouseDown(cancerOption)

      // Advance timers for URL update
      act(() => {
        vi.advanceTimersByTime(300)
      })

      // Page should be reset to 1
      const calls = vi.mocked(useActorsForCoverage).mock.calls
      const latestCall = calls[calls.length - 1]
      expect(latestCall[0]).toBe(1) // First arg is page number
    })

    it("hides dropdown when no causes match search", () => {
      renderComponent()

      const causeInput = screen.getByLabelText("Cause of Death")
      fireEvent.focus(causeInput)

      // Initially should show options
      expect(screen.getByText("heart attack")).toBeInTheDocument()

      // Type something that doesn't match any cause
      fireEvent.change(causeInput, { target: { value: "xyz123" } })

      // Dropdown should be hidden (no cause options visible)
      expect(screen.queryByText("heart attack")).not.toBeInTheDocument()
      expect(screen.queryByText("cancer")).not.toBeInTheDocument()
    })

    it("shows empty state when causes data is not yet loaded", () => {
      vi.mocked(useCausesOfDeath).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as never)

      renderComponent()

      const causeInput = screen.getByLabelText("Cause of Death")
      fireEvent.focus(causeInput)

      // Dropdown should not show any options
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })
  })

  describe("Biography Regeneration", () => {
    beforeEach(() => {
      vi.mocked(useActorsForCoverage).mockReturnValue({
        data: {
          items: mockActors,
          total: 3,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
        isLoading: false,
        error: null,
      } as never)
      vi.mocked(useCausesOfDeath).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as never)
    })

    it("renders regenerate biography button for each actor", () => {
      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })
      expect(regenerateButtons).toHaveLength(mockActors.length)
    })

    it("calls biography API with correct payload and credentials on button click", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: { biography: "Test bio", hasSubstantiveContent: true },
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })

      // Click regenerate for first actor (John Wayne, id: 1)
      await act(async () => {
        fireEvent.click(regenerateButtons[0])
        // Run pending timers to allow async operations
        await vi.runAllTimersAsync()
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/biographies/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actorId: 1 }),
      })
    })

    it("shows success toast when biography regeneration succeeds", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: { biography: "New biography", hasSubstantiveContent: true },
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })

      await act(async () => {
        fireEvent.click(regenerateButtons[0])
        await vi.runAllTimersAsync()
      })

      expect(screen.getByText("Biography regenerated successfully")).toBeInTheDocument()
    })

    it("shows appropriate toast when no biography content available", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            message: "No substantial TMDB biography available",
            result: { biography: null, hasSubstantiveContent: false },
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })

      await act(async () => {
        fireEvent.click(regenerateButtons[0])
        await vi.runAllTimersAsync()
      })

      expect(screen.getByText("No substantial TMDB biography available")).toBeInTheDocument()
    })

    it("shows error toast when biography regeneration fails", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Actor not found" } }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })

      await act(async () => {
        fireEvent.click(regenerateButtons[0])
        await vi.runAllTimersAsync()
      })

      expect(screen.getByText("Actor not found")).toBeInTheDocument()
    })

    it("invalidates query cache after successful biography regeneration", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: { biography: "New biography", hasSubstantiveContent: true },
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })

      await act(async () => {
        fireEvent.click(regenerateButtons[0])
        await vi.runAllTimersAsync()
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["admin", "coverage", "actors"],
      })
    })

    it("disables all regenerate buttons while regeneration is in progress", async () => {
      // Create a promise that we can control
      let resolvePromise: (value: unknown) => void
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )
      vi.stubGlobal("fetch", mockFetch)

      renderComponent()

      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })

      // Initially all buttons should be enabled
      regenerateButtons.forEach((button) => {
        expect(button).not.toBeDisabled()
      })

      // Click first button
      await act(async () => {
        fireEvent.click(regenerateButtons[0])
      })

      // All buttons should now be disabled
      const buttonsAfterClick = screen.getAllByRole("button", { name: "Regenerate biography" })
      buttonsAfterClick.forEach((button) => {
        expect(button).toBeDisabled()
      })

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              result: { biography: "Bio", hasSubstantiveContent: true },
            }),
        })
        await vi.runAllTimersAsync()
      })
    })

    it("shows spinner on clicked row and document icon on other rows during regeneration", async () => {
      let resolvePromise: (value: unknown) => void
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )
      vi.stubGlobal("fetch", mockFetch)

      renderComponent()

      // Initially all rows show document icons, no spinners
      expect(screen.getAllByTestId("biography-icon")).toHaveLength(mockActors.length)
      expect(screen.queryByTestId("biography-spinner")).not.toBeInTheDocument()

      // Click regenerate for first actor
      const regenerateButtons = screen.getAllByRole("button", { name: "Regenerate biography" })
      await act(async () => {
        fireEvent.click(regenerateButtons[0])
      })

      // Clicked row should show spinner, other rows should still show document icon
      expect(screen.getByTestId("biography-spinner")).toBeInTheDocument()
      expect(screen.getAllByTestId("biography-icon")).toHaveLength(mockActors.length - 1)

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              result: { biography: "Bio", hasSubstantiveContent: true },
            }),
        })
        await vi.runAllTimersAsync()
      })

      // After resolution, all rows should show document icons again
      expect(screen.getAllByTestId("biography-icon")).toHaveLength(mockActors.length)
      expect(screen.queryByTestId("biography-spinner")).not.toBeInTheDocument()
    })
  })
})
