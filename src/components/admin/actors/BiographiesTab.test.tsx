import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
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
      expect(screen.getByText("John Wayne")).toBeInTheDocument()
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
})
