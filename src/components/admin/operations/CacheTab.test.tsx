/**
 * Tests for CacheTab defaults
 *
 * These tests verify that the admin UI defaults match the expected behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import CacheTab from "./CacheTab"

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

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CacheTab />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("CacheTab defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Warm Cache form defaults", () => {
    it("has warmLimit defaulted to 1000", () => {
      renderTab()
      const warmLimitInput = screen.getByPlaceholderText("Custom")
      expect(warmLimitInput).toHaveValue(1000)
    })

    it("has 'Top 1000' button selected by default", () => {
      renderTab()
      const top1000Button = screen.getByRole("button", { name: /top 1000/i })
      expect(top1000Button).toHaveClass("bg-admin-interactive")
    })

    it("has deceasedOnly unchecked by default", () => {
      renderTab()
      const deceasedOnlyCheckbox = screen.getByRole("checkbox", { name: /deceased actors only/i })
      expect(deceasedOnlyCheckbox).not.toBeChecked()
    })

    it("has dryRun unchecked by default", () => {
      renderTab()
      const dryRunCheckbox = screen.getByRole("checkbox", { name: /dry run \(preview/i })
      expect(dryRunCheckbox).not.toBeChecked()
    })
  })

  describe("Invalidate Death Caches form defaults", () => {
    it("has actor IDs input empty by default", () => {
      renderTab()
      const actorIdsInput = screen.getByTestId("invalidate-actor-ids-input")
      expect(actorIdsInput).toHaveValue("")
    })

    it("has 'invalidate all' unchecked by default", () => {
      renderTab()
      const invalidateAllCheckbox = screen.getByTestId("invalidate-all-checkbox")
      expect(invalidateAllCheckbox).not.toBeChecked()
    })

    it("has 'also rebuild' checked by default (recommended setting)", () => {
      renderTab()
      const alsoRebuildCheckbox = screen.getByTestId("invalidate-rebuild-checkbox")
      expect(alsoRebuildCheckbox).toBeChecked()
    })
  })

  describe("UI elements render correctly", () => {
    it("renders invalidate death form", () => {
      renderTab()
      expect(screen.getByTestId("invalidate-death-form")).toBeInTheDocument()
    })

    it("renders invalidate submit button", () => {
      renderTab()
      expect(screen.getByTestId("invalidate-submit-button")).toBeInTheDocument()
    })

    it("renders rebuild death button", () => {
      renderTab()
      expect(screen.getByTestId("rebuild-death-button")).toBeInTheDocument()
    })
  })
})
