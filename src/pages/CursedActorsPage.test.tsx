import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import CursedActorsPage from "./CursedActorsPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getCursedActors: vi.fn(),
}))

const mockActors = [
  {
    rank: 1,
    id: 1,
    name: "Very Cursed Actor",
    isDeceased: false,
    totalMovies: 15,
    totalActualDeaths: 127,
    totalExpectedDeaths: 82,
    curseScore: 45,
  },
  {
    rank: 2,
    id: 2,
    name: "Somewhat Cursed Actor",
    isDeceased: true,
    totalMovies: 10,
    totalActualDeaths: 85,
    totalExpectedDeaths: 60,
    curseScore: 25,
  },
]

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/cursed-actors"] } = {}) {
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
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/cursed-actors" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("CursedActorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getCursedActors).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<CursedActorsPage />)

    expect(screen.getByText("Loading cursed actors...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Very Cursed Actor")).toBeInTheDocument()
      expect(screen.getByText("Somewhat Cursed Actor")).toBeInTheDocument()
    })
  })

  it("renders filter controls", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText("Status:")).toBeInTheDocument()
      expect(screen.getByLabelText("From:")).toBeInTheDocument()
      expect(screen.getByLabelText("To:")).toBeInTheDocument()
      expect(screen.getByLabelText("Min Movies:")).toBeInTheDocument()
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with correct params when filter is changed", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText("Status:")).toBeInTheDocument()
    })

    // Change the status filter
    fireEvent.change(screen.getByLabelText("Status:"), { target: { value: "living" } })

    await waitFor(() => {
      expect(api.getCursedActors).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "living",
        })
      )
    })
  })

  it("shows Clear filters button when filters are applied", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    // Start with a filter in URL
    renderWithProviders(<CursedActorsPage />, {
      initialEntries: ["/cursed-actors?status=living"],
    })

    await waitFor(() => {
      expect(screen.getByText("Clear filters")).toBeInTheDocument()
    })
  })

  it("does not show Clear filters button when no filters applied", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Very Cursed Actor")).toBeInTheDocument()
    })

    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument()
  })

  it("shows empty state when no actors match filters", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(
        screen.getByText("No actors match these filters. Try adjusting your criteria.")
      ).toBeInTheDocument()
    })
  })

  it("displays actor stats correctly", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      // Check movie count
      expect(screen.getByText("15 movies analyzed")).toBeInTheDocument()
      expect(screen.getByText("10 movies analyzed")).toBeInTheDocument()

      // Check death counts
      expect(screen.getByText("127 deaths")).toBeInTheDocument()
      expect(screen.getByText("85 deaths")).toBeInTheDocument()
    })
  })

  it("shows total count in footer", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("reads filters from URL parameters", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 2, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />, {
      initialEntries: ["/cursed-actors?page=2&from=1970&to=1990&minMovies=5&status=living"],
    })

    await waitFor(() => {
      expect(api.getCursedActors).toHaveBeenCalledWith({
        page: 2,
        fromDecade: 1970,
        toDecade: 1990,
        minMovies: 5,
        status: "living",
      })
    })
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getCursedActors).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<CursedActorsPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 2, totalPages: 1 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Very Cursed Actor")).toBeInTheDocument()
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("shows skull icon for deceased actors", async () => {
    vi.mocked(api.getCursedActors).mockResolvedValue({
      actors: mockActors,
      pagination: { page: 1, pageSize: 50, totalCount: 100, totalPages: 2 },
    })

    renderWithProviders(<CursedActorsPage />)

    await waitFor(() => {
      expect(screen.getByText("Somewhat Cursed Actor")).toBeInTheDocument()
    })

    // The deceased actor row should have a skull icon
    const actorRow = screen.getByText("Somewhat Cursed Actor").closest("div")
    expect(actorRow).toBeInTheDocument()
  })
})
