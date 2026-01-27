import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { TestMemoryRouter } from "../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import JobRunsPage from "./JobRunsPage"
import * as useJobQueueModule from "../../hooks/useJobQueue"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/useJobQueue")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("JobRunsPage", () => {
  const mockRuns = {
    runs: [
      {
        id: 1,
        job_id: "job-123-abc",
        job_type: "fetch-omdb-ratings",
        queue_name: "ratings",
        status: "completed" as const,
        priority: 0,
        queued_at: "2024-01-01T00:00:00Z",
        started_at: "2024-01-01T00:00:05Z",
        completed_at: "2024-01-01T00:00:10Z",
        duration_ms: 5000,
        attempts: 1,
        max_attempts: 3,
        payload: { movieId: 123 },
        result: { success: true },
        error_message: null,
        error_stack: null,
        worker_id: "worker-1",
        created_by: null,
      },
      {
        id: 2,
        job_id: "job-456-def",
        job_type: "enrich-death-details",
        queue_name: "enrichment",
        status: "failed" as const,
        priority: 1,
        queued_at: "2024-01-01T01:00:00Z",
        started_at: "2024-01-01T01:00:05Z",
        completed_at: "2024-01-01T01:00:08Z",
        duration_ms: 3000,
        attempts: 3,
        max_attempts: 3,
        payload: { actorId: 456 },
        result: null,
        error_message: "API rate limit exceeded",
        error_stack: "Error: API rate limit exceeded\n    at fetchData...",
        worker_id: "worker-2",
        created_by: null,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    },
  }

  const mockRetryJob = vi.fn()

  beforeEach(() => {
    vi.mocked(useJobQueueModule.useJobRuns).mockReturnValue({
      data: mockRuns,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRuns>)

    vi.mocked(useJobQueueModule.useRetryJob).mockReturnValue({
      mutate: mockRetryJob,
      isPending: false,
    } as unknown as ReturnType<typeof useJobQueueModule.useRetryJob>)

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
          <JobRunsPage />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useJobQueueModule.useJobRuns).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRuns>)

    renderPage()

    expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders error state when fetch fails", () => {
    vi.mocked(useJobQueueModule.useJobRuns).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRuns>)

    renderPage()

    expect(screen.getByText(/Failed to load job runs/i)).toBeInTheDocument()
  })

  it("renders empty state when no jobs exist", () => {
    vi.mocked(useJobQueueModule.useJobRuns).mockReturnValue({
      data: {
        runs: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRuns>)

    renderPage()

    expect(screen.getByText(/No job runs found/i)).toBeInTheDocument()
  })

  it("displays job runs in table", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("job-123-abc")).toBeInTheDocument()
      expect(screen.getByText("job-456-def")).toBeInTheDocument()
    })
  })

  it("displays job type labels", async () => {
    renderPage()

    await waitFor(() => {
      // Labels appear in both filter dropdown and table cells
      expect(screen.getAllByText("OMDb Ratings").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Death Details").length).toBeGreaterThan(0)
    })
  })

  it("displays job status badges", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("completed")).toBeInTheDocument()
      expect(screen.getByText("failed")).toBeInTheDocument()
    })
  })

  it("displays attempt counts", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("1/3")).toBeInTheDocument()
      expect(screen.getByText("3/3")).toBeInTheDocument()
    })
  })

  it("displays duration for completed jobs", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("5.0s")).toBeInTheDocument()
      expect(screen.getByText("3.0s")).toBeInTheDocument()
    })
  })

  it("shows retry button for failed jobs", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
    })
  })

  it("calls retry mutation when retry button clicked", async () => {
    renderPage()

    await waitFor(() => {
      const retryButton = screen.getByRole("button", { name: "Retry" })
      fireEvent.click(retryButton)
    })

    expect(mockRetryJob).toHaveBeenCalledWith(2)
  })

  it("shows error expand button for jobs with errors", async () => {
    renderPage()

    await waitFor(() => {
      // Error toggle button is present for job with error
      const toggleButtons = screen.getAllByTitle("Toggle error details")
      expect(toggleButtons.length).toBe(1)
    })
  })

  it("expands error details when toggle clicked", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("job-456-def")).toBeInTheDocument()
    })

    const toggleButton = screen.getByTitle("Toggle error details")
    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(screen.getByText("API rate limit exceeded")).toBeInTheDocument()
    })
  })

  it("displays filter dropdowns", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText("Status")).toBeInTheDocument()
      expect(screen.getByLabelText("Job Type")).toBeInTheDocument()
      expect(screen.getByLabelText("Queue")).toBeInTheDocument()
    })
  })

  it("displays pagination info", async () => {
    vi.mocked(useJobQueueModule.useJobRuns).mockReturnValue({
      data: {
        ...mockRuns,
        pagination: { page: 1, pageSize: 20, total: 50, totalPages: 3 },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRuns>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    })
  })

  it("displays links to job details", async () => {
    renderPage()

    await waitFor(() => {
      const links = screen.getAllByRole("link", { name: "View" })
      expect(links[0]).toHaveAttribute("href", "/admin/jobs/runs/1")
      expect(links[1]).toHaveAttribute("href", "/admin/jobs/runs/2")
    })
  })

  it("displays total job count", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/2 total jobs/i)).toBeInTheDocument()
    })
  })
})
