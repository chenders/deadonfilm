/**
 * Tests for InternalReferralsChart component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "@/test/test-utils"
import InternalReferralsChart from "./InternalReferralsChart"
import * as analyticsHooks from "../../../hooks/admin/useAnalytics"

vi.mock("../../../hooks/admin/useAnalytics")

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as any

describe("InternalReferralsChart", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper>{children}</AdminTestWrapper>
    </QueryClientProvider>
  )

  const mockData = [
    { timestamp: "2024-01-01T00:00:00Z", count: 150 },
    { timestamp: "2024-01-02T00:00:00Z", count: 200 },
    { timestamp: "2024-01-03T00:00:00Z", count: 175 },
    { timestamp: "2024-01-04T00:00:00Z", count: 225 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading state", () => {
    it("renders loading spinner when data is loading", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("Internal Referrals Over Time")).toBeInTheDocument()
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
    })
  })

  describe("error state", () => {
    it("renders error message when fetch fails", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Network error"),
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("Internal Referrals Over Time")).toBeInTheDocument()
      expect(screen.getByText("Failed to load internal referrals data")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("renders empty message when no data available", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("Internal Referrals Over Time")).toBeInTheDocument()
      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })

    it("renders empty message when data is null", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })

    it("renders empty message when data is undefined", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("No data available for the selected time period")).toBeInTheDocument()
    })
  })

  describe("data rendering", () => {
    it("renders chart with data", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("Internal Referrals Over Time")).toBeInTheDocument()
      // Total should be sum of all counts: 150 + 200 + 175 + 225 = 750
      expect(screen.getByText("750")).toBeInTheDocument()
    })

    it("displays correct total referrals count", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText(/Total:/)).toBeInTheDocument()
      expect(screen.getByText("750")).toBeInTheDocument()
    })

    it("formats large numbers with locale string", () => {
      const largeData = [
        { timestamp: "2024-01-01T00:00:00Z", count: 5000 },
        { timestamp: "2024-01-02T00:00:00Z", count: 7500 },
      ]

      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: largeData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      // Total: 12,500 (formatted with comma)
      expect(screen.getByText("12,500")).toBeInTheDocument()
    })
  })

  describe("date range props", () => {
    it("passes startDate prop to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useInternalReferralsOverTime)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart startDate="2024-01-01" />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith("2024-01-01", undefined, "day")
    })

    it("passes endDate prop to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useInternalReferralsOverTime)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart endDate="2024-01-31" />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, "2024-01-31", "day")
    })

    it("passes both date props to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useInternalReferralsOverTime)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart startDate="2024-01-01" endDate="2024-01-31" />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith("2024-01-01", "2024-01-31", "day")
    })

    it("passes granularity prop to hook", () => {
      const mockHook = vi.mocked(analyticsHooks.useInternalReferralsOverTime)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart granularity="hour" />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, undefined, "hour")
    })

    it("defaults granularity to 'day'", () => {
      const mockHook = vi.mocked(analyticsHooks.useInternalReferralsOverTime)
      mockHook.mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(mockHook).toHaveBeenCalledWith(undefined, undefined, "day")
    })
  })

  describe("chart formatting", () => {
    it("formats dates for display", () => {
      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
      } as any)

      const { container } = render(<InternalReferralsChart />, { wrapper })

      // Chart should render (ResponsiveContainer present)
      const chartContainer = container.querySelector(".recharts-responsive-container")
      expect(chartContainer).toBeInTheDocument()
    })

    it("calculates total correctly with single data point", () => {
      const singleData = [{ timestamp: "2024-01-01T00:00:00Z", count: 42 }]

      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: singleData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("42")).toBeInTheDocument()
    })

    it("handles zero counts in data", () => {
      const zeroData = [
        { timestamp: "2024-01-01T00:00:00Z", count: 0 },
        { timestamp: "2024-01-02T00:00:00Z", count: 10 },
      ]

      vi.mocked(analyticsHooks.useInternalReferralsOverTime).mockReturnValue({
        data: zeroData,
        isLoading: false,
        error: null,
      } as any)

      render(<InternalReferralsChart />, { wrapper })

      expect(screen.getByText("10")).toBeInTheDocument()
    })
  })
})
