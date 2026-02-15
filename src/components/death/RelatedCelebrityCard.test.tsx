import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import RelatedCelebrityCard from "./RelatedCelebrityCard"
import type { RelatedCelebrity } from "@/types"

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

describe("RelatedCelebrityCard", () => {
  it("renders as link when slug is available", () => {
    const celebrity: RelatedCelebrity = {
      name: "Maureen O'Hara",
      tmdbId: 30614,
      relationship: "Frequent co-star",
      slug: "maureen-ohara-30614",
    }
    renderWithRouter(<RelatedCelebrityCard celebrity={celebrity} />)

    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/actor/maureen-ohara-30614")
    expect(screen.getByText("Maureen O'Hara")).toBeInTheDocument()
    expect(screen.getByText("Frequent co-star")).toBeInTheDocument()
  })

  it("renders as div when slug is null", () => {
    const celebrity: RelatedCelebrity = {
      name: "Unknown Person",
      tmdbId: null,
      relationship: "Family member",
      slug: null,
    }
    renderWithRouter(<RelatedCelebrityCard celebrity={celebrity} />)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText("Unknown Person")).toBeInTheDocument()
    expect(screen.getByText("Family member")).toBeInTheDocument()
    expect(screen.getByTestId("related-celebrity")).toBeInTheDocument()
  })
})
