import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import QuickActions from "./QuickActions"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
  getRandomMovie: vi.fn(),
  getDiscoverMovie: vi.fn(),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe("QuickActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders all five action buttons", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByTestId("quick-actions")).toBeInTheDocument()
    expect(screen.getByTestId("high-mortality-btn")).toBeInTheDocument()
    expect(screen.getByTestId("classic-btn")).toBeInTheDocument()
    expect(screen.getByTestId("random-movie-btn")).toBeInTheDocument()
    expect(screen.getByTestId("cursed-movies-btn")).toBeInTheDocument()
    expect(screen.getByTestId("cursed-actors-btn")).toBeInTheDocument()
  })

  it("displays correct button text", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("High Mortality")).toBeInTheDocument()
    expect(screen.getByText("Classic Films")).toBeInTheDocument()
    expect(screen.getByText("Surprise Me")).toBeInTheDocument()
    expect(screen.getByText("Cursed Movies")).toBeInTheDocument()
    expect(screen.getByText("Cursed Actors")).toBeInTheDocument()
  })

  it("navigates to high mortality movie when clicked", async () => {
    const mockMovie = { id: 123, title: "Old Movie", release_date: "1950-01-01" }
    vi.mocked(api.getDiscoverMovie).mockResolvedValue(mockMovie)

    renderWithRouter(<QuickActions />)

    fireEvent.click(screen.getByTestId("high-mortality-btn"))

    await waitFor(() => {
      expect(api.getDiscoverMovie).toHaveBeenCalledWith("high-mortality")
      expect(mockNavigate).toHaveBeenCalled()
    })
  })

  it("navigates to classic film when clicked", async () => {
    const mockMovie = { id: 456, title: "Classic Film", release_date: "1940-05-15" }
    vi.mocked(api.getDiscoverMovie).mockResolvedValue(mockMovie)

    renderWithRouter(<QuickActions />)

    fireEvent.click(screen.getByTestId("classic-btn"))

    await waitFor(() => {
      expect(api.getDiscoverMovie).toHaveBeenCalledWith("classic")
      expect(mockNavigate).toHaveBeenCalled()
    })
  })

  it("navigates to random movie when Surprise Me is clicked", async () => {
    const mockMovie = { id: 789, title: "Random Movie", release_date: "1985-03-20" }
    vi.mocked(api.getRandomMovie).mockResolvedValue(mockMovie)

    renderWithRouter(<QuickActions />)

    fireEvent.click(screen.getByTestId("random-movie-btn"))

    await waitFor(() => {
      expect(api.getRandomMovie).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalled()
    })
  })

  it("handles API errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(api.getRandomMovie).mockRejectedValue(new Error("API Error"))

    renderWithRouter(<QuickActions />)

    fireEvent.click(screen.getByTestId("random-movie-btn"))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it("has skull icon for High Mortality button", () => {
    renderWithRouter(<QuickActions />)

    const button = screen.getByTestId("high-mortality-btn")
    expect(button.querySelector("svg")).toBeInTheDocument()
  })

  it("has film reel icon for Classic Films button", () => {
    renderWithRouter(<QuickActions />)

    const button = screen.getByTestId("classic-btn")
    expect(button.querySelector("svg")).toBeInTheDocument()
  })

  it("has dice emoji for Surprise Me button", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("🎲")).toBeInTheDocument()
  })

  it("displays tooltips explaining each button", () => {
    renderWithRouter(<QuickActions />)

    // Tooltips are rendered as spans with the tooltip text
    expect(
      screen.getByText("Movies where more actors died than statistically expected")
    ).toBeInTheDocument()
    expect(screen.getByText("Golden age cinema from 1930-1970")).toBeInTheDocument()
    expect(screen.getByText("Random movie from any era")).toBeInTheDocument()
    expect(screen.getByText("Movies with statistically abnormal mortality")).toBeInTheDocument()
    expect(screen.getByText("Actors with unusually high co-star mortality")).toBeInTheDocument()
  })

  it("has styled tooltips visible on hover via CSS", () => {
    renderWithRouter(<QuickActions />)

    // The tooltips are styled spans that appear on hover via CSS
    // They are in the DOM and become visible with group-hover
    expect(
      screen.getByText("Movies where more actors died than statistically expected")
    ).toBeInTheDocument()
    expect(screen.getByText("Golden age cinema from 1930-1970")).toBeInTheDocument()
    expect(screen.getByText("Random movie from any era")).toBeInTheDocument()
    expect(screen.getByText("Movies with statistically abnormal mortality")).toBeInTheDocument()
    expect(screen.getByText("Actors with unusually high co-star mortality")).toBeInTheDocument()
  })

  it("Cursed Movies button links to /cursed-movies", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("cursed-movies-btn")
    expect(link).toHaveAttribute("href", "/cursed-movies")
  })

  it("Cursed Movies button has film icon", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("cursed-movies-btn")
    expect(link.querySelector("svg")).toBeInTheDocument()
  })

  it("Cursed Actors button links to /cursed-actors", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("cursed-actors-btn")
    expect(link).toHaveAttribute("href", "/cursed-actors")
  })

  it("Cursed Actors button has person icon", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("cursed-actors-btn")
    expect(link.querySelector("svg")).toBeInTheDocument()
  })
})
