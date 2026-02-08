/**
 * Tests for SeoMetricsTab component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../../test/test-utils"
import SeoMetricsTab from "./SeoMetricsTab"

vi.mock("../../../hooks/admin/useGsc", () => ({
  useGscStatus: vi.fn(),
  useSearchPerformance: vi.fn(),
  useTopQueries: vi.fn(),
  useTopPages: vi.fn(),
  usePageTypePerformance: vi.fn(),
  useSitemaps: vi.fn(),
  useIndexingStatus: vi.fn(),
  useGscAlerts: vi.fn(),
  useGscSnapshot: vi.fn(),
  useInspectUrl: vi.fn(),
  useAcknowledgeAlert: vi.fn(),
}))

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never

import {
  useGscStatus,
  useSearchPerformance,
  useTopQueries,
  useTopPages,
  usePageTypePerformance,
  useSitemaps,
  useIndexingStatus,
  useGscAlerts,
  useGscSnapshot,
  useInspectUrl,
  useAcknowledgeAlert,
} from "../../../hooks/admin/useGsc"

const mockPerformance = {
  source: "api" as const,
  startDate: "2024-01-01",
  endDate: "2024-01-30",
  data: [
    { date: "2024-01-01", clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 },
    { date: "2024-01-02", clicks: 15, impressions: 120, ctr: 0.125, position: 4.8 },
  ],
  totals: { clicks: 25, impressions: 220, ctr: 0.114, position: 5.1 },
}

const mockTopQueries = {
  source: "api" as const,
  startDate: "2024-01-01",
  endDate: "2024-01-30",
  data: [
    { query: "dead on film", clicks: 50, impressions: 200, ctr: 0.25, position: 2.1 },
    { query: "actor deaths movies", clicks: 30, impressions: 150, ctr: 0.2, position: 3.5 },
  ],
}

const mockTopPages = {
  source: "api" as const,
  startDate: "2024-01-01",
  endDate: "2024-01-30",
  data: [
    {
      page_url: "https://deadonfilm.com/actor/test-1",
      clicks: 20,
      impressions: 100,
      ctr: 0.2,
      position: 3,
    },
  ],
}

const mockPageTypes = {
  source: "api" as const,
  startDate: "2024-01-01",
  endDate: "2024-01-30",
  data: {
    actor: { clicks: 100, impressions: 500, ctr: 0.2, position: 4 },
    movie: { clicks: 50, impressions: 300, ctr: 0.17, position: 5 },
  },
}

function setupMocksConfigured() {
  vi.mocked(useGscStatus).mockReturnValue({
    data: { configured: true, siteUrl: "sc-domain:deadonfilm.com" },
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useSearchPerformance).mockReturnValue({
    data: mockPerformance,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useTopQueries).mockReturnValue({
    data: mockTopQueries,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useTopPages).mockReturnValue({
    data: mockTopPages,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(usePageTypePerformance).mockReturnValue({
    data: mockPageTypes,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useSitemaps).mockReturnValue({
    data: { configured: true, data: [] },
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useIndexingStatus).mockReturnValue({
    data: { startDate: "2024-01-01", endDate: "2024-03-31", data: [] },
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useGscAlerts).mockReturnValue({
    data: { data: [] },
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useGscSnapshot).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)
  vi.mocked(useInspectUrl).mockReturnValue({
    mutate: vi.fn(),
    data: undefined,
    isPending: false,
    isError: false,
  } as never)
  vi.mocked(useAcknowledgeAlert).mockReturnValue({
    mutate: vi.fn(),
  } as never)
}

function setupMocksNotConfigured() {
  vi.mocked(useGscStatus).mockReturnValue({
    data: { configured: false, siteUrl: null },
    isLoading: false,
    error: null,
  } as never)
  // Other hooks still need to be mocked to avoid errors
  vi.mocked(useSearchPerformance).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useTopQueries).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useTopPages).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(usePageTypePerformance).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useSitemaps).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useIndexingStatus).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useGscAlerts).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(useGscSnapshot).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useInspectUrl).mockReturnValue({
    mutate: vi.fn(),
    data: undefined,
    isPending: false,
    isError: false,
  } as never)
  vi.mocked(useAcknowledgeAlert).mockReturnValue({ mutate: vi.fn() } as never)
}

describe("SeoMetricsTab", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  const renderTab = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AdminTestWrapper>
          <SeoMetricsTab />
        </AdminTestWrapper>
      </QueryClientProvider>
    )

  it("shows not configured message when GSC is not set up", () => {
    setupMocksNotConfigured()
    renderTab()
    expect(screen.getByText("Google Search Console Not Configured")).toBeInTheDocument()
    expect(screen.getByText("GSC_SERVICE_ACCOUNT_EMAIL")).toBeInTheDocument()
  })

  it("renders search performance stats when configured", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByText("Search Performance")).toBeInTheDocument()
    expect(screen.getByText("25")).toBeInTheDocument() // Total clicks
    expect(screen.getByText("220")).toBeInTheDocument() // Total impressions
  })

  it("renders top queries table", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByText("Top Queries")).toBeInTheDocument()
    expect(screen.getByText("dead on film")).toBeInTheDocument()
    expect(screen.getByText("actor deaths movies")).toBeInTheDocument()
  })

  it("renders top pages table", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByText("Top Pages")).toBeInTheDocument()
  })

  it("renders page type performance section", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByText("Performance by Page Type")).toBeInTheDocument()
    expect(screen.getByText("Actors")).toBeInTheDocument()
    expect(screen.getByText("Movies")).toBeInTheDocument()
  })

  it("renders URL inspection section", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByText("URL Inspection")).toBeInTheDocument()
    expect(screen.getByTestId("gsc-inspect-url-input")).toBeInTheDocument()
    expect(screen.getByTestId("gsc-inspect-url-button")).toBeInTheDocument()
  })

  it("shows Live API badge when data source is API", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByText("Live API")).toBeInTheDocument()
  })

  it("allows switching date range", () => {
    setupMocksConfigured()
    renderTab()

    const button7 = screen.getByText("7 days")
    const button90 = screen.getByText("90 days")

    fireEvent.click(button7)
    expect(useSearchPerformance).toHaveBeenCalledWith(7, true)

    fireEvent.click(button90)
    expect(useSearchPerformance).toHaveBeenCalledWith(90, true)
  })

  it("renders Save Snapshot button", () => {
    setupMocksConfigured()
    renderTab()
    expect(screen.getByTestId("gsc-snapshot-button")).toBeInTheDocument()
    expect(screen.getByTestId("gsc-snapshot-button")).toHaveTextContent("Save Snapshot")
  })

  it("renders alerts when present", () => {
    setupMocksConfigured()
    vi.mocked(useGscAlerts).mockReturnValue({
      data: {
        data: [
          {
            id: 1,
            alert_type: "indexing_drop",
            severity: "warning",
            message: "Indexed pages dropped by 15%",
            details: {},
            acknowledged: false,
            acknowledged_at: null,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    renderTab()
    expect(screen.getByText("SEO Alerts (1)")).toBeInTheDocument()
    expect(screen.getByText("Indexed pages dropped by 15%")).toBeInTheDocument()
  })

  it("renders indexing empty state when no data", () => {
    setupMocksConfigured()
    renderTab()
    expect(
      screen.getByText('No indexing data yet. Click "Save Snapshot" to start tracking.')
    ).toBeInTheDocument()
  })

  it("renders indexing data when available", () => {
    setupMocksConfigured()
    vi.mocked(useIndexingStatus).mockReturnValue({
      data: {
        startDate: "2024-01-01",
        endDate: "2024-03-31",
        data: [
          {
            date: "2024-01-01",
            total_submitted: 1200,
            total_indexed: 1080,
            index_details: {},
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    renderTab()
    expect(screen.getByText("Indexing Health")).toBeInTheDocument()
    expect(screen.getByText("1,200")).toBeInTheDocument() // submitted
    expect(screen.getByText("1,080")).toBeInTheDocument() // indexed
    expect(screen.getByText("90.0%")).toBeInTheDocument() // index rate
  })
})
