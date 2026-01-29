import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { LinkedText } from "./LinkedText"
import type { EntityLink } from "@/types"

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

describe("LinkedText", () => {
  describe("without links", () => {
    it("renders plain text", () => {
      renderWithRouter(<LinkedText text="This is plain text." />)

      expect(screen.getByText("This is plain text.")).toBeInTheDocument()
    })

    it("handles empty text", () => {
      const { container } = renderWithRouter(<LinkedText text="" />)

      expect(container.querySelector("p")).toBeInTheDocument()
    })

    it("applies custom className", () => {
      renderWithRouter(<LinkedText text="Some text" className="custom-class" />)

      const paragraph = screen.getByText("Some text")
      expect(paragraph).toHaveClass("custom-class")
    })
  })

  describe("with entity links", () => {
    // "He worked alongside John Wayne in the film."
    //  0         1         2         3         4
    //  0123456789012345678901234567890123456789012
    // "John Wayne" starts at index 20, ends at 30
    const sampleLinks: EntityLink[] = [
      {
        start: 20,
        end: 30,
        text: "John Wayne",
        entityType: "actor",
        entityId: 2157,
        entitySlug: "john-wayne-2157",
        matchMethod: "exact",
        confidence: 1.0,
      },
    ]

    it("renders linked text with actor link", () => {
      const text = "He worked alongside John Wayne in the film."
      renderWithRouter(<LinkedText text={text} links={sampleLinks} />)

      const link = screen.getByTestId("entity-link")
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute("href", "/actor/john-wayne-2157")
      expect(link).toHaveTextContent("John Wayne")
    })

    it("renders movie links correctly", () => {
      const movieLinks: EntityLink[] = [
        {
          start: 16,
          end: 29,
          text: "True Grit",
          entityType: "movie",
          entityId: 256,
          entitySlug: "true-grit-1969-256",
          matchMethod: "exact",
          confidence: 0.95,
        },
      ]
      const text = 'He starred in "True Grit" in 1969.'

      renderWithRouter(<LinkedText text={text} links={movieLinks} />)

      const link = screen.getByTestId("entity-link")
      expect(link).toHaveAttribute("href", "/movie/true-grit-1969-256")
    })

    it("renders show links correctly", () => {
      const showLinks: EntityLink[] = [
        {
          start: 21,
          end: 30,
          text: "Gunsmoke",
          entityType: "show",
          entityId: 1234,
          entitySlug: "gunsmoke-1955-1234",
          matchMethod: "fuzzy",
          confidence: 0.85,
        },
      ]
      const text = 'He guest-starred on "Gunsmoke" multiple times.'

      renderWithRouter(<LinkedText text={text} links={showLinks} />)

      const link = screen.getByTestId("entity-link")
      expect(link).toHaveAttribute("href", "/show/gunsmoke-1955-1234")
    })

    it("shows confidence tooltip on hover", () => {
      const text = "He worked alongside John Wayne in the film."
      renderWithRouter(<LinkedText text={text} links={sampleLinks} />)

      const link = screen.getByTestId("entity-link")
      expect(link).toHaveAttribute("title", "100% confidence")
    })

    it("formats partial confidence correctly", () => {
      const partialConfidenceLinks: EntityLink[] = [
        {
          start: 0,
          end: 10,
          text: "John Wayne",
          entityType: "actor",
          entityId: 2157,
          entitySlug: "john-wayne-2157",
          matchMethod: "fuzzy",
          confidence: 0.87,
        },
      ]
      const text = "John Wayne was a legend."

      renderWithRouter(<LinkedText text={text} links={partialConfidenceLinks} />)

      const link = screen.getByTestId("entity-link")
      expect(link).toHaveAttribute("title", "87% confidence")
    })
  })

  describe("multiple links", () => {
    it("renders multiple links in correct positions", () => {
      const multipleLinks: EntityLink[] = [
        {
          start: 0,
          end: 10,
          text: "John Wayne",
          entityType: "actor",
          entityId: 2157,
          entitySlug: "john-wayne-2157",
          matchMethod: "exact",
          confidence: 1.0,
        },
        {
          start: 24,
          end: 35,
          text: "Dean Martin",
          entityType: "actor",
          entityId: 123,
          entitySlug: "dean-martin-123",
          matchMethod: "exact",
          confidence: 0.95,
        },
      ]
      const text = "John Wayne starred with Dean Martin in the film."

      renderWithRouter(<LinkedText text={text} links={multipleLinks} />)

      const links = screen.getAllByTestId("entity-link")
      expect(links).toHaveLength(2)
      expect(links[0]).toHaveTextContent("John Wayne")
      expect(links[1]).toHaveTextContent("Dean Martin")
    })
  })

  describe("paragraph handling", () => {
    it("renders single paragraph without wrapper div", () => {
      const { container } = renderWithRouter(<LinkedText text="Single paragraph text." />)

      expect(container.querySelector("div[data-testid='linked-text']")).not.toBeInTheDocument()
      expect(container.querySelector("p")).toBeInTheDocument()
    })

    it("renders multiple paragraphs with wrapper div", () => {
      const text = "First paragraph.\n\nSecond paragraph."

      renderWithRouter(<LinkedText text={text} />)

      expect(screen.getByTestId("linked-text")).toBeInTheDocument()
      expect(screen.getByText("First paragraph.")).toBeInTheDocument()
      expect(screen.getByText("Second paragraph.")).toBeInTheDocument()
    })

    it("handles links spanning multiple paragraphs correctly", () => {
      const text = "John Wayne was legendary.\n\nDean Martin was his co-star."
      const links: EntityLink[] = [
        {
          start: 0,
          end: 10,
          text: "John Wayne",
          entityType: "actor",
          entityId: 2157,
          entitySlug: "john-wayne-2157",
          matchMethod: "exact",
          confidence: 1.0,
        },
        {
          start: 27, // Adjusted for the "\n\n" separator
          end: 38,
          text: "Dean Martin",
          entityType: "actor",
          entityId: 123,
          entitySlug: "dean-martin-123",
          matchMethod: "exact",
          confidence: 0.95,
        },
      ]

      renderWithRouter(<LinkedText text={text} links={links} />)

      const allLinks = screen.getAllByTestId("entity-link")
      expect(allLinks).toHaveLength(2)
    })
  })

  describe("edge cases", () => {
    it("handles undefined links array", () => {
      renderWithRouter(<LinkedText text="Some text" links={undefined} />)

      expect(screen.getByText("Some text")).toBeInTheDocument()
    })

    it("handles empty links array", () => {
      renderWithRouter(<LinkedText text="Some text" links={[]} />)

      expect(screen.getByText("Some text")).toBeInTheDocument()
    })

    it("handles links with invalid positions gracefully", () => {
      const badLinks: EntityLink[] = [
        {
          start: 100, // Beyond text length
          end: 110,
          text: "Invalid",
          entityType: "actor",
          entityId: 1,
          entitySlug: "invalid-1",
          matchMethod: "exact",
          confidence: 1.0,
        },
      ]
      const text = "Short text."

      renderWithRouter(<LinkedText text={text} links={badLinks} />)

      expect(screen.getByText("Short text.")).toBeInTheDocument()
      expect(screen.queryByTestId("entity-link")).not.toBeInTheDocument()
    })
  })
})
