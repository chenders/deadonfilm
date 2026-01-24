/**
 * Tests for TopNavigationPathsTable component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import TopNavigationPathsTable from "./TopNavigationPathsTable"
import * as analyticsHooks from "../../../hooks/admin/useAnalytics"

vi.mock("../../../hooks/admin/useAnalytics")

describe("TopNavigationPathsTable", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
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
      visited_path: "/cursed-movies",
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

      expect(screen.getByText("From")).toBeInTheDocument()
      expect(screen.getByText("To")).toBeInTheDocument()
      expect(screen.getByText("Count")).toBeInTheDocument()
      expect(screen.getByText("%")).toBeInTheDocument()
      expect(screen.getByText("Volume")).toBeInTheDocument()
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

      expect(screen.getByText("/movie/inception-2010-27205")).toBeInTheDocument()
      expect(screen.getByText("/cursed-movies")).toBeInTheDocument()
    })

    it("renders counts with locale formatting", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getByText("150")).toBeInTheDocument()
      expect(screen.getByText("100")).toBeInTheDocument()
      expect(screen.getByText("75")).toBeInTheDocument()
    })

    it("renders percentages with correct format", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<TopNavigationPathsTable />, { wrapper })

      expect(screen.getByText("30.0%")).toBeInTheDocument()
      expect(screen.getByText("20.0%")).toBeInTheDocument()
      expect(screen.getByText("15.0%")).toBeInTheDocument()
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

      expect(screen.getByText("5,000")).toBeInTheDocument()
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

      // Should have 3 volume bars (one per row)
      const volumeBars = container.querySelectorAll(".bg-blue-500")
      expect(volumeBars).toHaveLength(3)
    })

    it("calculates volume bar width correctly", () => {
      vi.mocked(analyticsHooks.useNavigationPaths).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<TopNavigationPathsTable />, { wrapper })

      const volumeBars = container.querySelectorAll(".bg-blue-500")

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

      expect(screen.getByText("/search?q=test&type=movie")).toBeInTheDocument()
      expect(screen.getByText("/movie/the-matrix-1999-603#cast")).toBeInTheDocument()
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

      // Use getByText with regex to find the percentage
      expect(screen.getByText(/100\.0%/)).toBeInTheDocument()
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

      expect(screen.getByText("0")).toBeInTheDocument()
      expect(screen.getByText("0.0%")).toBeInTheDocument()
    })
  })
})
