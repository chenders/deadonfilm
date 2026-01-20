import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import DeathsByDecadePage from "./DeathsByDecadePage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getDeathsByDecade: vi.fn(),
  getDecadeCategories: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockDeaths = [
  {
    id: 123,
    name: "Actor One",
    deathday: "1995-03-15",
    causeOfDeath: "Cancer",
    profilePath: "/path1.jpg",
    ageAtDeath: 72,
    yearsLost: 8,
  },
  {
    id: 456,
    name: "Actor Two",
    deathday: "1992-12-01",
    causeOfDeath: "Heart Attack",
    profilePath: null,
    ageAtDeath: 65,
    yearsLost: 12,
  },
]

const mockResponse = {
  decade: 1990,
  decadeLabel: "1990s",
  deaths: mockDeaths,
  pagination: {
    page: 1,
    pageSize: 50,
    totalPages: 2,
    totalCount: 100,
  },
}

const mockDecadeCategories = {
  decades: [
    {
      decade: 1980,
      count: 50,
      featuredActor: {
        id: 1,
        tmdbId: 123,
        name: "John Doe",
        profilePath: "/test.jpg",
        causeOfDeath: "Natural causes",
      },
      topCauses: [{ cause: "Natural causes", count: 20, slug: "natural-causes" }],
      topMovie: {
        tmdbId: 100,
        title: "The Shining",
        releaseYear: 1980,
        backdropPath: "/shining.jpg",
      },
    },
    {
      decade: 1990,
      count: 100,
      featuredActor: {
        id: 2,
        tmdbId: 456,
        name: "Jane Doe",
        profilePath: null,
        causeOfDeath: "Cancer",
      },
      topCauses: [{ cause: "Cancer", count: 40, slug: "cancer" }],
      topMovie: { tmdbId: 200, title: "Titanic", releaseYear: 1997, backdropPath: "/titanic.jpg" },
    },
    {
      decade: 2000,
      count: 150,
      featuredActor: null,
      topCauses: [],
      topMovie: null,
    },
  ],
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/deaths/decade/1990s"] } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <MemoryRouter
          initialEntries={initialEntries}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/deaths/decade/:decade" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("DeathsByDecadePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getDecadeCategories).mockResolvedValue(mockDecadeCategories)
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getDeathsByDecade).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<DeathsByDecadePage />)

    expect(screen.getByText("Loading deaths...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title with decade", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("Deaths in the 1990s")).toBeInTheDocument()
      expect(screen.getByText(/100 actors died during this decade/)).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue({
      ...mockResponse,
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("No deaths found for this decade.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getAllByText(/Age 72/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText("8 years lost")).toBeInTheDocument()
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getDeathsByDecade).toHaveBeenCalledWith("1990s", {
        page: 2,
        includeObscure: false,
      })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue({
      ...mockResponse,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getDeathsByDecade).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue({
      ...mockResponse,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<DeathsByDecadePage />, {
      initialEntries: ["/deaths/decade/1990s?page=2"],
    })

    await waitFor(() => {
      expect(api.getDeathsByDecade).toHaveBeenCalledWith("1990s", {
        page: 2,
        includeObscure: false,
      })
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("death-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/actor-one-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue({
      ...mockResponse,
      deaths: [mockDeaths[1]], // Actor Two has no profile path
    })

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("death-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getDeathsByDecade).toHaveBeenCalledWith("1990s", {
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />, {
      initialEntries: ["/deaths/decade/1990s?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getDeathsByDecade).toHaveBeenCalledWith("1990s", {
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("renders back link to all decades", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      const backLink = screen.getByText("← All Decades")
      expect(backLink).toHaveAttribute("href", "/deaths/decades")
    })
  })

  it("renders decade selector with links to other decades", async () => {
    vi.mocked(api.getDeathsByDecade).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByDecadePage />)

    await waitFor(() => {
      expect(screen.getByText("1980s")).toBeInTheDocument()
      expect(screen.getByText("1990s")).toBeInTheDocument()
      expect(screen.getByText("2000s")).toBeInTheDocument()
    })

    // Current decade should be highlighted
    const currentDecade = screen.getByText("1990s")
    expect(currentDecade).toHaveClass("bg-brown-dark")
  })
})
