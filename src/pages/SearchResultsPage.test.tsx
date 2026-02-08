import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import SearchResultsPage from "./SearchResultsPage"

const futureFlags = { v7_startTransition: true, v7_relativeSplatPath: true }

const mockMovieResults = [
  {
    id: 14629,
    title: "Breakfast at Tiffany's",
    release_date: "1961-10-05",
    poster_path: "/poster1.jpg",
    overview: "A romantic comedy",
    media_type: "movie" as const,
  },
  {
    id: 550,
    title: "Fight Club",
    release_date: "1999-10-15",
    poster_path: "/poster2.jpg",
    overview: "An insomniac meets a soap salesman",
    media_type: "movie" as const,
  },
]

const mockTvResults = [
  {
    id: 1396,
    title: "Breaking Bad",
    release_date: "2008-01-20",
    poster_path: "/bb.jpg",
    overview: "A chemistry teacher turns to crime",
    media_type: "tv" as const,
  },
]

const mockPersonResults = [
  {
    id: 4165,
    title: "John Wayne",
    release_date: "",
    poster_path: "/wayne.jpg",
    overview: "",
    media_type: "person" as const,
    is_deceased: true,
    death_year: 1979,
    birth_year: 1907,
  },
  {
    id: 500,
    title: "Tom Cruise",
    release_date: "",
    poster_path: "/cruise.jpg",
    overview: "",
    media_type: "person" as const,
    is_deceased: false,
    birth_year: 1962,
  },
]

const allResults = [...mockMovieResults, ...mockTvResults, ...mockPersonResults]

let mockReturnValue: { data: { results: typeof allResults } | null; isLoading: boolean } = {
  data: { results: allResults },
  isLoading: false,
}

vi.mock("@/hooks/useUnifiedSearch", () => ({
  useUnifiedSearch: vi.fn(() => mockReturnValue),
}))

function renderPage(initialPath = "/search?q=test") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={futureFlags} initialEntries={[initialPath]}>
          <Routes>
            <Route path="/search" element={<SearchResultsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )
}

