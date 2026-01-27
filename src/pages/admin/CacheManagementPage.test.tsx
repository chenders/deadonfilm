/**
 * Tests for CacheManagementPage defaults
 *
 * These tests verify that the admin UI defaults match the expected behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import CacheManagementPage from "./CacheManagementPage"

// Mock fetch for cache stats query
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        lastWarmed: null,
        actorsWarmed: 0,
        hitRate24h: 0.85,
        missRate24h: 0.15,
        totalKeys: 1000,
      }),
  })
)

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CacheManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("CacheManagementPage defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Warm Cache form defaults", () => {
    it("has warmLimit defaulted to 1000", () => {
      renderPage()
      // The warmLimit input is the custom number input in the "Warm Cache" form
      // Get it by its placeholder text since it doesn't have a label
      const warmLimitInput = screen.getByPlaceholderText("Custom")
      expect(warmLimitInput).toHaveValue(1000)
    })

    it("has 'Top 1000' button selected by default", () => {
      renderPage()
      const top1000Button = screen.getByRole("button", { name: /top 1000/i })
      expect(top1000Button).toHaveClass("bg-admin-interactive")
    })

    it("has deceasedOnly unchecked by default", () => {
      renderPage()
      const deceasedOnlyCheckbox = screen.getByRole("checkbox", { name: /deceased actors only/i })
      expect(deceasedOnlyCheckbox).not.toBeChecked()
    })

    it("has dryRun unchecked by default", () => {
      renderPage()
      const dryRunCheckbox = screen.getByRole("checkbox", { name: /dry run \(preview/i })
      expect(dryRunCheckbox).not.toBeChecked()
    })
  })

  describe("Invalidate Death Caches form defaults", () => {
    it("has actor IDs input empty by default", () => {
      renderPage()
      const actorIdsInput = screen.getByTestId("invalidate-actor-ids-input")
      expect(actorIdsInput).toHaveValue("")
    })

    it("has 'invalidate all' unchecked by default", () => {
      renderPage()
      const invalidateAllCheckbox = screen.getByTestId("invalidate-all-checkbox")
      expect(invalidateAllCheckbox).not.toBeChecked()
    })

    it("has 'also rebuild' checked by default (recommended setting)", () => {
      renderPage()
      const alsoRebuildCheckbox = screen.getByTestId("invalidate-rebuild-checkbox")
      expect(alsoRebuildCheckbox).toBeChecked()
    })
  })

  describe("UI elements render correctly", () => {
    it("renders invalidate death form", () => {
      renderPage()
      expect(screen.getByTestId("invalidate-death-form")).toBeInTheDocument()
    })

    it("renders invalidate submit button", () => {
      renderPage()
      expect(screen.getByTestId("invalidate-submit-button")).toBeInTheDocument()
    })

    it("renders rebuild death button", () => {
      renderPage()
      expect(screen.getByTestId("rebuild-death-button")).toBeInTheDocument()
    })
  })
})
