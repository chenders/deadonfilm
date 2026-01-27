/**
 * Tests for SyncPage defaults
 *
 * These tests verify that the admin UI defaults match the expected sync behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import SyncPage from "./SyncPage"

// Mock the hooks
vi.mock("../../hooks/admin/useAdminSync", () => ({
  useSyncStatus: () => ({
    data: {
      isRunning: false,
      lastSync: null,
      currentSyncStartedAt: null,
    },
    isLoading: false,
  }),
  useSyncHistory: () => ({
    data: {
      history: [],
    },
    isLoading: false,
  }),
  useTriggerSync: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: null,
    error: null,
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
        <SyncPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("SyncPage defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Sync form defaults", () => {
    it("has syncDays defaulted to 1", () => {
      renderPage()
      const daysInput = screen.getByTestId("sync-days-input")
      expect(daysInput).toHaveValue(1)
    })

    it("has People sync type checked by default", () => {
      renderPage()
      const peopleCheckbox = screen.getByTestId("sync-type-people-checkbox")
      expect(peopleCheckbox).toBeChecked()
    })

    it("has Movies sync type checked by default", () => {
      renderPage()
      const moviesCheckbox = screen.getByTestId("sync-type-movies-checkbox")
      expect(moviesCheckbox).toBeChecked()
    })

    it("has Shows sync type checked by default", () => {
      renderPage()
      const showsCheckbox = screen.getByTestId("sync-type-shows-checkbox")
      expect(showsCheckbox).toBeChecked()
    })

    it("has dryRun unchecked by default", () => {
      renderPage()
      // Find the dry run checkbox by its label text
      const dryRunCheckbox = screen.getByRole("checkbox", { name: /dry run/i })
      expect(dryRunCheckbox).not.toBeChecked()
    })
  })

  describe("UI elements render correctly", () => {
    it("renders sync status card", () => {
      renderPage()
      expect(screen.getByTestId("sync-status-card")).toBeInTheDocument()
    })

    it("renders sync trigger form", () => {
      renderPage()
      expect(screen.getByTestId("sync-trigger-form")).toBeInTheDocument()
    })

    it("renders sync history table", () => {
      renderPage()
      expect(screen.getByTestId("sync-history-table")).toBeInTheDocument()
    })

    it("renders submit button enabled when at least one type is checked", () => {
      renderPage()
      const submitButton = screen.getByTestId("sync-submit-button")
      expect(submitButton).not.toBeDisabled()
    })
  })
})
