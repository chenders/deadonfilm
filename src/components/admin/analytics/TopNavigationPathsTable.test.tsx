/**
 * Tests for TopNavigationPathsTable component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "@/test/test-utils"
import TopNavigationPathsTable from "./TopNavigationPathsTable"
import * as analyticsHooks from "../../../hooks/admin/useAnalytics"

vi.mock("../../../hooks/admin/useAnalytics")

describe("TopNavigationPathsTable", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper>{children}</AdminTestWrapper>
    </QueryClientProvider>
  )

  const mockData = [
    {
      referrer_path: "/",
      visited_path: "/deaths",
      count: 150,
      percentage: 30.0,
    },
    {
      referrer_path: "/deaths",
      visited_path: "/movie/inception-2010-27205",
      count: 100,
      percentage: 20.0,
    },
    {
      referrer_path: "/",
      visited_path: "/forever-young",
      count: 75,
      percentage: 15.0,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading state", () => {
    it("renders loading spinner when data is loading", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getByText("Top Navigation Paths")).toBeInTheDocument()
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
    })
  })

  describe("error state", () => {
    it("renders error message when fetch fails", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Network error"),
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getByText("Top Navigation Paths")).toBeInTheDocument()
      expect(screen.getByText("Failed to load navigation paths")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("renders empty message when no data available", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getByText("Top Navigation Paths")).toBeInTheDocument()
      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })

    it("renders empty message when data is null", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })
  })

  describe("table rendering", () => {
    it("renders table with header columns", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      const table = screen.getByRole("table")
      const tableScope = within(table)
      expect(tableScope.getByText("From")).toBeInTheDocument()
      expect(tableScope.getByText("To")).toBeInTheDocument()
      expect(tableScope.getByText("Count")).toBeInTheDocument()
      expect(tableScope.getByText("%")).toBeInTheDocument()
      expect(tableScope.getByText("Volume")).toBeInTheDocument()
    })

    it("renders all navigation paths", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      // "/" appears multiple times (as referrer), so use getAllByText
      const homePaths = screen.getAllByText("/")
      expect(homePaths.length).toBeGreaterThan(0)

      // "/deaths" appears twice (as referrer and destination)
      const deathsPaths = screen.getAllByText("/deaths")
      expect(deathsPaths.length).toBeGreaterThan(0)

      expect(screen.getAllByText("/movie/inception-2010-27205").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("/forever-young").length).toBeGreaterThanOrEqual(1)
    })

    it("renders counts with locale formatting", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      const table = screen.getByRole("table")
      const tableScope = within(table)
      expect(tableScope.getByText("150")).toBeInTheDocument()
      expect(tableScope.getByText("100")).toBeInTheDocument()
      expect(tableScope.getByText("75")).toBeInTheDocument()
    })

    it("renders percentages with correct format", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getAllByText("30.0%").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("20.0%").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("15.0%").length).toBeGreaterThanOrEqual(1)
    })

    it("formats large numbers with commas", () => {
      const largeData = [
        {
          referrer_path: "/",
          visited_path: "/deaths",
          count: 5000,
          percentage: 50.0,
        },
      ]

      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: largeData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getAllByText("5,000").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("volume bar visualization", () => {
    it("renders volume bars for each path", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<TopNavigationPathsTable />, { wrapper })

      // Should have 3 volume bars (one per row) - selected by h-4 rounded-full with inline style
      const volumeBars = container.querySelectorAll(".h-4.rounded-full[style*='background-color']")
      expect(volumeBars).toHaveLength(3)
    })

    it("calculates volume bar width correctly", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<TopNavigationPathsTable />, { wrapper })

      const volumeBars = container.querySelectorAll(".h-4.rounded-full[style*='background-color']")

      // Verify bars have width styles set (exact values calculated by component)
      const firstBarWidth = (volumeBars[0] as HTMLElement).style.width
      const secondBarWidth = (volumeBars[1] as HTMLElement).style.width
      const thirdBarWidth = (volumeBars[2] as HTMLElement).style.width

      // First bar (count=150, max=150): should be 100%
      expect(firstBarWidth).toBe("100%")

      // Second bar (count=100, max=150): should be ~66.67%
      expect(parseFloat(secondBarWidth)).toBeCloseTo(66.67, 1)

      // Third bar (count=75, max=150): should be 50%
      expect(thirdBarWidth).toBe("50%")
    })
  })

  describe("limit parameter", () => {
    it("passes default limit of 20 to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useNavigationPaths)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, undefined, 20)
    })

    it("passes custom limit to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useNavigationPaths)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable limit={10} />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, undefined, 10)
    })

    it("passes date range to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useNavigationPaths)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable startDate="2024-01-01" endDate="2024-01-31" limit={15} />, {
        wrapper,
      })

      expect(mockHook).toHaveBeenCalledWith("2024-01-01", "2024-01-31", 15)
    })
  })

  describe("path display", () => {
    it("renders paths in code blocks", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<TopNavigationPathsTable />, { wrapper })

      const codeBlocks = container.querySelectorAll("code")
      // 2 code blocks per row (from + to) × 3 rows = 6 code blocks
      expect(codeBlocks.length).toBeGreaterThanOrEqual(6)
    })

    it("handles special characters in paths", () => {
      const specialData = [
        {
          referrer_path: "/search?q=test&type=movie",
          visited_path: "/movie/the-matrix-1999-603#cast",
          count: 50,
          percentage: 10.0,
        },
      ]

      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: specialData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getAllByText("/search?q=test&type=movie").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("/movie/the-matrix-1999-603#cast").length).toBeGreaterThanOrEqual(
        1
      )
    })
  })

  describe("edge cases", () => {
    it("handles single data point", () => {
      const singleData = [
        {
          referrer_path: "/",
          visited_path: "/deaths",
          count: 100,
          percentage: 100.0,
        },
      ]

      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: singleData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      // Use getAllByText with regex to find the percentage (appears in both mobile and desktop)
      expect(screen.getAllByText(/100\.0%/).length).toBeGreaterThanOrEqual(1)
    })

    it("handles zero counts gracefully", () => {
      const zeroData = [
        {
          referrer_path: "/",
          visited_path: "/deaths",
          count: 0,
          percentage: 0.0,
        },
      ]

      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: zeroData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("0.0%").length).toBeGreaterThanOrEqual(1)
    })
  })
})
