/**
 * Tests for StartBioEnrichmentPage defaults and behavior.
 *
 * Verifies form defaults, allowRegeneration default (true), source categories,
 * and submit payload shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import StartBioEnrichmentPage from "./StartBioEnrichmentPage"

// ── Hook mocks ──────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn()
const mockNavigate = vi.fn()
const mockHookState = { isPending: false, isError: false, error: null as Error | null }

vi.mock("../../hooks/admin/useBioEnrichmentRuns", () => ({
  useStartBioEnrichmentRun: () => ({
    mutateAsync: mockMutateAsync,
    get isPending() {
      return mockHookState.isPending
    },
    get isError() {
      return mockHookState.isError
    },
    get error() {
      return mockHookState.error
    },
  }),
}))

vi.mock("../../hooks/admin/useActorSearch", () => ({
  useActorSearch: () => ({
    data: [],
    isLoading: false,
  }),
}))

vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StartBioEnrichmentPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("StartBioEnrichmentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateAsync.mockResolvedValue({ success: true, runId: 42 })
    mockHookState.isPending = false
    mockHookState.isError = false
    mockHookState.error = null
  })

  describe("Actor Selection defaults", () => {
    it("has limit defaulted to 50", () => {
      renderPage()
      const limitInput = screen.getByRole("spinbutton", { name: /number of actors/i })
      expect(limitInput).toHaveValue(50)
    })

    it("has minPopularity defaulted to 0", () => {
      renderPage()
      const minPopInput = screen.getByRole("spinbutton", { name: /minimum popularity/i })
      expect(minPopInput).toHaveValue(0)
    })

    it("defaults to batch selection mode", () => {
      renderPage()
      const batchRadio = screen.getByRole("radio", { name: /batch/i })
      expect(batchRadio).toBeChecked()
    })
  })

  describe("Source Categories defaults", () => {
    it("has all source categories enabled by default", () => {
      renderPage()

      const categories = [
        /free/i,
        /reference/i,
        /books/i,
        /web search/i,
        /news/i,
        /obituary/i,
        /archives/i,
      ]
      categories.forEach((label) => {
        const checkbox = screen.getByRole("checkbox", { name: label })
        expect(checkbox).toBeChecked()
      })
    })
  })

  describe("Quality & Cost defaults", () => {
    it("has maxCostPerActor defaulted to 0.50", () => {
      renderPage()
      const input = screen.getByRole("spinbutton", { name: /max cost per actor/i })
      expect(input).toHaveValue(0.5)
    })

    it("has maxTotalCost defaulted to 25", () => {
      renderPage()
      const input = screen.getByRole("spinbutton", { name: /max total cost/i })
      expect(input).toHaveValue(25)
    })
  })

  describe("allowRegeneration default", () => {
    it("defaults allowRegeneration to true (checked)", () => {
      renderPage()
      const checkbox = screen.getByRole("checkbox", { name: /allow regeneration/i })
      expect(checkbox).toBeChecked()
    })
  })

  describe("submit", () => {
    it("submits with correct default payload and navigates on success", async () => {
      renderPage()

      const submitBtn = screen.getByRole("button", { name: /start bio enrichment run/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 50,
            minPopularity: 0,
            confidenceThreshold: 0.6,
            maxCostPerActor: 0.5,
            maxTotalCost: 25,
            allowRegeneration: true,
            sourceCategories: {
              free: true,
              reference: true,
              books: true,
              webSearch: true,
              news: true,
              obituary: true,
              archives: true,
            },
          })
        )
      })

      expect(mockNavigate).toHaveBeenCalledWith("/admin/bio-enrichment/runs/42")
    })

    it("shows error message when mutation fails", async () => {
      mockHookState.isError = true
      mockHookState.error = new Error("Server error")
      mockMutateAsync.mockRejectedValue(new Error("Server error"))

      renderPage()

      // Error message is rendered immediately since isError is true
      expect(screen.getByText("Server error")).toBeInTheDocument()

      // Submit still calls mutateAsync (component catches the rejection)
      const submitBtn = screen.getByRole("button", { name: /start bio enrichment run/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })
    })
  })
})
