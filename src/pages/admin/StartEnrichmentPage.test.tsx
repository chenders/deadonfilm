/**
 * Tests for StartEnrichmentPage defaults
 *
 * These tests verify that the admin UI defaults match the CLI script defaults
 * from server/scripts/enrich-death-details.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import StartEnrichmentPage from "./StartEnrichmentPage"

// Mock the hooks
vi.mock("../../hooks/admin/useEnrichmentRuns", () => ({
  useStartEnrichmentRun: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StartEnrichmentPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("StartEnrichmentPage defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Actor Selection defaults", () => {
    it("has limit defaulted to 100", () => {
      renderPage()
      const limitInput = screen.getByRole("spinbutton", { name: /number of actors/i })
      expect(limitInput).toHaveValue(100)
    })

    it("has minPopularity defaulted to 0", () => {
      renderPage()
      const minPopInput = screen.getByRole("spinbutton", { name: /minimum popularity/i })
      expect(minPopInput).toHaveValue(0)
    })

    it("has recentOnly unchecked by default", () => {
      renderPage()
      const recentOnlyCheckbox = screen.getByRole("checkbox", { name: /recent deaths only/i })
      expect(recentOnlyCheckbox).not.toBeChecked()
    })

    it("has usActorsOnly unchecked by default", () => {
      renderPage()
      const usActorsOnlyCheckbox = screen.getByRole("checkbox", { name: /us actors only/i })
      expect(usActorsOnlyCheckbox).not.toBeChecked()
    })
  })

  describe("Source Selection defaults (match CLI --disable-* pattern)", () => {
    it("has free sources enabled by default (CLI: enabled, use --disable-free to turn off)", () => {
      renderPage()
      const freeCheckbox = screen.getByRole("checkbox", { name: /use free sources/i })
      expect(freeCheckbox).toBeChecked()
    })

    it("has paid sources enabled by default (CLI: enabled, use --disable-paid to turn off)", () => {
      renderPage()
      const paidCheckbox = screen.getByRole("checkbox", { name: /use paid sources/i })
      expect(paidCheckbox).toBeChecked()
    })

    it("has AI sources enabled by default (changed for admin UI - enrichment via admin should use all available sources)", () => {
      renderPage()
      const aiCheckbox = screen.getByRole("checkbox", { name: /use ai sources/i })
      expect(aiCheckbox).toBeChecked()
    })

    it("has gatherAllSources disabled by default (stop on first match)", () => {
      renderPage()
      const gatherAllCheckbox = screen.getByRole("checkbox", {
        name: /gather data from all sources/i,
      })
      expect(gatherAllCheckbox).not.toBeChecked()
    })
  })

  describe("Advanced Options defaults (match CLI --disable-* pattern)", () => {
    it("has claudeCleanup enabled by default (CLI: enabled, use --disable-claude-cleanup to turn off)", () => {
      renderPage()
      const claudeCleanupCheckbox = screen.getByRole("checkbox", {
        name: /use claude for data cleanup/i,
      })
      expect(claudeCleanupCheckbox).toBeChecked()
    })

    it("has followLinks enabled by default (CLI: enabled, use --disable-follow-links to turn off)", () => {
      renderPage()
      const followLinksCheckbox = screen.getByRole("checkbox", { name: /follow external links/i })
      expect(followLinksCheckbox).toBeChecked()
    })

    it("has aiLinkSelection enabled by default (CLI: enabled, use --disable-ai-link-selection to turn off)", () => {
      renderPage()
      const aiLinkSelectionCheckbox = screen.getByRole("checkbox", {
        name: /use ai for link selection/i,
      })
      expect(aiLinkSelectionCheckbox).toBeChecked()
    })

    it("has aiContentExtraction enabled by default (CLI: enabled, use --disable-ai-content-extraction to turn off)", () => {
      renderPage()
      const aiContentExtractionCheckbox = screen.getByRole("checkbox", {
        name: /use ai for content extraction/i,
      })
      expect(aiContentExtractionCheckbox).toBeChecked()
    })
  })

  describe("Cost Limits defaults", () => {
    it("has maxTotalCost defaulted to 10 (CLI: --max-total-cost default is 10)", () => {
      renderPage()
      const maxCostInput = screen.getByRole("spinbutton", { name: /max total cost/i })
      expect(maxCostInput).toHaveValue(10)
    })

    it("has maxCostPerActor empty by default (unlimited)", () => {
      renderPage()
      const maxCostPerActorInput = screen.getByRole("spinbutton", { name: /max cost per actor/i })
      expect(maxCostPerActorInput).toHaveValue(null) // Empty input
    })
  })

  describe("Quality Settings defaults", () => {
    it("has confidence threshold defaulted to 0.5 (CLI: --confidence default is 0.5)", () => {
      renderPage()
      const confidenceInput = screen.getByRole("spinbutton", { name: /confidence threshold/i })
      expect(confidenceInput).toHaveValue(0.5)
    })
  })

  describe("Wikipedia Options defaults (admin UI only, not in CLI)", () => {
    it("has wikipediaUseAISectionSelection enabled by default", () => {
      renderPage()
      const aiSectionCheckbox = screen.getByRole("checkbox", {
        name: /use ai for section selection/i,
      })
      expect(aiSectionCheckbox).toBeChecked()
    })

    it("has wikipediaFollowLinkedArticles enabled by default", () => {
      renderPage()
      const followLinkedCheckbox = screen.getByRole("checkbox", {
        name: /follow linked wikipedia articles/i,
      })
      expect(followLinkedCheckbox).toBeChecked()
    })

    it("has wikipediaMaxSections defaulted to 10", () => {
      renderPage()
      const maxSectionsInput = screen.getByRole("spinbutton", {
        name: /max sections to fetch/i,
      })
      expect(maxSectionsInput).toHaveValue(10)
    })

    it("shows maxLinkedArticles input when followLinkedArticles is enabled (default)", () => {
      renderPage()
      // The maxLinkedArticles input should be visible when followLinkedArticles is checked (default)
      const maxLinkedInput = screen.getByRole("spinbutton", {
        name: /max linked articles/i,
      })
      expect(maxLinkedInput).toBeInTheDocument()
      expect(maxLinkedInput).toHaveValue(2)
    })

    it("hides maxLinkedArticles input when followLinkedArticles is disabled", async () => {
      renderPage()
      const { fireEvent } = await import("@testing-library/react")

      // Initially visible (since followLinkedArticles is enabled by default)
      expect(screen.getByRole("spinbutton", { name: /max linked articles/i })).toBeInTheDocument()

      // Click to disable follow linked articles
      const followLinkedCheckbox = screen.getByRole("checkbox", {
        name: /follow linked wikipedia articles/i,
      })
      fireEvent.click(followLinkedCheckbox)

      // Now hidden
      expect(
        screen.queryByRole("spinbutton", { name: /max linked articles/i })
      ).not.toBeInTheDocument()
    })

    it("has data-testid attributes on Wikipedia UI elements", () => {
      renderPage()

      expect(screen.getByTestId("wikipedia-use-ai-section-selection")).toBeInTheDocument()
      expect(screen.getByTestId("wikipedia-follow-linked-articles")).toBeInTheDocument()
      expect(screen.getByTestId("wikipedia-max-sections")).toBeInTheDocument()
      // maxLinkedArticles is visible by default since followLinkedArticles is enabled
      expect(screen.getByTestId("wikipedia-max-linked-articles")).toBeInTheDocument()
    })
  })

  describe("CLI Reference shows correct default command", () => {
    it("shows the equivalent CLI command with proper flags", () => {
      renderPage()
      // With defaults, the CLI command should show the correct syntax
      const cliReference = screen.getByText(/cd server && npm run enrich:death-details/i)
      expect(cliReference).toBeInTheDocument()

      // Should include limit and max cost
      expect(cliReference.textContent).toContain("--limit 100")
      expect(cliReference.textContent).toContain("--max-total-cost 10")
      // Should include --ai flag since it's enabled by default in admin UI
      expect(cliReference.textContent).toContain("--ai")
      // Enabled-by-default flags should NOT appear (they're the default)
      // Only --disable-* flags appear when they're disabled
    })
  })
})
