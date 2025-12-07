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

  it("renders all three action buttons", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByTestId("quick-actions")).toBeInTheDocument()
    expect(screen.getByTestId("high-mortality-btn")).toBeInTheDocument()
    expect(screen.getByTestId("classic-btn")).toBeInTheDocument()
    expect(screen.getByTestId("random-movie-btn")).toBeInTheDocument()
  })

  it("displays correct button text", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("High Mortality")).toBeInTheDocument()
    expect(screen.getByText("Classic Films")).toBeInTheDocument()
    expect(screen.getByText("Surprise Me")).toBeInTheDocument()
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
})