describe("SearchResultsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturnValue = {
      data: { results: allResults },
      isLoading: false,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders with query from URL params", () => {
    renderPage("/search?q=titanic")

    const input = screen.getByTestId("search-page-input")
    expect(input).toHaveValue("titanic")
  })

  it("displays results grouped by type in 'all' mode", () => {
    renderPage("/search?q=test")

    // Section headers are h2 elements, distinct from toggle buttons
    const headings = screen.getAllByRole("heading", { level: 2 })
    const headingTexts = headings.map((h) => h.textContent)
    expect(headingTexts).toContain("Movies")
    expect(headingTexts).toContain("TV Shows")
    expect(headingTexts).toContain("People")
  })

  it("renders result cards with correct content", () => {
    renderPage("/search?q=test")

    expect(screen.getByText("Breakfast at Tiffany's")).toBeInTheDocument()
    expect(screen.getByText("Fight Club")).toBeInTheDocument()
    expect(screen.getByText("Breaking Bad")).toBeInTheDocument()
    expect(screen.getByText("John Wayne")).toBeInTheDocument()
    expect(screen.getByText("Tom Cruise")).toBeInTheDocument()
  })

  it("links to correct detail pages", () => {
    renderPage("/search?q=test")

    const cards = screen.getAllByTestId("search-result-card")

    // Movie link
    const movieCard = cards.find((c) => c.textContent?.includes("Breakfast at Tiffany's"))
    expect(movieCard).toHaveAttribute("href", expect.stringContaining("/movie/"))
    expect(movieCard).toHaveAttribute("href", expect.stringContaining("14629"))

    // TV show link
    const tvCard = cards.find((c) => c.textContent?.includes("Breaking Bad"))
    expect(tvCard).toHaveAttribute("href", expect.stringContaining("/show/"))
    expect(tvCard).toHaveAttribute("href", expect.stringContaining("1396"))

    // Person link
    const personCard = cards.find((c) => c.textContent?.includes("John Wayne"))
    expect(personCard).toHaveAttribute("href", expect.stringContaining("/actor/"))
    expect(personCard).toHaveAttribute("href", expect.stringContaining("4165"))
  })

  it("shows noindex for short queries", () => {
    renderPage("/search?q=ab")

    // The SEO component adds noindex meta tag
    const metaRobots = document.querySelector('meta[name="robots"]')
    expect(metaRobots).toHaveAttribute("content", "noindex, follow")
  })

  it("shows noindex for empty results", () => {
    mockReturnValue = { data: { results: [] }, isLoading: false }

    renderPage("/search?q=xyznonexistent")

    const metaRobots = document.querySelector('meta[name="robots"]')
    expect(metaRobots).toHaveAttribute("content", "noindex, follow")
  })

  it("shows canonical URL for valid queries", () => {
    renderPage("/search?q=titanic")

    const canonical = document.querySelector('link[rel="canonical"]')
    expect(canonical).toHaveAttribute("href", "https://deadonfilm.com/search?q=titanic")
  })

  it("normalizes canonical URL to lowercase", () => {
    renderPage("/search?q=TITANIC")

    const canonical = document.querySelector('link[rel="canonical"]')
    expect(canonical).toHaveAttribute("href", "https://deadonfilm.com/search?q=titanic")
  })

  it("renders empty state when no query", () => {
    mockReturnValue = { data: null, isLoading: false }

    renderPage("/search")

    expect(screen.getByTestId("search-empty-state")).toBeInTheDocument()
    expect(
      screen.getByText("Enter a search term to find movies, TV shows, and people.")
    ).toBeInTheDocument()
  })

  it("renders 'End of Reel' empty state for no results", () => {
    mockReturnValue = { data: { results: [] }, isLoading: false }

    renderPage("/search?q=xyznonexistent")

    expect(screen.getByTestId("search-no-results")).toBeInTheDocument()
    expect(screen.getByText("End of Reel")).toBeInTheDocument()
  })

  it("renders media type toggle", () => {
    renderPage("/search?q=test")

    expect(screen.getByRole("radiogroup")).toBeInTheDocument()
  })

  it("reads type parameter from URL", () => {
    renderPage("/search?q=test&type=movie")

    const movieButton = screen.getByTestId("media-type-movie")
    expect(movieButton).toHaveAttribute("aria-checked", "true")
  })

  it("defaults to 'all' when type param is missing", () => {
    renderPage("/search?q=test")

    const allButton = screen.getByTestId("media-type-all")
    expect(allButton).toHaveAttribute("aria-checked", "true")
  })

  it("does not group results when a specific type is selected", () => {
    renderPage("/search?q=test&type=movie")

    // Section headers (h2) should not exist when type is filtered
    const headings = screen.queryAllByRole("heading", { level: 2 })
    const headingTexts = headings.map((h) => h.textContent)
    expect(headingTexts).not.toContain("Movies")
    expect(headingTexts).not.toContain("TV Shows")
    expect(headingTexts).not.toContain("People")
  })

  it("updates input when user types", async () => {
    renderPage("/search?q=initial")

    const input = screen.getByTestId("search-page-input")
    fireEvent.change(input, { target: { value: "new query" } })

    expect(input).toHaveValue("new query")
  })

  it("shows person death info in subtitle", () => {
    renderPage("/search?q=test")

    expect(screen.getByText("Died 1979 (age 72)")).toBeInTheDocument()
    expect(screen.getByText("b. 1962")).toBeInTheDocument()
  })

  it("shows media type badges on results", () => {
    renderPage("/search?q=test")

    expect(screen.getAllByText("Film").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("TV").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Person").length).toBeGreaterThanOrEqual(1)
  })

  it("shows loading state when searching", () => {
    mockReturnValue = { data: null, isLoading: true }

    renderPage("/search?q=loading")

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
  })

  it("sets page title with query", async () => {
    renderPage("/search?q=titanic")

    await waitFor(() => {
      expect(document.title).toContain("titanic")
    })
  })
})
