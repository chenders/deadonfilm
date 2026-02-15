/**
 * Tests for SystemOpsPage.
 * Verifies the hub renders tabs and shows the correct tab content.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import SystemOpsPage from "./SystemOpsPage"

// Mock AdminLayout to avoid needing auth
vi.mock("../../components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock the tab components to isolate hub testing
vi.mock("../../components/admin/operations/CacheTab", () => ({
  default: () => <div data-testid="cache-tab">Cache Content</div>,
}))
vi.mock("../../components/admin/operations/SyncTab", () => ({
  default: () => <div data-testid="sync-tab">Sync Content</div>,
}))
vi.mock("../../components/admin/operations/SitemapTab", () => ({
  default: () => <div data-testid="sitemap-tab">Sitemap Content</div>,
}))

describe("SystemOpsPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = (initialRoute = "/admin/operations") =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <SystemOpsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

  it("renders page header", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /system ops/i })).toBeInTheDocument()
    expect(screen.getByText(/manage cache, tmdb sync, and sitemap operations/i)).toBeInTheDocument()
  })

  it("renders all three tabs", () => {
    renderPage()
    expect(screen.getByRole("tab", { name: /cache/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /tmdb sync/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /sitemap/i })).toBeInTheDocument()
  })

  it("shows cache tab by default", () => {
    renderPage()
    expect(screen.getByTestId("cache-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("sync-tab")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sitemap-tab")).not.toBeInTheDocument()
  })

  it("switches to sync tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /tmdb sync/i }))
    expect(screen.queryByTestId("cache-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("sync-tab")).toBeInTheDocument()
  })

  it("switches to sitemap tab on click", () => {
    renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /sitemap/i }))
    expect(screen.queryByTestId("cache-tab")).not.toBeInTheDocument()
    expect(screen.getByTestId("sitemap-tab")).toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=sync", () => {
    renderPage("/admin/operations?tab=sync")
    expect(screen.getByTestId("sync-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("cache-tab")).not.toBeInTheDocument()
  })

  it("opens correct tab when URL has ?tab=sitemap", () => {
    renderPage("/admin/operations?tab=sitemap")
    expect(screen.getByTestId("sitemap-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("cache-tab")).not.toBeInTheDocument()
  })
})
