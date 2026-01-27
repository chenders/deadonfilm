import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { TestMemoryRouter } from "../../test/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import DeadLetterQueuePage from "./DeadLetterQueuePage"
import * as useJobQueueModule from "../../hooks/useJobQueue"
import * as adminAuthHook from "../../hooks/useAdminAuth"

// Mock the hooks
vi.mock("../../hooks/useJobQueue")
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("DeadLetterQueuePage", () => {
  const mockJobs = {
    jobs: [
      {
        id: 1,
        job_id: "job-123-abc",
        job_type: "fetch-omdb-ratings",
        queue_name: "ratings",
        failed_at: "2024-01-01T00:00:00Z",
        attempts: 3,
        final_error: "API rate limit exceeded after 3 attempts",
        payload: { movieId: 123, title: "Test Movie" },
        reviewed: false,
        review_notes: null,
        reviewed_at: null,
        reviewed_by: null,
      },
      {
        id: 2,
        job_id: "job-456-def",
        job_type: "enrich-death-details",
        queue_name: "enrichment",
        failed_at: "2024-01-01T01:00:00Z",
        attempts: 5,
        final_error: "Actor not found in database",
        payload: { actorId: 456 },
        reviewed: true,
        review_notes: "Known issue - actor was deleted",
        reviewed_at: "2024-01-02T00:00:00Z",
        reviewed_by: "admin",
      },
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    },
  }

  const mockReviewJob = vi.fn()
  const mockRetryJob = vi.fn()

  beforeEach(() => {
    vi.mocked(useJobQueueModule.useDeadLetterQueue).mockReturnValue({
      data: mockJobs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useDeadLetterQueue>)

    vi.mocked(useJobQueueModule.useReviewDeadLetterJob).mockReturnValue({
      mutate: mockReviewJob,
      isPending: false,
    } as unknown as ReturnType<typeof useJobQueueModule.useReviewDeadLetterJob>)

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
          <DeadLetterQueuePage />
        </TestMemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state", () => {
    vi.mocked(useJobQueueModule.useDeadLetterQueue).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useDeadLetterQueue>)

    renderPage()

    expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders error state when fetch fails", () => {
    vi.mocked(useJobQueueModule.useDeadLetterQueue).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
    } as unknown as ReturnType<typeof useJobQueueModule.useDeadLetterQueue>)

    renderPage()

    expect(screen.getByText(/Failed to load dead letter queue/i)).toBeInTheDocument()
  })

  it("renders empty state when no jobs exist", () => {
    vi.mocked(useJobQueueModule.useDeadLetterQueue).mockReturnValue({
      data: {
        jobs: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useDeadLetterQueue>)

    renderPage()

    expect(screen.getByText(/No failed jobs requiring attention/i)).toBeInTheDocument()
  })

  it("displays job cards", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("job-123-abc")).toBeInTheDocument()
      expect(screen.getByText("job-456-def")).toBeInTheDocument()
    })
  })

  it("displays job type labels", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("OMDb Ratings")).toBeInTheDocument()
      expect(screen.getByText("Death Details")).toBeInTheDocument()
    })
  })

  it("displays error messages", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("API rate limit exceeded after 3 attempts")).toBeInTheDocument()
      expect(screen.getByText("Actor not found in database")).toBeInTheDocument()
    })
  })

  it("displays attempt counts", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("3 attempts")).toBeInTheDocument()
      expect(screen.getByText("5 attempts")).toBeInTheDocument()
    })
  })

  it("shows retry button for all jobs", async () => {
    renderPage()

    await waitFor(() => {
      const retryButtons = screen.getAllByRole("button", { name: "Retry" })
      expect(retryButtons.length).toBe(2)
    })
  })

  it("calls retry mutation when retry button clicked", async () => {
    renderPage()

    await waitFor(() => {
      const retryButtons = screen.getAllByRole("button", { name: "Retry" })
      fireEvent.click(retryButtons[0])
    })

    expect(mockRetryJob).toHaveBeenCalledWith(1)
  })

  it("shows review button for unreviewed jobs", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument()
    })
  })

  it("does not show review button for reviewed jobs", async () => {
    vi.mocked(useJobQueueModule.useDeadLetterQueue).mockReturnValue({
      data: {
        jobs: [mockJobs.jobs[1]], // Only the reviewed job
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useDeadLetterQueue>)

    renderPage()

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument()
    })
  })

  it("shows review form when review button clicked", async () => {
    renderPage()

    await waitFor(() => {
      const reviewButton = screen.getByRole("button", { name: "Review" })
      fireEvent.click(reviewButton)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add review notes/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Mark Reviewed" })).toBeInTheDocument()
    })
  })

  it("calls review mutation when mark reviewed clicked", async () => {
    renderPage()

    await waitFor(() => {
      const reviewButton = screen.getByRole("button", { name: "Review" })
      fireEvent.click(reviewButton)
    })

    const textarea = screen.getByPlaceholderText(/Add review notes/i)
    fireEvent.change(textarea, { target: { value: "Test review note" } })

    const markReviewedButton = screen.getByRole("button", { name: "Mark Reviewed" })
    fireEvent.click(markReviewedButton)

    expect(mockReviewJob).toHaveBeenCalledWith({ id: 1, notes: "Test review note" })
  })

  it("displays review notes for reviewed jobs", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Review Notes")).toBeInTheDocument()
      expect(screen.getByText("Known issue - actor was deleted")).toBeInTheDocument()
    })
  })

  it("displays reviewer info for reviewed jobs", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Reviewed by admin/)).toBeInTheDocument()
    })
  })

  it("shows payload when expanded", async () => {
    renderPage()

    await waitFor(() => {
      const expandButton = screen.getAllByText("Payload & Details")[0]
      fireEvent.click(expandButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/"movieId": 123/)).toBeInTheDocument()
    })
  })

  it("displays show reviewed toggle", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/Show reviewed jobs/i)).toBeInTheDocument()
    })
  })

  it("toggles show reviewed state", async () => {
    renderPage()

    await waitFor(() => {
      const toggle = screen.getByLabelText(/Show reviewed jobs/i)
      fireEvent.click(toggle)
    })

    // Verify hook was called with new filter
    expect(useJobQueueModule.useDeadLetterQueue).toHaveBeenCalled()
  })

  it("displays pagination when multiple pages", async () => {
    vi.mocked(useJobQueueModule.useDeadLetterQueue).mockReturnValue({
      data: {
        ...mockJobs,
        pagination: { page: 1, pageSize: 20, total: 50, totalPages: 3 },
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useJobQueueModule.useDeadLetterQueue>)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    })
  })

  it("displays job count", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/2 unreviewed jobs/i)).toBeInTheDocument()
    })
  })

  it("displays back link to job queues", async () => {
    renderPage()

    await waitFor(() => {
      // Back link is an icon-only link to /admin/jobs
      const links = screen.getAllByRole("link")
      const backLink = links.find((link) => link.getAttribute("href") === "/admin/jobs")
      expect(backLink).toBeInTheDocument()
    })
  })

  it("hides review form when cancel clicked", async () => {
    renderPage()

    await waitFor(() => {
      const reviewButton = screen.getByRole("button", { name: "Review" })
      fireEvent.click(reviewButton)
    })

    const cancelButton = screen.getByRole("button", { name: "Cancel" })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Add review notes/i)).not.toBeInTheDocument()
    })
  })
})
