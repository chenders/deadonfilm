import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import MiniTimeline from "./MiniTimeline"
import type { DeceasedActor } from "@/types"

const mockDeceased: DeceasedActor[] = [
  {
    id: 1,
    name: "Actor One",
    character: "Character A",
    profile_path: "/path1.jpg",
    birthday: "1936-01-01",
    deathday: "2001-05-15",
    ageAtDeath: 65,
    causeOfDeath: "natural causes",
    causeOfDeathDetails: "Died peacefully at home",
    wikipediaUrl: null,
    tmdbUrl: "https://tmdb.org/person/1",
    yearsLost: null,
  },
  {
    id: 2,
    name: "Actor Two",
    character: "Character B",
    profile_path: null,
    birthday: "1929-06-15",
    deathday: "2001-11-20",
    ageAtDeath: 72,
    causeOfDeath: null,
    causeOfDeathDetails: null,
    wikipediaUrl: null,
    tmdbUrl: "https://tmdb.org/person/2",
    yearsLost: null,
  },
  {
    id: 3,
    name: "Actor Three",
    character: "Character C",
    profile_path: "/path3.jpg",
    birthday: "1930-03-20",
    deathday: "2010-03-10",
    ageAtDeath: 80,
    causeOfDeath: "cancer",
    causeOfDeathDetails: null,
    wikipediaUrl: null,
    tmdbUrl: "https://tmdb.org/person/3",
    yearsLost: null,
  },
]

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe("MiniTimeline", () => {
  it("renders nothing when deceased array is empty", () => {
    const { container } = renderWithRouter(<MiniTimeline releaseYear={1999} deceased={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the timeline with header", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    expect(screen.getByTestId("mini-timeline")).toBeInTheDocument()
    expect(screen.getByText("Deaths Over Time")).toBeInTheDocument()
  })

  it("shows the release year event", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    expect(screen.getByText("1999")).toBeInTheDocument()
    expect(screen.getByText("Movie Released")).toBeInTheDocument()
  })

  it("shows the current year event", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    const currentYear = new Date().getFullYear()
    expect(screen.getByText(currentYear.toString())).toBeInTheDocument()
    expect(screen.getByText("Now")).toBeInTheDocument()
  })

  it("groups deaths by year", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    // 2001 has 2 deaths
    expect(screen.getByTestId("timeline-year-2001")).toBeInTheDocument()
    expect(screen.getByText("2 deaths")).toBeInTheDocument()
    // 2010 has 1 death
    expect(screen.getByTestId("timeline-year-2010")).toBeInTheDocument()
    expect(screen.getByText("1 death")).toBeInTheDocument()
  })

  it("shows summary with total deaths and years", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    const currentYear = new Date().getFullYear()
    const yearsSpan = currentYear - 1999
    expect(screen.getByText(`3 deaths over ${yearsSpan} years since release`)).toBeInTheDocument()
  })

  it("displays actor names in collapsed view", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    // Each actor name appears in both collapsed and expanded view
    expect(screen.getAllByText("Actor One").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Actor Two").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Actor Three").length).toBeGreaterThanOrEqual(1)
  })

  it("shows cause of death when available", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)
    // Cause of death appears in both collapsed and expanded views
    expect(screen.getAllByText("Natural Causes").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Cancer").length).toBeGreaterThanOrEqual(1)
  })

  it("expands year section when clicked", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    const yearButton = screen.getByTestId("timeline-year-2001")
    fireEvent.click(yearButton)

    // Should show expanded actor details
    expect(screen.getByTestId("timeline-actor-1")).toBeInTheDocument()
    expect(screen.getByTestId("timeline-actor-2")).toBeInTheDocument()
  })

  it("collapses year section when clicked again", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    const yearButton = screen.getByTestId("timeline-year-2001")

    // Expand
    fireEvent.click(yearButton)
    expect(screen.getByTestId("timeline-actor-1")).toBeInTheDocument()

    // Collapse
    fireEvent.click(yearButton)

    // The expanded section should be hidden (opacity-0, max-h-0)
    const expandedSection = screen.getByTestId("timeline-actor-1").closest(".overflow-hidden")
    expect(expandedSection).toHaveClass("opacity-0")
  })

  it("shows character name in expanded view", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    fireEvent.click(screen.getByTestId("timeline-year-2001"))

    // Character names appear in expanded view
    expect(screen.getAllByText("as Character A").length).toBeGreaterThanOrEqual(1)
    // Actor Two with no cause of death shows character in collapsed view
    expect(screen.getAllByText("as Character B").length).toBeGreaterThanOrEqual(1)
  })

  it("shows age at death in expanded view", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    fireEvent.click(screen.getByTestId("timeline-year-2001"))

    expect(screen.getByText(/Age 65/)).toBeInTheDocument()
    expect(screen.getByText(/Age 72/)).toBeInTheDocument()
  })

  it("shows tooltip on hover when causeOfDeathDetails exists", async () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    // Find the info icon container (it's in the collapsed view for Actor One)
    const infoIconContainers = document.querySelectorAll(
      '[data-testid="mini-timeline"] .cursor-help'
    )
    expect(infoIconContainers.length).toBeGreaterThan(0)

    fireEvent.mouseEnter(infoIconContainers[0])
    // Tooltip appears (could be either collapsed or expanded view tooltip)
    const tooltips = screen.getAllByText("Died peacefully at home")
    expect(tooltips.length).toBeGreaterThan(0)
  })

  it("creates correct actor links", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    // Multiple links exist for each actor (collapsed and expanded views)
    const actorLinks = screen.getAllByRole("link", { name: "Actor One" })
    expect(actorLinks.length).toBeGreaterThan(0)
    expect(actorLinks[0]).toHaveAttribute("href", "/actor/actor-one-1")
  })

  it("shows placeholder icon when actor has no profile photo", () => {
    renderWithRouter(<MiniTimeline releaseYear={1999} deceased={mockDeceased} />)

    // Actor Two has no profile_path - find their card in the grid
    const actorTwoLinks = screen.getAllByText("Actor Two")
    expect(actorTwoLinks.length).toBeGreaterThan(0)
    // Check that there's an SVG (PersonIcon) somewhere in the component for actors without photos
    const timeline = screen.getByTestId("mini-timeline")
    expect(timeline.querySelectorAll("svg").length).toBeGreaterThan(0)
  })
})
