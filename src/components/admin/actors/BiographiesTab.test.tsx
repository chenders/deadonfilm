import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import BiographiesTab from "./BiographiesTab"

// Mock LoadingSpinner
vi.mock("../../common/LoadingSpinner", () => ({
  default: () => <div data-testid="loading-spinner">Loading...</div>,
}))

// Mock ErrorMessage
vi.mock("../../common/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div data-testid="error-message">{message}</div>,
}))

// Mock AdminHoverCard
vi.mock("../ui/AdminHoverCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock ActorPreviewCard
vi.mock("../ActorPreviewCard", () => ({
  default: () => <div data-testid="actor-preview">Preview</div>,
}))

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("BiographiesTab", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/actors?tab=biographies"]}>
          <BiographiesTab />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state initially", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

    renderComponent()

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
  })

  it("renders stats cards when data is loaded", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actors: [],
          pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
          stats: { totalActors: 1000, withBiography: 400, withoutBiography: 600 },
        }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText("1,000")).toBeInTheDocument() // Total actors
      expect(screen.getByText("400")).toBeInTheDocument() // With biography
      expect(screen.getByText("600")).toBeInTheDocument() // Without biography
    })
  })

  it("renders actor list when data is loaded", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actors: [
            {
              id: 1,
              tmdbId: 12345,
              name: "John Wayne",
              popularity: 10.5,
              hasBiography: false,
              generatedAt: null,
              hasWikipedia: true,
              hasImdb: true,
            },
          ],
          pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
          stats: { totalActors: 1, withBiography: 0, withoutBiography: 1 },
        }),
    })

    renderComponent()

    await waitFor(() => {
      // Content appears in both mobile card view and desktop table
      expect(screen.getAllByText("John Wayne").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders error message when fetch fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument()
    })
  })

  it("renders filters and batch actions section", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actors: [],
          pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
          stats: { totalActors: 0, withBiography: 0, withoutBiography: 0 },
        }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText("Filters & Batch Actions")).toBeInTheDocument()
      expect(screen.getByLabelText("Min Popularity")).toBeInTheDocument()
      expect(screen.getByLabelText("Biography Status")).toBeInTheDocument()
      expect(screen.getByLabelText("Batch Size")).toBeInTheDocument()
    })
  })

  it("shows batch status panel after queueing a batch job", async () => {
    const biographiesResponse = {
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      stats: { totalActors: 100, withBiography: 50, withoutBiography: 50 },
    }

    const batchQueueResponse = {
      jobId: "test-job-123",
      queued: true,
      message: "Batch queued",
    }

    const jobRunResponse = {
      runs: [
        {
          id: 1,
          job_id: "test-job-123",
          job_type: "generate-biographies-batch",
          status: "active",
          result: null,
          error_message: null,
          queued_at: "2026-01-01T00:00:00Z",
          started_at: "2026-01-01T00:01:00Z",
          completed_at: null,
        },
      ],
    }

    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/admin/api/biographies/generate-batch") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(batchQueueResponse),
        })
      }
      if (url.includes("/admin/api/jobs/runs")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(jobRunResponse),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(biographiesResponse),
      })
    })

    const { getByText } = renderComponent()

    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByText("Generate Top 100")).toBeInTheDocument()
    })

    // Click the batch generate button
    const batchButton = getByText("Generate Top 100")
    batchButton.click()

    // Should show the batch status panel with active state
    await waitFor(() => {
      expect(screen.getByText("Batch processing in progress...")).toBeInTheDocument()
    })
  })

  it("renders new filter dropdowns", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actors: [],
          pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
          stats: { totalActors: 0, withBiography: 0, withoutBiography: 0 },
        }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByLabelText("Vital Status")).toBeInTheDocument()
      expect(screen.getByLabelText("Wikipedia")).toBeInTheDocument()
      expect(screen.getByLabelText("IMDb")).toBeInTheDocument()
      expect(screen.getByLabelText("Enriched Bio")).toBeInTheDocument()
    })
  })

  it("passes sortBy param when clicking column headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actors: [
            {
              id: 1,
              tmdbId: 12345,
              name: "John Wayne",
              popularity: 10.5,
              hasBiography: false,
              generatedAt: null,
              hasWikipedia: true,
              hasImdb: true,
            },
          ],
          pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
          stats: { totalActors: 1, withBiography: 0, withoutBiography: 1 },
        }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText("John Wayne").length).toBeGreaterThanOrEqual(1)
    })

    // Click the "Name" sort header
    const nameHeader = screen.getByRole("button", { name: /Name/ })
    fireEvent.click(nameHeader)

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      const url = lastCall[0] as string
      expect(url).toContain("sortBy=name")
    })
  })

  it("passes filter params when changing dropdowns", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actors: [],
          pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
          stats: { totalActors: 0, withBiography: 0, withoutBiography: 0 },
        }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByLabelText("Vital Status")).toBeInTheDocument()
    })

    // Change vital status to "deceased"
    fireEvent.change(screen.getByLabelText("Vital Status"), { target: { value: "deceased" } })

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      const url = lastCall[0] as string
      expect(url).toContain("vitalStatus=deceased")
    })
  })

  it("shows completed batch results with cost", async () => {
    const biographiesResponse = {
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      stats: { totalActors: 100, withBiography: 50, withoutBiography: 50 },
    }

    const batchQueueResponse = {
      jobId: "test-job-456",
      queued: true,
      message: "Batch queued",
    }

    const completedJobRunResponse = {
      runs: [
        {
          id: 1,
          job_id: "test-job-456",
          job_type: "generate-biographies-batch",
          status: "completed",
          result: {
            success: true,
            data: {
              total: 10,
              succeeded: 8,
              failed: 1,
              skippedNoContent: 1,
              totalCostUsd: 0.0512,
              anthropicBatchId: "batch_abc",
            },
          },
          error_message: null,
          queued_at: "2026-01-01T00:00:00Z",
          started_at: "2026-01-01T00:01:00Z",
          completed_at: "2026-01-01T00:10:00Z",
        },
      ],
    }

    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/admin/api/biographies/generate-batch") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(batchQueueResponse),
        })
      }
      if (url.includes("/admin/api/jobs/runs")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(completedJobRunResponse),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(biographiesResponse),
      })
    })

    const { getByText } = renderComponent()

    await waitFor(() => {
      expect(screen.getByText("Generate Top 100")).toBeInTheDocument()
    })

    getByText("Generate Top 100").click()

    await waitFor(() => {
      expect(
        screen.getByText(/Batch complete: 8 succeeded, 1 failed, 1 skipped/)
      ).toBeInTheDocument()
      expect(screen.getByText(/\$0\.0512/)).toBeInTheDocument()
    })
  })
})
