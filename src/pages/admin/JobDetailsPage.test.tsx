import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import JobDetailsPage from "./JobDetailsPage"
import * as useJobQueueModule from "../../hooks/useJobQueue"
import * as adminAuthHook from "../../hooks/useAdminAuth"
import { MemoryRouter, Route, Routes } from "react-router-dom"

// Mock the hooks
vi.mock("../../hooks/useJobQueue")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("JobDetailsPage", () => {
  const mockCompletedJob = {
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
    payload: { movieId: 123, title: "Test Movie" },
    result: { success: true, rating: 8.5 },
    error_message: null,
    error_stack: null,
    worker_id: "worker-1",
    created_by: "admin",
  }

  const mockFailedJob = {
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
    error_stack: "Error: API rate limit exceeded\n    at fetchData (api.ts:42)\n    at process...",
    worker_id: "worker-2",
    created_by: null,
  }

  const mockRetryJob = vi.fn()

  beforeEach(() => {
    vi.mocked(useJobQueueModule.useRetryJob).mockReturnValue({
      mutate: mockRetryJob,
      isPending: false,
      isSuccess: false,
      data: undefined,
    } as unknown as ReturnType<typeof useJobQueueModule.useRetryJob>)

    vi.mocked(adminAuthHook.useAdminAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    })
  })

  function renderPage(jobId: string = "1") {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/admin/jobs/runs/${jobId}`]}>
          <Routes>
            <Route path="/admin/jobs/runs/:id" element={<JobDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders error state when job not found", () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Not found"),
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    expect(screen.getByText(/Job not found/i)).toBeInTheDocument()
  })

  it("displays job metadata for completed job", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("job-123-abc")).toBeInTheDocument()
      expect(screen.getByText("fetch-omdb-ratings")).toBeInTheDocument()
      expect(screen.getByText("ratings")).toBeInTheDocument()
      expect(screen.getByText("completed")).toBeInTheDocument()
    })
  })

  it("displays job priority", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("0")).toBeInTheDocument() // priority
    })
  })

  it("displays attempt count", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument()
    })
  })

  it("displays job duration", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      // Duration appears multiple times (in info and quick stats)
      expect(screen.getAllByText("5.00s").length).toBeGreaterThan(0)
    })
  })

  it("displays worker ID", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("worker-1")).toBeInTheDocument()
    })
  })

  it("displays created by when present", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
  })

  it("displays payload data", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/"movieId": 123/)).toBeInTheDocument()
      expect(screen.getByText(/"title": "Test Movie"/)).toBeInTheDocument()
    })
  })

  it("displays result data for completed job", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/"success": true/)).toBeInTheDocument()
      expect(screen.getByText(/"rating": 8.5/)).toBeInTheDocument()
    })
  })

  it("displays timeline with completed steps", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Queued")).toBeInTheDocument()
      expect(screen.getByText("Started")).toBeInTheDocument()
      expect(screen.getByText("Completed")).toBeInTheDocument()
    })
  })

  it("displays error details for failed job", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockFailedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage("2")

    await waitFor(() => {
      expect(screen.getByText("Error Details")).toBeInTheDocument()
      expect(screen.getByText("API rate limit exceeded")).toBeInTheDocument()
    })
  })

  it("displays stack trace for failed job", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockFailedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage("2")

    await waitFor(() => {
      expect(screen.getByText(/at fetchData/)).toBeInTheDocument()
    })
  })

  it("shows retry button for failed jobs", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockFailedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage("2")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry Job" })).toBeInTheDocument()
    })
  })

  it("does not show retry button for completed jobs", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Retry Job" })).not.toBeInTheDocument()
    })
  })

  it("calls retry mutation when retry button clicked", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockFailedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage("2")

    await waitFor(() => {
      const retryButton = screen.getByRole("button", { name: "Retry Job" })
      fireEvent.click(retryButton)
    })

    expect(mockRetryJob).toHaveBeenCalledWith(2)
  })

  it("shows retry success message", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockFailedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    vi.mocked(useJobQueueModule.useRetryJob).mockReturnValue({
      mutate: mockRetryJob,
      isPending: false,
      isSuccess: true,
      data: { success: true, jobId: "new-job-id" },
    } as unknown as ReturnType<typeof useJobQueueModule.useRetryJob>)

    renderPage("2")

    await waitFor(() => {
      expect(screen.getByText(/Job retry initiated/)).toBeInTheDocument()
      expect(screen.getByText(/new-job-id/)).toBeInTheDocument()
    })
  })

  it("displays back link to job history", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockCompletedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage()

    await waitFor(() => {
      // Back link is an icon-only link to /admin/jobs/runs
      const links = screen.getAllByRole("link")
      const backLink = links.find((link) => link.getAttribute("href") === "/admin/jobs/runs")
      expect(backLink).toBeInTheDocument()
    })
  })

  it("shows Failed in timeline for failed jobs", async () => {
    vi.mocked(useJobQueueModule.useJobRun).mockReturnValue({
      data: mockFailedJob,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useJobRun>)

    renderPage("2")

    await waitFor(() => {
      expect(screen.getByText("Failed")).toBeInTheDocument()
    })
  })
})
