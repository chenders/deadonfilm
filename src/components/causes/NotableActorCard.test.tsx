import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import NotableActorCard from "./NotableActorCard"
import type { NotableActor } from "@/types"

// Mock the API
vi.mock("@/services/api", () => ({
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockActor: NotableActor = {
  id: 123,
  tmdbId: 456,
  name: "John Smith",
  profilePath: "/path/to/image.jpg",
  deathday: "2024-01-15",
  causeOfDeath: "Natural causes",
  causeOfDeathDetails: "Died peacefully",
  ageAtDeath: 85,
}

function renderWithRouter(actor: NotableActor) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NotableActorCard actor={actor} />
    </MemoryRouter>
  )
}

describe("NotableActorCard", () => {
  it("renders actor name", () => {
    renderWithRouter(mockActor)
    expect(screen.getByText("John Smith")).toBeInTheDocument()
  })

  it("renders actor age and death date", () => {
    renderWithRouter(mockActor)
    expect(screen.getByText(/Age 85/)).toBeInTheDocument()
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
  })

  it("renders profile image when available", () => {
    renderWithRouter(mockActor)
    const img = screen.getByAltText("John Smith")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/path/to/image.jpg")
  })

  it("renders placeholder icon when no profile image", () => {
    const actorWithoutPhoto = { ...mockActor, profilePath: null }
    renderWithRouter(actorWithoutPhoto)

    // Should not have an img element
    expect(screen.queryByAltText("John Smith")).not.toBeInTheDocument()
    // Should have an SVG icon
    expect(document.querySelector("svg")).toBeInTheDocument()
  })

  it("links to actor profile page using tmdbId", () => {
    renderWithRouter(mockActor)
    const link = screen.getByTestId("notable-actor-456")
    expect(link).toHaveAttribute("href", "/actor/john-smith-456")
  })

  it("shows question mark when age is null", () => {
    const actorNoAge = { ...mockActor, ageAtDeath: null }
    renderWithRouter(actorNoAge)
    expect(screen.getByText(/Age \?/)).toBeInTheDocument()
  })

  it("has correct test ID using tmdbId", () => {
    renderWithRouter(mockActor)
    expect(screen.getByTestId("notable-actor-456")).toBeInTheDocument()
  })

  it("falls back to id when tmdbId is null", () => {
    const actorWithoutTmdbId = { ...mockActor, tmdbId: null }
    renderWithRouter(actorWithoutTmdbId)
    const link = screen.getByTestId("notable-actor-123")
    expect(link).toHaveAttribute("href", "/actor/john-smith-123")
  })
})
