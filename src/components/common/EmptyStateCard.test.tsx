import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import EmptyStateCard from "./EmptyStateCard"

describe("EmptyStateCard", () => {
  it("renders no-results type correctly", () => {
    render(<EmptyStateCard type="no-results" />)

    expect(screen.getByTestId("empty-state-card")).toBeInTheDocument()
    expect(screen.getByText("End of Reel")).toBeInTheDocument()
    expect(screen.getByText("No films match your search")).toBeInTheDocument()
  })

  it("renders no-deceased type correctly", () => {
    render(<EmptyStateCard type="no-deceased" />)

    expect(screen.getByTestId("empty-state-card")).toBeInTheDocument()
    expect(screen.getByText("All Present & Accounted For")).toBeInTheDocument()
    expect(screen.getByText("No cast members have passed away")).toBeInTheDocument()
  })

  it("renders quiet-day type correctly", () => {
    render(<EmptyStateCard type="quiet-day" />)

    expect(screen.getByTestId("empty-state-card")).toBeInTheDocument()
    expect(screen.getByText("A Quiet Day")).toBeInTheDocument()
    expect(screen.getByText("No notable deaths recorded for this date")).toBeInTheDocument()
  })

  it("displays search query when provided for no-results", () => {
    render(<EmptyStateCard type="no-results" searchQuery="test movie" />)

    expect(screen.getByText('"test movie"')).toBeInTheDocument()
  })

  it("does not display search query for other types", () => {
    render(<EmptyStateCard type="no-deceased" searchQuery="test movie" />)

    expect(screen.queryByText('"test movie"')).not.toBeInTheDocument()
  })

  it("has film strip decorations", () => {
    const { container } = render(<EmptyStateCard type="no-results" />)

    // Check for film strip decoration elements (10 total - 5 top + 5 bottom)
    const decorations = container.querySelectorAll('[class*="bg-border-theme"]')
    expect(decorations.length).toBe(10)
  })

  it("uses vintage styling with rounded corners and border", () => {
    const { container } = render(<EmptyStateCard type="no-results" />)

    const innerCard = container.querySelector(".rounded-lg.border-2")
    expect(innerCard).toBeInTheDocument()
  })

  it("renders film reel icon for no-results type", () => {
    const { container } = render(<EmptyStateCard type="no-results" />)

    const svg = container.querySelector("svg")
    expect(svg).toBeInTheDocument()
  })

  it("renders person icon for no-deceased type", () => {
    const { container } = render(<EmptyStateCard type="no-deceased" />)

    const svg = container.querySelector("svg")
    expect(svg).toBeInTheDocument()
  })
})
