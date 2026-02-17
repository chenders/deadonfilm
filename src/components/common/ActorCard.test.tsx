import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import ActorCard from "./ActorCard"

vi.mock("@/services/api", () => ({
  getProfileUrl: vi.fn((path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w185${path}` : null
  ),
}))

function renderCard(props: Partial<React.ComponentProps<typeof ActorCard>> = {}) {
  const defaults = {
    name: "John Wayne",
    slug: "john-wayne-2157",
    profilePath: "/profile.jpg",
    deathday: "1979-06-11",
  }
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ActorCard {...defaults} {...props} />
    </MemoryRouter>
  )
}

describe("ActorCard", () => {
  it("renders with minimal props", () => {
    renderCard()

    expect(screen.getByText("John Wayne")).toBeInTheDocument()
    expect(screen.getByText(/Died Jun 11, 1979/)).toBeInTheDocument()
    expect(screen.getByRole("link")).toHaveAttribute("href", "/actor/john-wayne-2157")
  })

  it("renders profile image from profilePath", () => {
    renderCard({ profilePath: "/profile.jpg" })

    const img = screen.getByRole("img")
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/profile.jpg")
    expect(img).toHaveAttribute("alt", "John Wayne")
  })

  it("renders fallback profile image when profilePath is null", () => {
    renderCard({ profilePath: null, fallbackProfileUrl: "https://example.com/photo.jpg" })

    const img = screen.getByRole("img")
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg")
  })

  it("renders PersonIcon placeholder when no image available", () => {
    renderCard({ profilePath: null, fallbackProfileUrl: null })

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    // PersonIcon renders inside a placeholder div
    const placeholder = document.querySelector(".bg-brown-medium\\/20")
    expect(placeholder).toBeInTheDocument()
  })

  it("shows birth-death date range when showBirthDate is true", () => {
    renderCard({ showBirthDate: true, birthday: "1907-05-26" })

    expect(screen.getByText(/May 26, 1907 – Jun 11, 1979/)).toBeInTheDocument()
  })

  it("shows 'Died' prefix when showBirthDate is false", () => {
    renderCard({ showBirthDate: false })

    expect(screen.getByText(/Died Jun 11, 1979/)).toBeInTheDocument()
  })

  it("shows 'Died' when showBirthDate is true but birthday is null", () => {
    renderCard({ showBirthDate: true, birthday: null })

    expect(screen.getByText(/Died Jun 11, 1979/)).toBeInTheDocument()
  })

  it("renders age at death", () => {
    renderCard({ ageAtDeath: 72 })

    expect(screen.getByText("Age: 72")).toBeInTheDocument()
  })

  it("does not render age when null", () => {
    renderCard({ ageAtDeath: null })

    expect(screen.queryByText(/Age:/)).not.toBeInTheDocument()
  })

  it("renders cause of death as title-cased text by default", () => {
    renderCard({ causeOfDeath: "stomach cancer" })

    expect(screen.getByText("Stomach Cancer")).toBeInTheDocument()
  })

  it("renders CauseOfDeathBadge when useCauseOfDeathBadge is true", () => {
    renderCard({ causeOfDeath: "heart attack", useCauseOfDeathBadge: true })

    // CauseOfDeathBadge renders the raw cause text (no title-casing)
    expect(screen.getByText("heart attack")).toBeInTheDocument()
  })

  it("renders known-for titles with years", () => {
    renderCard({
      knownFor: [
        { name: "True Grit", year: 1969, type: "movie" },
        { name: "The Searchers", year: 1956, type: "movie" },
        { name: "Third Movie", year: 2000, type: "movie" },
      ],
    })

    expect(screen.getByText("True Grit (1969), The Searchers (1956)")).toBeInTheDocument()
    // Only first 2 shown
    expect(screen.queryByText(/Third Movie/)).not.toBeInTheDocument()
  })

  it("renders known-for titles without years when year is null", () => {
    renderCard({
      knownFor: [{ name: "Unknown Film", year: null, type: "movie" }],
    })

    expect(screen.getByText("Unknown Film")).toBeInTheDocument()
  })

  it("does not render known-for when empty", () => {
    renderCard({ knownFor: [] })

    expect(document.querySelector(".italic")).not.toBeInTheDocument()
  })

  it("renders badge next to name", () => {
    renderCard({
      badge: <span data-testid="test-badge">Strange</span>,
    })

    expect(screen.getByTestId("test-badge")).toBeInTheDocument()
    expect(screen.getByText("Strange")).toBeInTheDocument()
  })

  it("renders children slot", () => {
    renderCard({
      children: <div data-testid="custom-content">Extra info</div>,
    })

    expect(screen.getByTestId("custom-content")).toBeInTheDocument()
  })

  it("applies accent name color by default", () => {
    renderCard()

    const name = screen.getByText("John Wayne")
    expect(name.className).toContain("text-accent")
  })

  it("applies brown name color when specified", () => {
    renderCard({ nameColor: "brown" })

    const name = screen.getByText("John Wayne")
    expect(name.className).toContain("text-brown-dark")
  })

  it("sets data-testid when provided", () => {
    renderCard({ testId: "actor-card-1" })

    expect(screen.getByTestId("actor-card-1")).toBeInTheDocument()
  })
})
