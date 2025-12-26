import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import DeathsByCausePage from "./DeathsByCausePage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getDeathsByCause: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockDeaths = [
  {
    id: 123,
    name: "Actor One",
    deathday: "2020-03-15",
    causeOfDeath: "Heart Attack",
    causeOfDeathDetails: "Cardiac arrest",
    profilePath: "/path1.jpg",
    ageAtDeath: 72,
    yearsLost: 8,
  },
  {
    id: 456,
    name: "Actor Two",
    deathday: "2019-12-01",
    causeOfDeath: "Heart Attack",
    causeOfDeathDetails: null,
    profilePath: null,
    ageAtDeath: 65,
    yearsLost: 12,
  },
]

const mockResponse = {
  cause: "Heart Attack",
  slug: "heart-attack",
  deaths: mockDeaths,
  pagination: {
    page: 1,
    pageSize: 50,
    totalPages: 2,
    totalCount: 100,
  },
}

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/deaths/heart-attack"] } = {}
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
            <Route path="/deaths/:cause" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("DeathsByCausePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getDeathsByCause).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<DeathsByCausePage />)

    expect(screen.getByText("Loading deaths...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title with cause of death", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Heart Attack")).toBeInTheDocument()
      expect(screen.getByText(/100 actors died from this cause/)).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue({
      ...mockResponse,
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByText("No deaths found for this cause.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getAllByText(/Age 72/).length).toBeGreaterThanOrEqual(1)
      // Years lost should be visible in both mobile and desktop views
      expect(screen.getAllByText("8 years lost").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
        page: 2,
        includeObscure: false,
      })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue({
      ...mockResponse,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getDeathsByCause).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue({
      ...mockResponse,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<DeathsByCausePage />, {
      initialEntries: ["/deaths/heart-attack?page=2"],
    })

    await waitFor(() => {
      expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
        page: 2,
        includeObscure: false,
      })
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("death-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/actor-one-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue({
      ...mockResponse,
      deaths: [mockDeaths[1]], // Actor Two has no profile path
    })

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("death-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />, {
      initialEntries: ["/deaths/heart-attack?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getDeathsByCause).toHaveBeenCalledWith("heart-attack", {
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("renders back link to all causes", async () => {
    vi.mocked(api.getDeathsByCause).mockResolvedValue(mockResponse)

    renderWithProviders(<DeathsByCausePage />)

    await waitFor(() => {
      const backLink = screen.getByText("← All Causes")
      expect(backLink).toHaveAttribute("href", "/deaths")
    })
  })
})
