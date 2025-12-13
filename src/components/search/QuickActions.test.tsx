import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import QuickActions from "./QuickActions"
import * as api from "@/services/api"

// Mock the API
vi.mock("@/services/api", () => ({
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
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

describe("QuickActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders all four action buttons", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByTestId("quick-actions")).toBeInTheDocument()
    expect(screen.getByTestId("forever-young-btn")).toBeInTheDocument()
    expect(screen.getByTestId("cursed-movies-btn")).toBeInTheDocument()
    expect(screen.getByTestId("cursed-actors-btn")).toBeInTheDocument()
    expect(screen.getByTestId("covid-deaths-btn")).toBeInTheDocument()
  })

  it("displays correct button text", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("Forever Young")).toBeInTheDocument()
    expect(screen.getByText("Cursed Movies")).toBeInTheDocument()
    expect(screen.getByText("Cursed Actors")).toBeInTheDocument()
    expect(screen.getByText("COVID-19")).toBeInTheDocument()
  })

  it("navigates to forever young movie when clicked", async () => {
    const mockMovie = { id: 123, title: "Tragic Movie", release_date: "1985-01-01" }
    vi.mocked(api.getDiscoverMovie).mockResolvedValue(mockMovie)

    renderWithRouter(<QuickActions />)

    fireEvent.click(screen.getByTestId("forever-young-btn"))

    await waitFor(() => {
      expect(api.getDiscoverMovie).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalled()
    })
  })

  it("handles API errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(api.getDiscoverMovie).mockRejectedValue(new Error("API Error"))

    renderWithRouter(<QuickActions />)

    fireEvent.click(screen.getByTestId("forever-young-btn"))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it("has angel emoji for Forever Young button", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("👼")).toBeInTheDocument()
  })

  it("displays tooltips explaining each button", () => {
    renderWithRouter(<QuickActions />)

    // Tooltips are rendered as spans with the tooltip text
    expect(
      screen.getByText("Movies featuring actors who died tragically young")
    ).toBeInTheDocument()
    expect(screen.getByText("Movies with statistically abnormal mortality")).toBeInTheDocument()
    expect(screen.getByText("Actors with unusually high co-star mortality")).toBeInTheDocument()
    expect(screen.getByText("Actors who died from COVID-19")).toBeInTheDocument()
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

  it("COVID-19 button links to /covid-deaths", () => {
    renderWithRouter(<QuickActions />)

    const link = screen.getByTestId("covid-deaths-btn")
    expect(link).toHaveAttribute("href", "/covid-deaths")
  })

  it("COVID-19 button has microbe emoji", () => {
    renderWithRouter(<QuickActions />)

    expect(screen.getByText("🦠")).toBeInTheDocument()
  })
})
