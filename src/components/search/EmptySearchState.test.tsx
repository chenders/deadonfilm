import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TestRouter } from "@/test/test-utils"
import EmptySearchState from "./EmptySearchState"
import type { SearchMediaType } from "@/types"

vi.mock("@/services/api", () => ({
  getRandomPopularMovies: vi.fn(() =>
    Promise.resolve({
      movies: [
        {
          id: 1,
          title: "The Godfather",
          releaseYear: 1972,
          posterPath: "/godfather.jpg",
          deceasedCount: 15,
          castCount: 20,
          popularity: 100,
        },
        {
          id: 2,
          title: "Goodfellas",
          releaseYear: 1990,
          posterPath: "/goodfellas.jpg",
          deceasedCount: 8,
          castCount: 25,
          popularity: 80,
        },
      ],
    })
  ),
  getPosterUrl: vi.fn((path: string) => (path ? `https://image.tmdb.org/t/p/w92${path}` : null)),
}))

function renderComponent({
  query = "braking bad",
  mediaType = "all" as SearchMediaType,
  onTypeChange = vi.fn(),
  variant = "compact" as "compact" | "full",
  onNavigate = vi.fn(),
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return {
    onTypeChange,
    onNavigate,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TestRouter>
          <EmptySearchState
            query={query}
            mediaType={mediaType}
            onTypeChange={onTypeChange}
            variant={variant}
            onNavigate={onNavigate}
          />
        </TestRouter>
      </QueryClientProvider>
    ),
  }
}

describe("EmptySearchState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows 'End of Reel' heading and echoes the query", () => {
    renderComponent({ query: "Braking Bad" })

    expect(screen.getByText("End of Reel")).toBeInTheDocument()
    expect(screen.getByText("Braking Bad")).toBeInTheDocument()
  })

  it("shows generic suggestions for 'all' media type", () => {
    renderComponent({ mediaType: "all" })

    expect(screen.getByText("Check your spelling")).toBeInTheDocument()
    expect(screen.getByText("Try a shorter query")).toBeInTheDocument()
  })

  it("shows clickable type-switch suggestions for 'movie' media type", () => {
    const { onTypeChange } = renderComponent({ mediaType: "movie" })

    const tvButton = screen.getByTestId("suggestion-tv")
    expect(tvButton).toHaveTextContent("Try TV Shows instead")

    fireEvent.click(tvButton)
    expect(onTypeChange).toHaveBeenCalledWith("tv")
  })

  it("shows clickable type-switch suggestions for 'tv' media type", () => {
    const { onTypeChange } = renderComponent({ mediaType: "tv" })

    const movieButton = screen.getByTestId("suggestion-movie")
    expect(movieButton).toHaveTextContent("Try Movies instead")

    fireEvent.click(movieButton)
    expect(onTypeChange).toHaveBeenCalledWith("movie")
  })

  it("shows clickable type-switch suggestions for 'person' media type", () => {
    const { onTypeChange } = renderComponent({ mediaType: "person" })

    const movieButton = screen.getByTestId("suggestion-movie")
    expect(movieButton).toHaveTextContent("Try Movies instead")

    fireEvent.click(movieButton)
    expect(onTypeChange).toHaveBeenCalledWith("movie")
  })

  it("shows browse links", () => {
    renderComponent()

    expect(screen.getByText("Notable Deaths")).toBeInTheDocument()
    expect(screen.getByText("Causes")).toBeInTheDocument()
    expect(screen.getByText("Decades")).toBeInTheDocument()
    expect(screen.getByText("Forever Young")).toBeInTheDocument()
  })

  it("shows popular movies from API", async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText("The Godfather")).toBeInTheDocument()
      expect(screen.getByText("Goodfellas")).toBeInTheDocument()
    })
  })

  it("calls onNavigate when a browse link is clicked", () => {
    const { onNavigate } = renderComponent()

    fireEvent.click(screen.getByText("Notable Deaths"))
    expect(onNavigate).toHaveBeenCalled()
  })

  it("calls onNavigate when a popular movie is clicked", async () => {
    const { onNavigate } = renderComponent()

    await waitFor(() => {
      expect(screen.getByText("The Godfather")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("The Godfather"))
    expect(onNavigate).toHaveBeenCalled()
  })

  it("uses larger text in full variant", () => {
    renderComponent({ variant: "full" })

    const heading = screen.getByText("End of Reel")
    expect(heading.className).toContain("text-lg")
  })

  it("uses smaller text in compact variant", () => {
    renderComponent({ variant: "compact" })

    const heading = screen.getByText("End of Reel")
    expect(heading.className).toContain("text-sm")
  })

  it("renders without popular movies when API fails", async () => {
    const { getRandomPopularMovies } = await import("@/services/api")
    vi.mocked(getRandomPopularMovies).mockRejectedValueOnce(new Error("Network error"))

    renderComponent()

    // Core UI still renders
    expect(screen.getByText("End of Reel")).toBeInTheDocument()
    expect(screen.getByText("Notable Deaths")).toBeInTheDocument()

    // Popular movies section does not appear
    await waitFor(() => {
      expect(screen.queryByText("Popular on Dead on Film:")).not.toBeInTheDocument()
    })
  })
})
