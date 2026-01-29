import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { TestMemoryRouter } from "../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LogsPage from "./LogsPage"
import * as useErrorLogsModule from "../../hooks/useErrorLogs"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/useErrorLogs")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("LogsPage", () => {
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

  function renderPage(initialRoute = "/admin/logs") {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter initialEntries={[initialRoute]}>
          <LogsPage />
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

      renderPage()

      // Check for skeleton elements (animate-pulse class)
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
    })

    it("renders error state", () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Failed to load"),
      } as ReturnType<typeof useErrorLogsModule.useErrorLogs>)

      renderPage()

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

      renderPage()

      expect(screen.getByText(/No error logs found/i)).toBeInTheDocument()
    })
  })

  describe("page header", () => {
    it("renders page title", () => {
      renderPage()

      expect(screen.getByRole("heading", { name: /Error Logs/i })).toBeInTheDocument()
    })

    it("renders auto-refresh checkbox", () => {
      renderPage()

      expect(screen.getByLabelText(/Auto-refresh/i)).toBeInTheDocument()
    })
  })

  describe("stats cards", () => {
    it("displays total logs count", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("100")).toBeInTheDocument()
        expect(screen.getByText("Total (24h)")).toBeInTheDocument()
      })
    })

    it("displays error count", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("25")).toBeInTheDocument()
        expect(screen.getByText("Errors (24h)")).toBeInTheDocument()
      })
    })

    it("displays fatal count", async () => {
      renderPage()

      await waitFor(() => {
        // Note: fatals_24h is 2
        expect(screen.getByText("Fatal (24h)")).toBeInTheDocument()
      })
    })
  })

  describe("top error messages", () => {
    it("displays top error messages section", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("Top Error Messages (24h)")).toBeInTheDocument()
        expect(screen.getByText("Connection timeout")).toBeInTheDocument()
        expect(screen.getByText("15x")).toBeInTheDocument()
      })
    })
  })

  describe("filters", () => {
    it("renders level filter dropdown", () => {
      renderPage()

      const levelSelect = screen.getByLabelText(/Level/i)
      expect(levelSelect).toBeInTheDocument()
      expect(levelSelect).toHaveValue("")
    })

    it("renders source filter dropdown", () => {
      renderPage()

      const sourceSelect = screen.getByLabelText(/Source/i)
      expect(sourceSelect).toBeInTheDocument()
      expect(sourceSelect).toHaveValue("")
    })

    it("renders search input", () => {
      renderPage()

      const searchInput = screen.getByPlaceholderText(/Search in message/i)
      expect(searchInput).toBeInTheDocument()
    })

    it("renders date range filters", () => {
      renderPage()

      expect(screen.getByLabelText(/From/i)).toBeInTheDocument()
      // Use specific aria-label to avoid matching the theme toggle checkbox
      expect(screen.getByRole("textbox", { name: /To/i })).toBeInTheDocument()
    })

    it("shows clear filters button when filters are active", () => {
      renderPage("/admin/logs?level=error")

      expect(screen.getByRole("button", { name: /Clear Filters/i })).toBeInTheDocument()
    })

    it("does not show clear filters button when no filters active", () => {
      renderPage()

      expect(screen.queryByRole("button", { name: /Clear Filters/i })).not.toBeInTheDocument()
    })
  })

  describe("logs table", () => {
    it("displays log entries", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("Database connection failed")).toBeInTheDocument()
        expect(screen.getByText("Rate limit approaching")).toBeInTheDocument()
      })
    })

    it("displays level badges", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("error")).toBeInTheDocument()
        expect(screen.getByText("warn")).toBeInTheDocument()
      })
    })

    it("displays source badges", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("route")).toBeInTheDocument()
        expect(screen.getByText("script")).toBeInTheDocument()
      })
    })

    it("displays request path for route logs", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("GET /api/actors/456")).toBeInTheDocument()
      })
    })

    it("displays script name for script logs", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("sync-tmdb-changes")).toBeInTheDocument()
      })
    })

    it("renders expand/collapse buttons", async () => {
      renderPage()

      await waitFor(() => {
        const expandButtons = screen.getAllByLabelText(/Expand details/i)
        expect(expandButtons.length).toBe(2)
      })
    })

    it("expands row when expand button clicked", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("Database connection failed")).toBeInTheDocument()
      })

      const expandButtons = screen.getAllByLabelText(/Expand details/i)
      fireEvent.click(expandButtons[0])

      // Should show expanded content
      await waitFor(() => {
        expect(screen.getByText("Stack Trace:")).toBeInTheDocument()
        expect(screen.getByText(/Error: Connection refused/)).toBeInTheDocument()
      })
    })

    it("collapses row when collapse button clicked", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("Database connection failed")).toBeInTheDocument()
      })

      // Expand first
      const expandButtons = screen.getAllByLabelText(/Expand details/i)
      fireEvent.click(expandButtons[0])

      await waitFor(() => {
        expect(screen.getByText("Stack Trace:")).toBeInTheDocument()
      })

      // Collapse
      const collapseButton = screen.getByLabelText(/Collapse details/i)
      fireEvent.click(collapseButton)

      await waitFor(() => {
        expect(screen.queryByText("Stack Trace:")).not.toBeInTheDocument()
      })
    })
  })

  describe("pagination", () => {
    it("displays pagination info", async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 to 2 of 2/)).toBeInTheDocument()
        expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument()
      })
    })

    it("renders page size selector", () => {
      renderPage()

      const pageSizeSelect = screen.getByDisplayValue("50/page")
      expect(pageSizeSelect).toBeInTheDocument()
    })

    it("renders previous/next page buttons", () => {
      renderPage()

      expect(screen.getByLabelText(/Previous page/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Next page/i)).toBeInTheDocument()
    })

    it("disables previous button on first page", () => {
      renderPage()

      const prevButton = screen.getByLabelText(/Previous page/i)
      expect(prevButton).toBeDisabled()
    })

    it("disables next button on last page", () => {
      renderPage()

      const nextButton = screen.getByLabelText(/Next page/i)
      expect(nextButton).toBeDisabled()
    })
  })

  describe("cleanup section", () => {
    it("renders cleanup section", () => {
      renderPage()

      expect(screen.getByText("Maintenance")).toBeInTheDocument()
      expect(screen.getByLabelText(/Delete logs older than/i)).toBeInTheDocument()
    })

    it("renders cleanup days dropdown with options", () => {
      renderPage()

      const select = screen.getByLabelText(/Delete logs older than/i)
      expect(select).toHaveValue("30")

      // Check options
      fireEvent.click(select)
      expect(screen.getByRole("option", { name: "7 days" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "30 days" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "90 days" })).toBeInTheDocument()
    })

    it("calls cleanup mutation when button clicked", async () => {
      renderPage()

      const cleanupButton = screen.getByRole("button", { name: "Run Cleanup" })
      fireEvent.click(cleanupButton)

      expect(mockCleanupMutation).toHaveBeenCalledWith(30) // default days
    })

    it("uses selected days for cleanup", async () => {
      renderPage()

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

      renderPage()

      expect(screen.getByRole("button", { name: "Cleaning..." })).toBeDisabled()
    })

    it("displays success message after cleanup", () => {
      vi.mocked(useErrorLogsModule.useCleanupErrorLogs).mockReturnValue({
        mutate: mockCleanupMutation,
        isPending: false,
        isSuccess: true,
        data: { success: true, deleted: 150 },
      } as unknown as ReturnType<typeof useErrorLogsModule.useCleanupErrorLogs>)

      renderPage()

      expect(screen.getByText(/Deleted 150 log entries/i)).toBeInTheDocument()
    })
  })

  describe("URL parameter handling", () => {
    it("handles level filter from URL", async () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockImplementation((filters) => {
        // Verify the hook is called with the correct filter
        expect(filters.level).toBe("error")
        return {
          data: mockLogs,
          isLoading: false,
          error: null,
        } as ReturnType<typeof useErrorLogsModule.useErrorLogs>
      })

      renderPage("/admin/logs?level=error")
    })

    it("handles source filter from URL", async () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockImplementation((filters) => {
        expect(filters.source).toBe("route")
        return {
          data: mockLogs,
          isLoading: false,
          error: null,
        } as ReturnType<typeof useErrorLogsModule.useErrorLogs>
      })

      renderPage("/admin/logs?source=route")
    })

    it("ignores invalid level in URL", async () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockImplementation((filters) => {
        // Invalid level should be ignored (undefined)
        expect(filters.level).toBeUndefined()
        return {
          data: mockLogs,
          isLoading: false,
          error: null,
        } as ReturnType<typeof useErrorLogsModule.useErrorLogs>
      })

      renderPage("/admin/logs?level=invalid")
    })

    it("ignores invalid source in URL", async () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockImplementation((filters) => {
        // Invalid source should be ignored (undefined)
        expect(filters.source).toBeUndefined()
        return {
          data: mockLogs,
          isLoading: false,
          error: null,
        } as ReturnType<typeof useErrorLogsModule.useErrorLogs>
      })

      renderPage("/admin/logs?source=invalid")
    })

    it("handles page parameter from URL", async () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockImplementation((filters) => {
        expect(filters.page).toBe(2)
        return {
          data: mockLogs,
          isLoading: false,
          error: null,
        } as ReturnType<typeof useErrorLogsModule.useErrorLogs>
      })

      renderPage("/admin/logs?page=2")
    })

    it("defaults invalid page to 1", async () => {
      vi.mocked(useErrorLogsModule.useErrorLogs).mockImplementation((filters) => {
        expect(filters.page).toBe(1)
        return {
          data: mockLogs,
          isLoading: false,
          error: null,
        } as ReturnType<typeof useErrorLogsModule.useErrorLogs>
      })

      renderPage("/admin/logs?page=-1")
    })
  })
})
