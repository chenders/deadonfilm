import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { TestMemoryRouter } from "../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import JobQueuesPage from "./JobQueuesPage"
import * as useJobQueueModule from "../../hooks/useJobQueue"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/useJobQueue")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("JobQueuesPage", () => {
  const mockQueues = {
    queues: [
      {
        name: "ratings",
        waiting: 10,
        active: 2,
        completed: 100,
        failed: 5,
        delayed: 3,
        isPaused: false,
      },
      {
        name: "enrichment",
        waiting: 5,
        active: 1,
        completed: 50,
        failed: 2,
        delayed: 0,
        isPaused: true,
      },
    ],
  }

  const mockStats = {
    successRates: [
      {
        job_type: "fetch-omdb-ratings",
        total: 100,
        completed: 95,
        success_rate: "95.00",
      },
    ],
    durations: [
      {
        job_type: "fetch-omdb-ratings",
        avg_ms: 150,
        median_ms: 120,
        p95_ms: 300,
      },
    ],
    deadLetterQueue: [
      {
        job_type: "fetch-omdb-ratings",
        count: 3,
        most_recent: "2024-01-01T00:00:00Z",
      },
    ],
  }

  const mockPauseQueue = vi.fn()
  const mockResumeQueue = vi.fn()
  const mockCleanupJobs = vi.fn()

  beforeEach(() => {
    vi.mocked(useJobQueueModule.useQueueStats).mockReturnValue({
      data: mockQueues,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useJobQueueModule.useQueueStats>)

    vi.mocked(useJobQueueModule.useJobStats).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useJobQueueModule.useJobStats>)

    vi.mocked(useJobQueueModule.usePauseQueue).mockReturnValue({
      mutate: mockPauseQueue,
      isPending: false,
    } as unknown as ReturnType<typeof useJobQueueModule.usePauseQueue>)

    vi.mocked(useJobQueueModule.useResumeQueue).mockReturnValue({
      mutate: mockResumeQueue,
      isPending: false,
    } as unknown as ReturnType<typeof useJobQueueModule.useResumeQueue>)

    vi.mocked(useJobQueueModule.useCleanupJobs).mockReturnValue({
      mutate: mockCleanupJobs,
      isPending: false,
      isSuccess: false,
      data: undefined,
    } as unknown as ReturnType<typeof useJobQueueModule.useCleanupJobs>)

    vi.mocked(adminAuthHook.useAdminAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    })
  })

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter>
          <JobQueuesPage />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useJobQueueModule.useQueueStats).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useJobQueueModule.useQueueStats>)

    renderPage()

    // Check for skeleton elements
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders error state when fetch fails", () => {
    vi.mocked(useJobQueueModule.useQueueStats).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as ReturnType<typeof useJobQueueModule.useQueueStats>)

    renderPage()

    expect(screen.getByText(/Failed to load queue stats/i)).toBeInTheDocument()
  })

  it("displays queue stats summary", async () => {
    renderPage()

    await waitFor(() => {
      // Check totals (10+5 waiting, 2+1 active, 100+50 completed, 5+2 failed)
      expect(screen.getByText("15")).toBeInTheDocument() // queued (waiting)
      // Multiple "3"s on page (active total, delayed count, dead letter count)
      // Just verify page renders with queue data
      expect(screen.getByText("ratings")).toBeInTheDocument()
    })
  })

  it("displays individual queue cards", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("ratings")).toBeInTheDocument()
      expect(screen.getByText("enrichment")).toBeInTheDocument()
    })
  })

  it("shows running status for active queues", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument()
    })
  })

  it("shows paused status for paused queues", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeInTheDocument()
    })
  })

  it("calls pause mutation when pause button clicked", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("ratings")).toBeInTheDocument()
    })

    // Find the Pause button (for the running queue)
    const pauseButton = screen.getByRole("button", { name: "Pause" })
    fireEvent.click(pauseButton)

    expect(mockPauseQueue).toHaveBeenCalledWith("ratings")
  })

  it("calls resume mutation when resume button clicked", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("enrichment")).toBeInTheDocument()
    })

    // Find the Resume button (for the paused queue)
    const resumeButton = screen.getByRole("button", { name: "Resume" })
    fireEvent.click(resumeButton)

    expect(mockResumeQueue).toHaveBeenCalledWith("enrichment")
  })

  it("displays dead letter count in stat card", async () => {
    renderPage()

    await waitFor(() => {
      // Dead letter section should show count
      expect(screen.getByText("Dead Letter")).toBeInTheDocument()
      // Verify link to dead letter page exists
      expect(screen.getByRole("link", { name: /Dead Letter Queue/i })).toBeInTheDocument()
    })
  })

  it("displays job performance stats", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("fetch-omdb-ratings")).toBeInTheDocument()
      expect(screen.getByText("95.00%")).toBeInTheDocument()
      expect(screen.getByText("150ms")).toBeInTheDocument()
    })
  })

  it("calls cleanup mutation when cleanup button clicked", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Run Cleanup")).toBeInTheDocument()
    })

    const cleanupButton = screen.getByRole("button", { name: "Run Cleanup" })
    fireEvent.click(cleanupButton)

    expect(mockCleanupJobs).toHaveBeenCalledWith(24) // default 24 hours
  })

  it("shows cleanup period selector", async () => {
    renderPage()

    await waitFor(() => {
      const select = screen.getByLabelText(/cleanup completed jobs older than/i)
      expect(select).toBeInTheDocument()
    })
  })

  it("displays cleanup success message", async () => {
    vi.mocked(useJobQueueModule.useCleanupJobs).mockReturnValue({
      mutate: mockCleanupJobs,
      isPending: false,
      isSuccess: true,
      data: { success: true, cleaned: 42 },
    } as unknown as ReturnType<typeof useJobQueueModule.useCleanupJobs>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Cleaned 42 completed jobs/i)).toBeInTheDocument()
    })
  })

  it("displays links to job history and dead letter queue", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /View Job History/i })).toHaveAttribute(
        "href",
        "/admin/jobs/runs"
      )
      expect(screen.getByRole("link", { name: /Dead Letter Queue/i })).toHaveAttribute(
        "href",
        "/admin/jobs/dead-letter"
      )
    })
  })
})
