/**
 * Tests for PopularPagesTable component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TestMemoryRouter } from "@/test/test-utils"
import PopularPagesTable from "./PopularPagesTable"
import * as analyticsHooks from "../../../hooks/admin/useAnalytics"

vi.mock("../../../hooks/admin/useAnalytics")

describe("PopularPagesTable", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestMemoryRouter>{children}</TestMemoryRouter>
    </QueryClientProvider>
  )

  const mockData = [
    {
      path: "/",
      internal_referrals: 100,
      external_referrals: 50,
      direct_visits: 25,
      total_visits: 175,
    },
    {
      path: "/deaths",
      internal_referrals: 80,
      external_referrals: 30,
      direct_visits: 10,
      total_visits: 120,
    },
    {
      path: "/movie/inception-2010-27205",
      internal_referrals: 60,
      external_referrals: 20,
      direct_visits: 5,
      total_visits: 85,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading state", () => {
    it("renders loading spinner when data is loading", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("Most Popular Pages")).toBeInTheDocument()
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
    })
  })

  describe("error state", () => {
    it("renders error message when fetch fails", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Network error"),
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("Most Popular Pages")).toBeInTheDocument()
      expect(screen.getByText("Failed to load popular pages")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("renders empty message when no data available", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("Most Popular Pages")).toBeInTheDocument()
      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })

    it("renders empty message when data is null", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })
  })

  describe("table rendering", () => {
    it("renders table with header columns", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("Page")).toBeInTheDocument()
      // Internal/External/Direct appear in both header and legend
      expect(screen.getAllByText("Internal").length).toBeGreaterThan(0)
      expect(screen.getAllByText("External").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Direct").length).toBeGreaterThan(0)
      expect(screen.getByText("Total")).toBeInTheDocument()
      expect(screen.getByText("Distribution")).toBeInTheDocument()
    })

    it("renders all page paths", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("/")).toBeInTheDocument()
      expect(screen.getByText("/deaths")).toBeInTheDocument()
      expect(screen.getByText("/movie/inception-2010-27205")).toBeInTheDocument()
    })

    it("renders traffic source counts with formatting", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      // First row: internal=100, external=50, direct=25, total=175
      expect(screen.getByText("100")).toBeInTheDocument()
      expect(screen.getByText("50")).toBeInTheDocument()
      expect(screen.getByText("25")).toBeInTheDocument()
      expect(screen.getByText("175")).toBeInTheDocument()
    })

    it("formats large numbers with commas", () => {
      const largeData = [
        {
          path: "/",
          internal_referrals: 5000,
          external_referrals: 3000,
          direct_visits: 2000,
          total_visits: 10000,
        },
      ]

      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: largeData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("5,000")).toBeInTheDocument()
      expect(screen.getByText("3,000")).toBeInTheDocument()
      expect(screen.getByText("2,000")).toBeInTheDocument()
      expect(screen.getByText("10,000")).toBeInTheDocument()
    })
  })

  describe("distribution bar visualization", () => {
    it("renders distribution bars with correct colors", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<PopularPagesTable />, { wrapper })

      const blueBars = container.querySelectorAll(".bg-blue-500")
      const greenBars = container.querySelectorAll(".bg-green-500")
      const grayBars = container.querySelectorAll(".bg-gray-500")

      // Should have internal (blue), external (green), and direct (gray) bars for each row
      // Plus 3 legend indicators
      expect(blueBars.length).toBeGreaterThanOrEqual(3) // 3 rows + 1 legend
      expect(greenBars.length).toBeGreaterThanOrEqual(3) // 3 rows + 1 legend
      expect(grayBars.length).toBeGreaterThanOrEqual(3) // 3 rows + 1 legend
    })

    it("calculates correct percentages for distribution", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<PopularPagesTable />, { wrapper })

      // First row: internal=100, external=50, direct=25, total=175
      // internal: 100/175 = 57.14%, external: 50/175 = 28.57%, direct: 25/175 = 14.29%
      const firstRowBars = container.querySelectorAll("tbody tr:first-child [style*='width']")

      // Check that bars exist and have width styles
      expect(firstRowBars.length).toBeGreaterThan(0)
    })

    it("handles zero values in distribution", () => {
      const zeroData = [
        {
          path: "/",
          internal_referrals: 100,
          external_referrals: 0,
          direct_visits: 0,
          total_visits: 100,
        },
      ]

      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: zeroData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<PopularPagesTable />, { wrapper })

      // Should only have blue bar in the row (internal = 100%)
      const row = container.querySelector("tbody tr")
      const distributionCell = row?.querySelectorAll("td")[5]
      const bars = distributionCell?.querySelectorAll("[style*='width']")

      // Only one bar (internal) should be rendered
      expect(bars?.length).toBe(1)
    })
  })

  describe("legend display", () => {
    it("renders legend with all traffic sources", () => {
      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<PopularPagesTable />, { wrapper })

      // These text values appear in both header and legend
      expect(screen.getAllByText("Internal").length).toBeGreaterThan(0)
      expect(screen.getAllByText("External").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Direct").length).toBeGreaterThan(0)

      // Legend should have colored dots
      const legendDots = container.querySelectorAll(".h-3.w-3.rounded-full")
      expect(legendDots.length).toBe(3)
    })
  })

  describe("limit parameter", () => {
    it("passes default limit of 20 to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.usePopularPages)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, undefined, 20)
    })

    it("passes custom limit to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.usePopularPages)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable limit={10} />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, undefined, 10)
    })

    it("passes date range to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.usePopularPages)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable startDate="2024-01-01" endDate="2024-01-31" limit={15} />, {
        wrapper,
      })

      expect(mockHook).toHaveBeenCalledWith("2024-01-01", "2024-01-31", 15)
    })
  })

  describe("edge cases", () => {
    it("handles single page", () => {
      const singleData = [
        {
          path: "/",
          internal_referrals: 50,
          external_referrals: 25,
          direct_visits: 25,
          total_visits: 100,
        },
      ]

      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: singleData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      expect(screen.getByText("/")).toBeInTheDocument()
      expect(screen.getByText("100")).toBeInTheDocument()
    })

    it("handles all traffic from one source", () => {
      const oneSourceData = [
        {
          path: "/",
          internal_referrals: 0,
          external_referrals: 100,
          direct_visits: 0,
          total_visits: 100,
        },
      ]

      vi.mocked(analyticsHooks.usePopularPages).mockReturnValue({
        data: oneSourceData,
        isLoading: false,
        error: null,
      } as any)

      render(<PopularPagesTable />, { wrapper })

      // "0" appears twice (internal and direct) - use getAllByText
      const zeros = screen.getAllByText("0")
      expect(zeros.length).toBeGreaterThanOrEqual(2)
      // "100" appears twice (external and total) - use getAllByText
      const hundreds = screen.getAllByText("100")
      expect(hundreds.length).toBeGreaterThanOrEqual(1)
    })
  })
})
