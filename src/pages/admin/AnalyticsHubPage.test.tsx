/**
 * Tests for AnalyticsHubPage.
 * Verifies the hub renders tabs and shows the correct tab content.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AnalyticsHubPage from "./AnalyticsHubPage"

// Mock AdminLayout to avoid needing auth
vi.mock("../../components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock the tab components to isolate hub testing
vi.mock("../../components/admin/analytics/CostAnalyticsTab", () => ({
  default: () => <div data-testid="cost-analytics-tab">Cost Analytics Content</div>,
}))
vi.mock("../../components/admin/analytics/PageViewsTab", () => ({
  default: () => <div data-testid="page-views-tab">Page Views Content</div>,
}))
vi.mock("../../components/admin/analytics/CoverageTab", () => ({
  default: () => <div data-testid="coverage-tab">Coverage Content</div>,
}))
vi.mock("../../components/admin/analytics/SeoMetricsTab", () => ({
  default: () => <div data-testid="seo-metrics-tab">SEO Metrics Content</div>,
}))

describe("AnalyticsHubPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = (initialRoute = "/admin/analytics") =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <AnalyticsHubPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

  it("renders page header", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /analytics/i })).toBeInTheDocument()
    expect(
      screen.getByText(/track costs, page views, death coverage, and SEO metrics/i)
    ).toBeInTheDocument()
  })

  it("renders all four tabs", () => {
    renderPage()
    expect(screen.getByRole("tab", { name: /cost analytics/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /page views/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /death coverage/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /seo metrics/i })).toBeInTheDocument()
  })

  it("shows cost analytics tab by default", () => {
    renderPage()
    expect(screen.getByTestId("cost-analytics-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("page-views-tab")).not.toBeInTheDocument()
    expect(screen.queryByTestId("coverage-tab")).not.toBeInTheDocument()
  })

  it("switches to page views tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /page views/i }))
    expect(screen.queryByTestId("cost-analytics-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("page-views-tab")).toBeInTheDocument()
  })

  it("switches to coverage tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /death coverage/i }))
    expect(screen.queryByTestId("cost-analytics-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("coverage-tab")).toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=page-views", () => {
    renderPage("/admin/analytics?tab=page-views")
    expect(screen.getByTestId("page-views-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("cost-analytics-tab")).not.toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=coverage", () => {
    renderPage("/admin/analytics?tab=coverage")
    expect(screen.getByTestId("coverage-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("cost-analytics-tab")).not.toBeInTheDocument()
  })
})
