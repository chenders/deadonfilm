/**
 * Tests for SyncPage defaults
 *
 * These tests verify that the admin UI defaults match the expected sync behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import SyncPage from "./SyncPage"

// Mock the hooks
const mockUseSyncStatus = vi.fn()
const mockUseSyncHistory = vi.fn()
const mockUseTriggerSync = vi.fn()
const mockUseSyncDetails = vi.fn()
const mockUseCancelSync = vi.fn()

vi.mock("../../hooks/admin/useAdminSync", () => ({
  useSyncStatus: () => mockUseSyncStatus(),
  useSyncHistory: () => mockUseSyncHistory(),
  useTriggerSync: () => mockUseTriggerSync(),
  useSyncDetails: () => mockUseSyncDetails(),
  useCancelSync: () => mockUseCancelSync(),
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

    // Set default mock return values
    mockUseSyncStatus.mockReturnValue({
      data: {
        isRunning: false,
        lastSync: null,
        currentSyncId: null,
        currentSyncStartedAt: null,
      },
      isLoading: false,
    })

    mockUseSyncHistory.mockReturnValue({
      data: {
        history: [],
      },
      isLoading: false,
    })

    mockUseTriggerSync.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      data: null,
      error: null,
    })

    mockUseSyncDetails.mockReturnValue({
      data: null,
      isLoading: false,
    })

    mockUseCancelSync.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    })
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

  describe("Running sync state", () => {
    it("shows Force Stop button when sync is running", () => {
      mockUseSyncStatus.mockReturnValue({
        data: {
          isRunning: true,
          lastSync: null,
          currentSyncId: 1,
          currentSyncStartedAt: new Date().toISOString(),
        },
        isLoading: false,
      })

      mockUseSyncDetails.mockReturnValue({
        data: {
          id: 1,
          status: "running",
          itemsChecked: 50,
          itemsUpdated: 5,
          newDeathsFound: 2,
        },
        isLoading: false,
      })

      renderPage()

      expect(screen.getByRole("button", { name: /force stop/i })).toBeInTheDocument()
    })

    it("shows live progress when sync is running", () => {
      mockUseSyncStatus.mockReturnValue({
        data: {
          isRunning: true,
          lastSync: null,
          currentSyncId: 1,
          currentSyncStartedAt: new Date().toISOString(),
        },
        isLoading: false,
      })

      mockUseSyncDetails.mockReturnValue({
        data: {
          id: 1,
          status: "running",
          itemsChecked: 123,
          itemsUpdated: 45,
          newDeathsFound: 3,
        },
        isLoading: false,
      })

      renderPage()

      // Check that progress values are displayed
      expect(screen.getByText("123")).toBeInTheDocument()
      expect(screen.getByText("45")).toBeInTheDocument()
      expect(screen.getByText("3")).toBeInTheDocument()
    })

    it("disables submit button when sync is running", () => {
      mockUseSyncStatus.mockReturnValue({
        data: {
          isRunning: true,
          lastSync: null,
          currentSyncId: 1,
          currentSyncStartedAt: new Date().toISOString(),
        },
        isLoading: false,
      })

      renderPage()

      const submitButton = screen.getByTestId("sync-submit-button")
      expect(submitButton).toBeDisabled()
    })
  })

  describe("History table expandable rows", () => {
    it("shows chevron indicator for expandable rows", () => {
      mockUseSyncHistory.mockReturnValue({
        data: {
          history: [
            {
              id: 1,
              syncType: "tmdb-all",
              startedAt: "2024-01-01T10:00:00Z",
              completedAt: "2024-01-01T10:30:00Z",
              status: "completed",
              itemsChecked: 100,
              itemsUpdated: 10,
              newDeathsFound: 2,
              errorMessage: null,
              parameters: { days: 1 },
              triggeredBy: "admin",
            },
          ],
        },
        isLoading: false,
      })

      renderPage()

      // Check that chevron is present
      expect(screen.getByText("▶")).toBeInTheDocument()
    })

    it("shows error message in expanded row for failed syncs", async () => {
      mockUseSyncHistory.mockReturnValue({
        data: {
          history: [
            {
              id: 1,
              syncType: "tmdb-all",
              startedAt: "2024-01-01T10:00:00Z",
              completedAt: "2024-01-01T10:30:00Z",
              status: "failed",
              itemsChecked: 50,
              itemsUpdated: 5,
              newDeathsFound: 1,
              errorMessage: "Connection timeout after 30s",
              parameters: { days: 1 },
              triggeredBy: "admin",
            },
          ],
        },
        isLoading: false,
      })

      renderPage()

      // Click to expand - find the row and click it
      const row = screen.getByText("tmdb-all").closest("tr")
      if (row) {
        fireEvent.click(row)
      }

      // Check that error message is shown
      expect(screen.getByText("Connection timeout after 30s")).toBeInTheDocument()
    })
  })
})
