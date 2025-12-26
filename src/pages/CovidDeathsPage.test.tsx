import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import CovidDeathsPage from "./CovidDeathsPage"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getCovidDeaths: vi.fn(),
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockPersons = [
  {
    rank: 1,
    id: 123,
    name: "Actor One",
    deathday: "2021-03-15",
    causeOfDeath: "COVID-19",
    causeOfDeathDetails: "Complications from COVID-19",
    profilePath: "/path1.jpg",
    ageAtDeath: 72,
  },
  {
    rank: 2,
    id: 456,
    name: "Actor Two",
    deathday: "2020-12-01",
    causeOfDeath: "Coronavirus",
    causeOfDeathDetails: null,
    profilePath: null,
    ageAtDeath: 65,
  },
]

function renderWithProviders(ui: React.ReactElement, { initialEntries = ["/covid-deaths"] } = {}) {
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
            <Route path="/covid-deaths" element={ui} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  )
}

describe("CovidDeathsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state initially", () => {
    vi.mocked(api.getCovidDeaths).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderWithProviders(<CovidDeathsPage />)

    expect(screen.getByText("Loading COVID-19 deaths...")).toBeInTheDocument()
  })

  it("renders actor list when data loads", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: {
        page: 1,
        pageSize: 50,
        totalPages: 2,
        totalCount: 100,
      },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("renders page title and description", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("COVID-19 Deaths")).toBeInTheDocument()
      // Default state (includeObscure=false) shows "Well-known actors" description
      expect(
        screen.getByText(/Well-known actors in our database who died from COVID-19/)
      ).toBeInTheDocument()
    })
  })

  it("shows empty state when no results", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: [],
      pagination: { page: 1, pageSize: 50, totalPages: 0, totalCount: 0 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("No COVID-19 deaths found in our database.")).toBeInTheDocument()
    })
  })

  it("displays actor details correctly", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      // Check death info is displayed - use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText(/Age 72/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("COVID-19").length).toBeGreaterThanOrEqual(1)
      // Details only shown in desktop view
      expect(screen.getByText("Complications from COVID-19")).toBeInTheDocument()
    })
  })

  it("renders pagination controls when multiple pages", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument()
      expect(screen.getByText("Next")).toBeInTheDocument()
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    })
  })

  it("disables Previous button on first page", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeDisabled()
      expect(screen.getByText("Next")).not.toBeDisabled()
    })
  })

  it("calls API with page 2 when Next is clicked", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Next"))

    await waitFor(() => {
      expect(api.getCovidDeaths).toHaveBeenCalledWith({ page: 2, includeObscure: false })
    })
  })

  it("hides pagination when only one page", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      // Use getAllByText since responsive layout renders both desktop and mobile versions
      expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.queryByText("Previous")).not.toBeInTheDocument()
    expect(screen.queryByText("Next")).not.toBeInTheDocument()
  })

  it("renders error state when API fails", async () => {
    vi.mocked(api.getCovidDeaths).mockRejectedValue(new Error("API Error"))

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByTestId("error-text")).toHaveTextContent("API Error")
  })

  it("shows total count footer", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 2, totalCount: 100 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 100 actors")).toBeInTheDocument()
    })
  })

  it("reads page from URL parameters", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 2, pageSize: 50, totalPages: 3, totalCount: 150 },
    })

    renderWithProviders(<CovidDeathsPage />, {
      initialEntries: ["/covid-deaths?page=2"],
    })

    await waitFor(() => {
      expect(api.getCovidDeaths).toHaveBeenCalledWith({ page: 2, includeObscure: false })
    })
  })

  it("actor rows link to actor profile pages", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      const actorRow = screen.getByTestId("covid-death-row-123")
      expect(actorRow).toHaveAttribute("href", "/actor/actor-one-123")
    })
  })

  it("displays placeholder icon when no profile image", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: [mockPersons[1]], // Actor Two has no profile path
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 1 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      // The PersonIcon should be rendered as an SVG
      const actorRow = screen.getByTestId("covid-death-row-456")
      expect(actorRow.querySelector("svg")).toBeInTheDocument()
    })
  })

  it("renders include obscure filter checkbox", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
      expect(screen.getByText("Include lesser-known actors")).toBeInTheDocument()
    })
  })

  it("calls API with includeObscure when checkbox is checked", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />)

    await waitFor(() => {
      expect(screen.getByTestId("include-obscure-filter")).toBeInTheDocument()
    })

    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(api.getCovidDeaths).toHaveBeenCalledWith({
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("reads includeObscure from URL parameters", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />, {
      initialEntries: ["/covid-deaths?includeObscure=true"],
    })

    await waitFor(() => {
      expect(api.getCovidDeaths).toHaveBeenCalledWith({
        page: 1,
        includeObscure: true,
      })
    })
  })

  it("shows different description when includeObscure is checked", async () => {
    vi.mocked(api.getCovidDeaths).mockResolvedValue({
      persons: mockPersons,
      pagination: { page: 1, pageSize: 50, totalPages: 1, totalCount: 2 },
    })

    renderWithProviders(<CovidDeathsPage />, {
      initialEntries: ["/covid-deaths?includeObscure=true"],
    })

    await waitFor(() => {
      expect(
        screen.getByText(/All actors in our database who died from COVID-19/)
      ).toBeInTheDocument()
    })
  })
})
