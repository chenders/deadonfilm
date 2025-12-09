import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import DeceasedCard from "./DeceasedCard"
import type { DeceasedActor } from "@/types"

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
    render(<DeceasedCard actor={mockActor} />)

    expect(screen.getByTestId("actor-name")).toHaveTextContent("John Doe")
  })

  it("renders actor character", () => {
    render(<DeceasedCard actor={mockActor} />)

    expect(screen.getByTestId("actor-character")).toHaveTextContent("as Hero")
  })

  it("renders actor photo when profile_path exists", () => {
    render(<DeceasedCard actor={mockActor} />)

    expect(screen.getByTestId("actor-photo")).toBeInTheDocument()
  })

  it("renders placeholder when no profile_path", () => {
    const actorNoPhoto = { ...mockActor, profile_path: null }
    render(<DeceasedCard actor={actorNoPhoto} />)

    expect(screen.getByTestId("actor-photo-placeholder")).toBeInTheDocument()
  })

  it("has an expand/collapse button", () => {
    render(<DeceasedCard actor={mockActor} />)

    const button = screen.getByRole("button", { name: /show links for john doe/i })
    expect(button).toBeInTheDocument()
  })

  describe("expansion", () => {
    it("does not show expanded section by default", () => {
      render(<DeceasedCard actor={mockActor} />)

      expect(screen.queryByTestId("actor-expanded")).not.toBeInTheDocument()
    })

    it("shows expanded section when button is clicked", () => {
      render(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      expect(screen.getByTestId("actor-expanded")).toBeInTheDocument()
    })

    it("hides expanded section when button is clicked again", () => {
      render(<DeceasedCard actor={mockActor} />)

      // Click to expand
      fireEvent.click(screen.getByRole("button", { name: /show links/i }))
      expect(screen.getByTestId("actor-expanded")).toBeInTheDocument()

      // Click to collapse (button aria-label changes to "Collapse links for...")
      fireEvent.click(screen.getByRole("button", { name: /collapse links/i }))
      expect(screen.queryByTestId("actor-expanded")).not.toBeInTheDocument()
    })

    it("shows TMDB link in expanded section", () => {
      render(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      const tmdbLink = screen.getByText("View on TMDB →")
      expect(tmdbLink).toHaveAttribute("href", mockActor.tmdbUrl)
      expect(tmdbLink).toHaveAttribute("target", "_blank")
    })

    it("shows Wikipedia link when available", () => {
      render(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      const wikiLink = screen.getByText("Wikipedia →")
      expect(wikiLink).toHaveAttribute("href", mockActor.wikipediaUrl)
    })

    it("does not show Wikipedia link when not available", () => {
      const actorNoWiki = { ...mockActor, wikipediaUrl: null }
      render(<DeceasedCard actor={actorNoWiki} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      expect(screen.queryByText("Wikipedia →")).not.toBeInTheDocument()
    })

    it("shows Search Filmography link", () => {
      render(<DeceasedCard actor={mockActor} />)

      fireEvent.click(screen.getByRole("button", { name: /show links/i }))

      const searchLink = screen.getByText("Search Filmography →")
      expect(searchLink).toHaveAttribute("href")
      expect(searchLink.getAttribute("href")).toContain("google.com/search")
      expect(searchLink.getAttribute("href")).toContain("John%20Doe")
    })
  })

  describe("styling", () => {
    it("has base card styling", () => {
      render(<DeceasedCard actor={mockActor} />)

      const card = screen.getByTestId("deceased-card")
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("rounded-lg")
    })
  })
})
