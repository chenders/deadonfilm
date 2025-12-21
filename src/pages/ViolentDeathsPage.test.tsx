import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import ViolentDeathsPage from "./ViolentDeathsPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getViolentDeaths: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockPersons = [
  {
    rank: 1,
    id: 123,
    name: "Actor One",
    deathday: "2020-03-15",
    causeOfDeath: "Gunshot wound",
    causeOfDeathDetails: "Shot during robbery",
    profilePath: "/path1.jpg",
    ageAtDeath: 45,
  },
  {
    rank: 2,
    id: 456,
    name: "Actor Two",
    deathday: "2019-12-01",
    causeOfDeath: "Suicide",
    causeOfDeathDetails: null,
    profilePath: null,
    ageAtDeath: 52,
  },
]

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/violent-deaths"] } = {}
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
            <Route path="/violent-deaths" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("ViolentDeathsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getViolentDeaths).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<ViolentDeathsPage />)

    expect(screen.getByText("Loading violent deaths...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: {
        page: 1,
        pageSize: 50,
        totalPages: 2,
        totalCount: 100,
      },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Violent Deaths")).toBeInTheDocument()
      expect(
        screen.getByText(/Actors in our database who died from violent causes/)
      ).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("No violent deaths found in our database.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      // Check death info is displayed - use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText(/Age 45/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Gunshot wound").length).toBeGreaterThanOrEqual(1)
      // Details only shown in desktop view
      expect(screen.getByText("Shot during robbery")).toBeInTheDocument()
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getViolentDeaths).toHaveBeenCalledWith({ page: 2, includeSelfInflicted: false })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getViolentDeaths).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<ViolentDeathsPage />, {
      initialEntries: ["/violent-deaths?page=2"],
    })

    await waitFor(() => {
      expect(api.getViolentDeaths).toHaveBeenCalledWith({ page: 2, includeSelfInflicted: false })
    })
  })

  it("renders 'Include all causes' checkbox", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Include all causes")).toBeInTheDocument()
      expect(screen.getByRole("checkbox")).not.toBeChecked()
    })
  })

  it("calls API with includeSelfInflicted when checkbox is checked", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Include all causes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("checkbox"))

    await waitFor(() => {
      expect(api.getViolentDeaths).toHaveBeenCalledWith({ page: 1, includeSelfInflicted: true })
    })
  })

  it("reads includeSelfInflicted from URL parameters", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />, {
      initialEntries: ["/violent-deaths?all=true"],
    })

    await waitFor(() => {
      expect(api.getViolentDeaths).toHaveBeenCalledWith({ page: 1, includeSelfInflicted: true })
      expect(screen.getByRole("checkbox")).toBeChecked()
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("violent-death-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/actor-one-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getViolentDeaths).mockResolvedValue({
      persons: [mockPersons[1]], // Actor Two has no profile path
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<ViolentDeathsPage />)

    await waitFor(() => {
      // The PersonIcon should be rendered as an SVG
      const actorRow = screen.getByTestId("violent-death-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })
})
