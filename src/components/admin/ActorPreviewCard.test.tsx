import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ActorPreviewCard from "./ActorPreviewCard"

// Mock the hook
vi.mock("../../hooks/admin/useCoverage", () => ({
  useActorPreview: vi.fn(),
}))

import { useActorPreview } from "../../hooks/admin/useCoverage"

const mockUseActorPreview = vi.mocked(useActorPreview)

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("ActorPreviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading skeleton while fetching", () => {
    mockUseActorPreview.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    // Check for skeleton elements (multiple will exist)
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0)
    expect(screen.getByLabelText("Loading movie list")).toBeInTheDocument()
  })

  it("shows error message on error", () => {
    mockUseActorPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed"),
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    expect(screen.getByText("Failed to load preview")).toBeInTheDocument()
  })

  it("displays movies with title, year, character, and popularity", () => {
    mockUseActorPreview.mockReturnValue({
      data: {
        topMovies: [
          {
            title: "The Godfather",
            releaseYear: 1972,
            character: "Vito Corleone",
            popularity: 85.5,
          },
          { title: "Scarface", releaseYear: 1983, character: "Tony Montana", popularity: 72.3 },
        ],
        topShows: [],
        totalMovies: 50,
        totalShows: 10,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    expect(screen.getByText("Top Movies")).toBeInTheDocument()
    expect(screen.getByText("The Godfather")).toBeInTheDocument()
    expect(screen.getByText("(1972)")).toBeInTheDocument()
    expect(screen.getByText("as Vito Corleone")).toBeInTheDocument()
    expect(screen.getByText("85.5")).toBeInTheDocument()
    expect(screen.getByText("Scarface")).toBeInTheDocument()
  })

  it("displays shows with name, year, character, and episode count", () => {
    mockUseActorPreview.mockReturnValue({
      data: {
        topMovies: [],
        topShows: [
          { name: "Breaking Bad", firstAirYear: 2008, character: "Walter White", episodeCount: 62 },
        ],
        totalMovies: 5,
        totalShows: 3,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    expect(screen.getByText("Top Shows")).toBeInTheDocument()
    expect(screen.getByText("Breaking Bad")).toBeInTheDocument()
    expect(screen.getByText("(2008)")).toBeInTheDocument()
    expect(screen.getByText("as Walter White")).toBeInTheDocument()
    expect(screen.getByText("62 ep")).toBeInTheDocument()
  })

  it("displays total counts", () => {
    mockUseActorPreview.mockReturnValue({
      data: {
        topMovies: [{ title: "Test Movie", releaseYear: 2020, character: null, popularity: 10 }],
        topShows: [],
        totalMovies: 25,
        totalShows: 8,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    expect(screen.getByText("25 movies, 8 shows total")).toBeInTheDocument()
  })

  it("shows message when no filmography data", () => {
    mockUseActorPreview.mockReturnValue({
      data: {
        topMovies: [],
        topShows: [],
        totalMovies: 0,
        totalShows: 0,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    expect(screen.getByText("No filmography data available")).toBeInTheDocument()
  })

  it("handles singular counts correctly", () => {
    mockUseActorPreview.mockReturnValue({
      data: {
        topMovies: [{ title: "Test", releaseYear: 2020, character: null, popularity: 10 }],
        topShows: [],
        totalMovies: 1,
        totalShows: 1,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useActorPreview>)

    renderWithClient(<ActorPreviewCard actorId={123} />)

    expect(screen.getByText("1 movie, 1 show total")).toBeInTheDocument()
  })
})
