import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import DeceasedCard from "./DeceasedCard"
import type { DeceasedActor } from "@/types"

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  )
}

describe("DeceasedCard", () => {
  const mockActor: DeceasedActor = {
    id: 123,
    name: "John Doe",
    character: "Hero",
    profile_path: "/path/to/photo.jpg",
    birthday: "1950-01-15",
    deathday: "2020-06-20",
    causeOfDeath: "Natural causes",
    causeOfDeathDetails: "Died peacefully at home",
    wikipediaUrl: "https://en.wikipedia.org/wiki/John_Doe",
    tmdbUrl: "https://www.themoviedb.org/person/123",
    ageAtDeath: 70,
    yearsLost: 7.5,
  }

  it("renders actor name", () => {
    renderWithRouter(<DeceasedCard actor={mockActor} />)

    expect(screen.getByTestId("actor-name")).toHaveTextContent("John Doe")
  })

  it("renders actor character", () => {
    renderWithRouter(<DeceasedCard actor={mockActor} />)

    expect(screen.getByTestId("actor-character")).toHaveTextContent("as Hero")
  })

  it("renders actor photo when profile_path exists", () => {
    renderWithRouter(<DeceasedCard actor={mockActor} />)

    expect(screen.getByTestId("actor-photo")).toBeInTheDocument()
  })

  it("renders placeholder when no profile_path", () => {
    const actorNoPhoto = { ...mockActor, profile_path: null }
    renderWithRouter(<DeceasedCard actor={actorNoPhoto} />)

    expect(screen.getByTestId("actor-photo-placeholder")).toBeInTheDocument()
  })

  it("has an expand/collapse button", () => {
    renderWithRouter(<DeceasedCard actor={mockActor} />)

    const button = screen.getByRole("button", { name: /show links for john doe/i })
    expect(button).toBeInTheDocument()
  })

  describe("expansion", () => {
    it("does not show expanded section by default", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      expect(screen.queryByTestId("actor-expanded")).not.toBeInTheDocument()
    })

    it("shows expanded section when button is clicked", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      expect(screen.getByTestId("actor-expanded")).toBeInTheDocument()
    })

    it("hides expanded section when button is clicked again", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      // Click to expand
      fireEvent.click(screen.getByRole("button", { name: /show links/i }))
      expect(screen.getByTestId("actor-expanded")).toBeInTheDocument()

      // Click to collapse (button aria-label changes to "Collapse links for...")
      fireEvent.click(screen.getByRole("button", { name: /collapse links/i }))
      expect(screen.queryByTestId("actor-expanded")).not.toBeInTheDocument()
    })

    it("shows TMDB link in expanded section", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      const tmdbLink = screen.getByText("View on TMDB →")
      expect(tmdbLink).toHaveAttribute("href", mockActor.tmdbUrl)
      expect(tmdbLink).toHaveAttribute("target", "_blank")
    })

    it("shows Wikipedia link when available", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      const wikiLink = screen.getByText("Wikipedia →")
      expect(wikiLink).toHaveAttribute("href", mockActor.wikipediaUrl)
    })

    it("does not show Wikipedia link when not available", () => {
      const actorNoWiki = { ...mockActor, wikipediaUrl: null }
      renderWithRouter(<DeceasedCard actor={actorNoWiki} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      expect(screen.queryByText("Wikipedia →")).not.toBeInTheDocument()
    })

    it("shows Search Filmography link", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      const searchLink = screen.getByText("Search Filmography →")
      expect(searchLink).toHaveAttribute("href")
      expect(searchLink.getAttribute("href")).toContain("google.com/search")
      expect(searchLink.getAttribute("href")).toContain("John%20Doe")
    })
  })

  describe("styling", () => {
    it("has base card styling", () => {
      renderWithRouter(<DeceasedCard actor={mockActor} />)

      const card = screen.getByTestId("deceased-card")
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("rounded-lg")
    })
  })
})
