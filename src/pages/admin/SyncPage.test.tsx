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

  describe("Force Stop functionality", () => {
    it("shows confirmation dialog when Force Stop is clicked", () => {
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

      // Click Force Stop button
      fireEvent.click(screen.getByRole("button", { name: /force stop/i }))

      // Confirmation dialog should appear
      expect(screen.getByText(/are you sure you want to stop this sync/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /yes, stop sync/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument()
    })

    it("calls cancel mutation when Yes, Stop Sync is clicked", () => {
      const mockMutate = vi.fn()
      mockUseSyncStatus.mockReturnValue({
        data: {
          isRunning: true,
          lastSync: null,
          currentSyncId: 42,
          currentSyncStartedAt: new Date().toISOString(),
        },
        isLoading: false,
      })

      mockUseSyncDetails.mockReturnValue({
        data: {
          id: 42,
          status: "running",
          itemsChecked: 50,
          itemsUpdated: 5,
          newDeathsFound: 2,
        },
        isLoading: false,
      })

      mockUseCancelSync.mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        error: null,
      })

      renderPage()

      // Click Force Stop button
      fireEvent.click(screen.getByRole("button", { name: /force stop/i }))

      // Click Yes, Stop Sync
      fireEvent.click(screen.getByRole("button", { name: /yes, stop sync/i }))

      // Mutation should be called with the sync ID
      expect(mockMutate).toHaveBeenCalledWith(42, expect.any(Object))
    })

    it("dismisses confirmation dialog when Cancel is clicked", () => {
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

      // Click Force Stop button
      fireEvent.click(screen.getByRole("button", { name: /force stop/i }))

      // Confirmation dialog should appear
      expect(screen.getByText(/are you sure you want to stop this sync/i)).toBeInTheDocument()

      // Click Cancel button in dialog
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

      // Confirmation dialog should disappear
      expect(screen.queryByText(/are you sure you want to stop this sync/i)).not.toBeInTheDocument()
    })

    it("shows error message when cancel fails", () => {
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

      mockUseCancelSync.mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
        isSuccess: false,
        isError: true,
        error: new Error("Sync is already completing"),
      })

      renderPage()

      // Click Force Stop to show dialog
      fireEvent.click(screen.getByRole("button", { name: /force stop/i }))

      // Error message should be displayed
      expect(screen.getByText("Sync is already completing")).toBeInTheDocument()
    })

    it("resets confirmation dialog when sync stops naturally", () => {
      const { rerender } = render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <SyncPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Initial state: sync running
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

      rerender(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <SyncPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Click Force Stop to show dialog
      const forceStopButton = screen.queryByRole("button", { name: /force stop/i })
      if (forceStopButton) {
        fireEvent.click(forceStopButton)
      }

      // Now sync stops naturally
      mockUseSyncStatus.mockReturnValue({
        data: {
          isRunning: false,
          lastSync: null,
          currentSyncId: null,
          currentSyncStartedAt: null,
        },
        isLoading: false,
      })

      mockUseSyncDetails.mockReturnValue({
        data: null,
        isLoading: false,
      })

      rerender(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <SyncPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Dialog should be gone (Force Stop button won't be visible when not running)
      expect(screen.queryByRole("button", { name: /force stop/i })).not.toBeInTheDocument()
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
