import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { useSearchParams } from "react-router-dom"
import { TestMemoryRouter } from "../../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ErrorLogsTab from "./ErrorLogsTab"
import * as useErrorLogsModule from "../../../hooks/useErrorLogs"
import * as adminAuthHook from "../../../hooks/useAdminAuth"

// Helper to display current URL search params for assertions
function LocationDisplay() {
  const [searchParams] = useSearchParams()
  return <div data-testid="location-display">{searchParams.toString()}</div>
}

// Mock the hooks
vi.mock("../../../hooks/useErrorLogs")
vi.mock("../../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("ErrorLogsTab", () => {
  const mockLogs = {
    logs: [
      {
        id: 1,
        level: "error" as const,
        source: "route" as const,
        message: "Database connection failed",
        details: { retries: 3 },
        request_id: "req_123",
        path: "/api/actors/456",
        method: "GET",
        script_name: null,
        job_name: null,
        error_stack: "Error: Connection refused\n  at connect.ts:45",
        created_at: "2026-01-28T12:00:00Z",
      },
      {
        id: 2,
        level: "warn" as const,
        source: "script" as const,
        message: "Rate limit approaching",
        details: null,
        request_id: null,
        path: null,
        method: null,
        script_name: "sync-tmdb-changes",
        job_name: null,
        error_stack: null,
        created_at: "2026-01-28T11:30:00Z",
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
    },
  }

  const mockStats = {
    totals: {
      total_24h: 100,
      errors_24h: 25,
      fatals_24h: 2,
    },
    byLevel: [
      { level: "error" as const, count: 25 },
      { level: "warn" as const, count: 50 },
    ],
    bySource: [
      { source: "route" as const, count: 60 },
      { source: "script" as const, count: 30 },
    ],
    timeline: [{ hour: "2026-01-28T10:00:00Z", count: 10 }],
    topMessages: [
      {
        message_preview: "Connection timeout",
        count: 15,
        last_occurred: "2026-01-28T12:30:00Z",
      },
    ],
  }

  const mockCleanupMutation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useErrorLogsModule.useErrorLogs).mockReturnValue({
      data: mockLogs,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useErrorLogsModule.useErrorLogs>)

    vi.mocked(useErrorLogsModule.useErrorLogStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useErrorLogsModule.useErrorLogStats>)

    vi.mocked(useErrorLogsModule.useCleanupErrorLogs).mockReturnValue({
      mutate: mockCleanupMutation,
      isPending: false,
      isSuccess: false,
      data: undefined,
    } as unknown as ReturnType<typeof useErrorLogsModule.useCleanupErrorLogs>)

    vi.mocked(adminAuthHook.useAdminAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    })
  })

  function renderTab(initialRoute = "/admin/jobs?tab=logs") {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter initialEntries={[initialRoute]}>
          <ErrorLogsTab />
          <LocationDisplay />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  describe("loading and error states", () => {
    it("renders loading state", () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as ReturnType<typeof useErrorLogsModule.useErrorLogs>)

      renderTab()

      // Check for skeleton elements (animate-pulse class)
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
    })

    it("renders error state", () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Failed to load"),
      } as ReturnType<typeof useErrorLogsModule.useErrorLogs>)

      renderTab()

      expect(screen.getByText(/Failed to load error logs/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })

    it("renders empty state when no logs", () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockReturnValue({
        data: {
          logs: [] as useErrorLogsModule.ErrorLog[],
          pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
        },
        isLoading: false,
        error: null,
      } as ReturnType<typeof useErrorLogsModule.useErrorLogs>)

      renderTab()

      expect(screen.getByText(/No error logs found/i)).toBeInTheDocument()
    })
  })

  describe("auto-refresh", () => {
    it("renders auto-refresh checkbox", () => {
      renderTab()

      expect(screen.getByLabelText(/Auto-refresh/i)).toBeInTheDocument()
    })
  })

  describe("stats cards", () => {
    it("displays total logs count", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getByText("100")).toBeInTheDocument()
        expect(screen.getByText("Total (24h)")).toBeInTheDocument()
      })
    })

    it("displays error count", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getByText("25")).toBeInTheDocument()
        expect(screen.getByText("Errors (24h)")).toBeInTheDocument()
      })
    })

    it("displays fatal count", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getByText("Fatal (24h)")).toBeInTheDocument()
      })
    })
  })

  describe("top error messages", () => {
    it("displays top error messages section", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getByText("Top Error Messages (24h)")).toBeInTheDocument()
        expect(screen.getByText("Connection timeout")).toBeInTheDocument()
        expect(screen.getByText("15x")).toBeInTheDocument()
      })
    })
  })

  describe("filters", () => {
    it("renders level filter dropdown", () => {
      renderTab()

      const levelSelect = screen.getByLabelText(/Level/i)
      expect(levelSelect).toBeInTheDocument()
      expect(levelSelect).toHaveValue("")
    })

    it("renders source filter dropdown", () => {
      renderTab()

      const sourceSelect = screen.getByLabelText(/Source/i)
      expect(sourceSelect).toBeInTheDocument()
      expect(sourceSelect).toHaveValue("")
    })

    it("renders search input", () => {
      renderTab()

      const searchInput = screen.getByPlaceholderText(/Search in message/i)
      expect(searchInput).toBeInTheDocument()
    })

    it("renders date range filters", () => {
      renderTab()

      expect(screen.getByLabelText(/From/i)).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: /To/i })).toBeInTheDocument()
    })

    it("shows clear filters button when filters are active", () => {
      renderTab("/admin/jobs?tab=logs&level=error")

      expect(screen.getByRole("button", { name: /Clear Filters/i })).toBeInTheDocument()
    })

    it("does not show clear filters button when no filters active", () => {
      renderTab()

      expect(screen.queryByRole("button", { name: /Clear Filters/i })).not.toBeInTheDocument()
    })

    it("preserves tab=logs param when changing level filter", () => {
      renderTab()

      fireEvent.change(screen.getByLabelText(/Level/i), { target: { value: "error" } })

      const location = screen.getByTestId("location-display")
      expect(location.textContent).toContain("tab=logs")
      expect(location.textContent).toContain("level=error")
    })

    it("preserves tab=logs param when changing source filter", () => {
      renderTab()

      fireEvent.change(screen.getByLabelText(/Source/i), { target: { value: "route" } })

      const location = screen.getByTestId("location-display")
      expect(location.textContent).toContain("tab=logs")
      expect(location.textContent).toContain("source=route")
    })

    it("ignores invalid level values from URL", () => {
      renderTab("/admin/jobs?tab=logs&level=invalid")

      // Should default to "All Levels" (empty value) since "invalid" is not a valid LogLevel
      const levelSelect = screen.getByLabelText(/Level/i) as HTMLSelectElement
      expect(levelSelect.value).toBe("")
    })

    it("ignores invalid source values from URL", () => {
      renderTab("/admin/jobs?tab=logs&source=invalid")

      // Should default to "All Sources" (empty value) since "invalid" is not a valid LogSource
      const sourceSelect = screen.getByLabelText(/Source/i) as HTMLSelectElement
      expect(sourceSelect.value).toBe("")
    })
  })

  describe("logs table", () => {
    it("displays log entries", async () => {
      renderTab()

      await waitFor(() => {
        // Content appears in both mobile card view and desktop table
        expect(screen.getAllByText("Database connection failed").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText("Rate limit approaching").length).toBeGreaterThanOrEqual(1)
      })
    })

    it("displays level badges", async () => {
      renderTab()

      await waitFor(() => {
        // Level badges appear in both mobile and desktop views
        expect(screen.getAllByText("error").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText("warn").length).toBeGreaterThanOrEqual(1)
      })
    })

    it("displays source badges", async () => {
      renderTab()

      await waitFor(() => {
        // Source badges appear in both mobile and desktop views
        expect(screen.getAllByText("route").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText("script").length).toBeGreaterThanOrEqual(1)
      })
    })

    it("displays request path for route logs", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getAllByText("GET /api/actors/456").length).toBeGreaterThanOrEqual(1)
      })
    })

    it("displays script name for script logs", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getAllByText("sync-tmdb-changes").length).toBeGreaterThanOrEqual(1)
      })
    })

    it("renders expand/collapse buttons", async () => {
      renderTab()

      await waitFor(() => {
        const expandButtons = screen.getAllByLabelText(/Expand details/i)
        // 2 desktop buttons + 2 mobile buttons = 4
        expect(expandButtons.length).toBe(4)
      })
    })

    it("expands row when expand button clicked", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getAllByText("Database connection failed").length).toBeGreaterThanOrEqual(1)
      })

      const expandButtons = screen.getAllByLabelText(/Expand details/i)
      fireEvent.click(expandButtons[0])

      await waitFor(() => {
        // Stack trace appears in both mobile and desktop expanded views
        expect(screen.getAllByText("Stack Trace:").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(/Error: Connection refused/).length).toBeGreaterThanOrEqual(1)
      })
    })

    it("collapses row when collapse button clicked", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getAllByText("Database connection failed").length).toBeGreaterThanOrEqual(1)
      })

      // Expand first
      const expandButtons = screen.getAllByLabelText(/Expand details/i)
      fireEvent.click(expandButtons[0])

      await waitFor(() => {
        expect(screen.getAllByText("Stack Trace:").length).toBeGreaterThanOrEqual(1)
      })

      // Collapse
      const collapseButtons = screen.getAllByLabelText(/Collapse details/i)
      fireEvent.click(collapseButtons[0])

      await waitFor(() => {
        expect(screen.queryByText("Stack Trace:")).not.toBeInTheDocument()
      })
    })
  })

  describe("pagination", () => {
    it("displays pagination info", async () => {
      renderTab()

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 to 2 of 2/)).toBeInTheDocument()
        expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument()
      })
    })

    it("renders page size selector", () => {
      renderTab()

      const pageSizeSelect = screen.getByDisplayValue("50/page")
      expect(pageSizeSelect).toBeInTheDocument()
    })

    it("renders previous/next page buttons", () => {
      renderTab()

      expect(screen.getByLabelText(/Previous page/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Next page/i)).toBeInTheDocument()
    })

    it("disables previous button on first page", () => {
      renderTab()

      const prevButton = screen.getByLabelText(/Previous page/i)
      expect(prevButton).toBeDisabled()
    })

    it("disables next button on last page", () => {
      renderTab()

      const nextButton = screen.getByLabelText(/Next page/i)
      expect(nextButton).toBeDisabled()
    })
  })

  describe("cleanup section", () => {
    it("renders cleanup section", () => {
      renderTab()

      expect(screen.getByText("Maintenance")).toBeInTheDocument()
      expect(screen.getByLabelText(/Delete logs older than/i)).toBeInTheDocument()
    })

    it("renders cleanup days dropdown with options", () => {
      renderTab()

      const select = screen.getByLabelText(/Delete logs older than/i)
      expect(select).toHaveValue("30")

      fireEvent.click(select)
      expect(screen.getByRole("option", { name: "7 days" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "30 days" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "90 days" })).toBeInTheDocument()
    })

    it("calls cleanup mutation when button clicked", async () => {
      renderTab()

      const cleanupButton = screen.getByRole("button", { name: "Run Cleanup" })
      fireEvent.click(cleanupButton)

      expect(mockCleanupMutation).toHaveBeenCalledWith(30)
    })

    it("uses selected days for cleanup", async () => {
      renderTab()

      const select = screen.getByLabelText(/Delete logs older than/i)
      fireEvent.change(select, { target: { value: "14" } })

      const cleanupButton = screen.getByRole("button", { name: "Run Cleanup" })
      fireEvent.click(cleanupButton)

      expect(mockCleanupMutation).toHaveBeenCalledWith(14)
    })

    it("shows cleaning state when mutation is pending", () => {
      vi.mocked(useErrorLogsModule.useCleanupErrorLogs).mockReturnValue({
        mutate: mockCleanupMutation,
        isPending: true,
        isSuccess: false,
        data: undefined,
      } as unknown as ReturnType<typeof useErrorLogsModule.useCleanupErrorLogs>)

      renderTab()

      expect(screen.getByRole("button", { name: "Cleaning..." })).toBeDisabled()
    })

    it("displays success message after cleanup", () => {
      vi.mocked(useErrorLogsModule.useCleanupErrorLogs).mockReturnValue({
        mutate: mockCleanupMutation,
        isPending: false,
        isSuccess: true,
        data: { success: true, deleted: 150 },
      } as unknown as ReturnType<typeof useErrorLogsModule.useCleanupErrorLogs>)

      renderTab()

      expect(screen.getByText(/Deleted 150 log entries/i)).toBeInTheDocument()
    })
  })
})
