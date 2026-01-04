import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import CauseActorRow from "./CauseActorRow"
import type { CauseActor } from "@/types"

// Mock the API
vi.mock("@/services/api", () => ({
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockActor: CauseActor = {
  rank: 1,
  id: 123,
  tmdbId: 456,
  name: "Jane Doe",
  profilePath: "/path/to/image.jpg",
  deathday: "2024-03-20",
  causeOfDeath: "Cancer",
  causeOfDeathDetails: "Lung cancer",
  ageAtDeath: 72,
  yearsLost: 8.5,
}

function renderWithRouter(actor: CauseActor, props?: { rank?: number; showCauseBadge?: boolean }) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CauseActorRow actor={actor} rank={props?.rank ?? 1} showCauseBadge={props?.showCauseBadge} />
    </MemoryRouter>
  )
}

describe("CauseActorRow", () => {
  it("renders actor name", () => {
    renderWithRouter(mockActor)
    // Use getAllByText since responsive layout renders both desktop and mobile
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThanOrEqual(1)
  })

  it("renders death date", () => {
    renderWithRouter(mockActor)
    expect(screen.getAllByText(/Died Mar 20, 2024/).length).toBeGreaterThanOrEqual(1)
  })

  it("renders age at death", () => {
    renderWithRouter(mockActor)
    expect(screen.getAllByText(/Age 72/).length).toBeGreaterThanOrEqual(1)
  })

  it("renders rank", () => {
    renderWithRouter(mockActor, { rank: 5 })
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1)
  })

  it("renders years lost", () => {
    renderWithRouter(mockActor)
    // Years lost is rounded to whole number
    expect(screen.getAllByText(/9 years lost/).length).toBeGreaterThanOrEqual(1)
  })

  it("does not render years lost when zero or negative", () => {
    const actorNoYearsLost = { ...mockActor, yearsLost: 0 }
    renderWithRouter(actorNoYearsLost)
    expect(screen.queryByText(/years lost/)).not.toBeInTheDocument()
  })

  it("does not render years lost when null", () => {
    const actorNullYearsLost = { ...mockActor, yearsLost: null }
    renderWithRouter(actorNullYearsLost)
    expect(screen.queryByText(/years lost/)).not.toBeInTheDocument()
  })

  it("renders profile image when available", () => {
    renderWithRouter(mockActor)
    const imgs = screen.getAllByAltText("Jane Doe")
    expect(imgs.length).toBeGreaterThanOrEqual(1)
    expect(imgs[0]).toHaveAttribute("src", "https://image.tmdb.org/path/to/image.jpg")
  })

  it("renders placeholder icon when no profile image", () => {
    const actorNoPhoto = { ...mockActor, profilePath: null }
    renderWithRouter(actorNoPhoto)

    // Should not have an img element with this alt text
    expect(screen.queryByAltText("Jane Doe")).not.toBeInTheDocument()
    // Should have SVG icons for placeholder (both desktop and mobile)
    expect(document.querySelectorAll("svg").length).toBeGreaterThanOrEqual(1)
  })

  it("links to actor profile page using tmdbId", () => {
    renderWithRouter(mockActor)
    const link = screen.getByTestId("actor-row-456")
    expect(link).toHaveAttribute("href", "/actor/jane-doe-456")
  })

  it("shows cause badge when showCauseBadge is true (default)", () => {
    renderWithRouter(mockActor, { showCauseBadge: true })
    expect(screen.getByTestId("actor-cause-456")).toBeInTheDocument()
  })

  it("shows cause details when showCauseBadge is false", () => {
    renderWithRouter(mockActor, { showCauseBadge: false })
    // When showCauseBadge is false, it should use causeOfDeathDetails instead
    // The badge shows the details when showCauseBadge is false and details exist
    expect(screen.getByTestId("actor-cause-456")).toBeInTheDocument()
  })

  it("does not show badge when no cause and showCauseBadge is true", () => {
    const actorNoCause = { ...mockActor, causeOfDeath: undefined, causeOfDeathDetails: null }
    renderWithRouter(actorNoCause, { showCauseBadge: true })
    expect(screen.queryByTestId("actor-cause-456")).not.toBeInTheDocument()
  })

  it("has correct test ID using tmdbId", () => {
    renderWithRouter(mockActor)
    expect(screen.getByTestId("actor-row-456")).toBeInTheDocument()
  })

  it("falls back to id when tmdbId is null", () => {
    const actorWithoutTmdbId = { ...mockActor, tmdbId: null }
    renderWithRouter(actorWithoutTmdbId)
    const link = screen.getByTestId("actor-row-123")
    expect(link).toHaveAttribute("href", "/actor/jane-doe-123")
  })

  it("omits age when ageAtDeath is null", () => {
    const actorNoAge = { ...mockActor, ageAtDeath: null }
    renderWithRouter(actorNoAge)

    // Should show death date but not age
    expect(screen.getAllByText(/Died Mar 20, 2024/).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Age/)).not.toBeInTheDocument()
  })
})
