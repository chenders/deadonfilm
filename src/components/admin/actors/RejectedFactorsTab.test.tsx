/**
 * Tests for RejectedFactorsTab
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import RejectedFactorsTab from "./RejectedFactorsTab"

const mockData = {
  items: [
    {
      factorName: "nepo_baby",
      factorType: "life" as const,
      occurrenceCount: 12,
      lastSeen: "2026-02-20T10:00:00Z",
      recentActors: [
        { id: 1, name: "Actor One" },
        { id: 2, name: "Actor Two" },
      ],
    },
    {
      factorName: "poisoned",
      factorType: "death" as const,
      occurrenceCount: 3,
      lastSeen: "2026-02-19T08:00:00Z",
      recentActors: [{ id: 3, name: "Actor Three" }],
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  totalPages: 1,
}

const mockUseRejectedFactors = vi.fn()

vi.mock("../../../hooks/admin/useRejectedFactors", () => ({
  useRejectedFactors: (...args: unknown[]) => mockUseRejectedFactors(...args),
}))

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RejectedFactorsTab />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("RejectedFactorsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRejectedFactors.mockReturnValue({
      data: mockData,
      isLoading: false,
      isError: false,
    })
  })

  describe("renders data", () => {
    it("displays factor names", () => {
      renderTab()
      expect(screen.getAllByText("nepo_baby")).toHaveLength(2) // mobile + desktop
      expect(screen.getAllByText("poisoned")).toHaveLength(2)
    })

    it("displays type badges", () => {
      renderTab()
      // life and death badges appear twice each (mobile + desktop)
      expect(screen.getAllByText("life")).toHaveLength(2)
      expect(screen.getAllByText("death")).toHaveLength(2)
    })

    it("displays occurrence counts", () => {
      renderTab()
      expect(screen.getAllByText("12")).toHaveLength(2)
      expect(screen.getAllByText("3")).toHaveLength(2)
    })

    it("displays actor names", () => {
      renderTab()
      // "Actor One, Actor Two" appears in both mobile and desktop
      expect(screen.getAllByText("Actor One, Actor Two")).toHaveLength(2)
      expect(screen.getAllByText("Actor Three")).toHaveLength(2)
    })
  })

  describe("loading state", () => {
    it("shows loading message when data is loading", () => {
      mockUseRejectedFactors.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      })

      renderTab()
      expect(screen.getByText("Loading rejected factors...")).toBeInTheDocument()
    })
  })

  describe("error state", () => {
    it("shows error message on fetch failure", () => {
      mockUseRejectedFactors.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      })

      renderTab()
      expect(
        screen.getByText("Failed to load rejected factors. Please try again.")
      ).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when no factors found", () => {
      mockUseRejectedFactors.mockReturnValue({
        data: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 },
        isLoading: false,
        isError: false,
      })

      renderTab()
      // Both mobile and desktop empty states
      expect(screen.getAllByText("No rejected factors found")).toHaveLength(2)
    })
  })

  describe("type filter", () => {
    it("renders filter dropdown", () => {
      renderTab()
      expect(screen.getByTestId("factor-type-filter")).toBeInTheDocument()
    })

    it("defaults to 'All Types'", () => {
      renderTab()
      const filter = screen.getByTestId("factor-type-filter") as HTMLSelectElement
      expect(filter.value).toBe("all")
    })

    it("calls hook with undefined type when 'all' is selected", () => {
      renderTab()
      expect(mockUseRejectedFactors).toHaveBeenCalledWith(1, 50, undefined)
    })

    it("calls hook with type filter when changed", () => {
      renderTab()
      const filter = screen.getByTestId("factor-type-filter")
      fireEvent.change(filter, { target: { value: "life" } })
      expect(mockUseRejectedFactors).toHaveBeenCalledWith(1, 50, "life")
    })

    it("resets page to 1 when filter changes", () => {
      mockUseRejectedFactors.mockReturnValue({
        data: { ...mockData, totalPages: 3 },
        isLoading: false,
        isError: false,
      })

      renderTab()

      // Change filter — page should reset to 1
      const filter = screen.getByTestId("factor-type-filter")
      fireEvent.change(filter, { target: { value: "death" } })
      expect(mockUseRejectedFactors).toHaveBeenLastCalledWith(1, 50, "death")
    })
  })

  describe("pagination", () => {
    it("does not show pagination when only one page", () => {
      renderTab()
      expect(screen.queryByText("Previous")).not.toBeInTheDocument()
      expect(screen.queryByText("Next")).not.toBeInTheDocument()
    })

    it("shows pagination when multiple pages exist", () => {
      mockUseRejectedFactors.mockReturnValue({
        data: { ...mockData, totalPages: 3, total: 150 },
        isLoading: false,
        isError: false,
      })

      renderTab()
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 3 (150 total)")).toBeInTheDocument()
    })
  })
})
