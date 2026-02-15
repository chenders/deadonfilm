/**
 * Tests for ActorHubPage.
 * Verifies the hub renders tabs and shows the correct tab content.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ActorHubPage from "./ActorHubPage"

// Mock AdminLayout to avoid needing auth
vi.mock("../../components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock the tab components to isolate hub testing
vi.mock("../../components/admin/actors/ActorManagementTab", () => ({
  default: () => <div data-testid="management-tab">Actor Management Content</div>,
}))
vi.mock("../../components/admin/actors/ActorDiagnosticTab", () => ({
  default: () => <div data-testid="diagnostic-tab">Actor Diagnostic Content</div>,
}))
vi.mock("../../components/admin/actors/BiographiesTab", () => ({
  default: () => <div data-testid="biographies-tab">Biographies Content</div>,
}))
vi.mock("../../components/admin/actors/DataQualityTab", () => ({
  default: () => <div data-testid="data-quality-tab">Data Quality Content</div>,
}))
vi.mock("../../components/admin/actors/PopularityTab", () => ({
  default: () => <div data-testid="popularity-tab">Popularity Content</div>,
}))

describe("ActorHubPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = (initialRoute = "/admin/actors") =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <ActorHubPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

  it("renders page header", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /actors/i })).toBeInTheDocument()
    expect(
      screen.getByText(/manage actors, diagnostics, biographies, data quality, and popularity/i)
    ).toBeInTheDocument()
  })

  it("renders all five tabs", () => {
    renderPage()
    expect(screen.getByRole("tab", { name: /management/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /diagnostic/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /biographies/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /data quality/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /popularity/i })).toBeInTheDocument()
  })

  it("shows management tab by default", () => {
    renderPage()
    expect(screen.getByTestId("management-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("diagnostic-tab")).not.toBeInTheDocument()
    expect(screen.queryByTestId("biographies-tab")).not.toBeInTheDocument()
    expect(screen.queryByTestId("data-quality-tab")).not.toBeInTheDocument()
    expect(screen.queryByTestId("popularity-tab")).not.toBeInTheDocument()
  })

  it("switches to diagnostic tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /diagnostic/i }))
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("diagnostic-tab")).toBeInTheDocument()
  })

  it("switches to biographies tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /biographies/i }))
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("biographies-tab")).toBeInTheDocument()
  })

  it("switches to data quality tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /data quality/i }))
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("data-quality-tab")).toBeInTheDocument()
  })

  it("switches to popularity tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /popularity/i }))
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("popularity-tab")).toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=diagnostic", () => {
    renderPage("/admin/actors?tab=diagnostic")
    expect(screen.getByTestId("diagnostic-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=biographies", () => {
    renderPage("/admin/actors?tab=biographies")
    expect(screen.getByTestId("biographies-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=data-quality", () => {
    renderPage("/admin/actors?tab=data-quality")
    expect(screen.getByTestId("data-quality-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=popularity", () => {
    renderPage("/admin/actors?tab=popularity")
    expect(screen.getByTestId("popularity-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument()
  })
})
