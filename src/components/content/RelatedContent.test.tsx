import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import RelatedContent from "./RelatedContent"

const sampleItems = [
  {
    href: "/movie/the-shining-1980-694",
    title: "The Shining",
    subtitle: "1980",
    imageUrl: "https://image.tmdb.org/t/p/w92/poster.jpg",
  },
  {
    href: "/movie/alien-1979-348",
    title: "Alien",
    imageUrl: null,
  },
]

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe("RelatedContent", () => {
  it("returns null when items array is empty", () => {
    const { container } = renderWithRouter(<RelatedContent title="Related Movies" items={[]} />)
    expect(container.innerHTML).toBe("")
  })

  it("renders title and items", () => {
    renderWithRouter(<RelatedContent title="Related Movies" items={sampleItems} />)

    expect(screen.getByText("Related Movies")).toBeInTheDocument()
    expect(screen.getByText("The Shining")).toBeInTheDocument()
    expect(screen.getByText("Alien")).toBeInTheDocument()
  })

  it("renders items with thumbnails", () => {
    renderWithRouter(<RelatedContent title="Related Movies" items={sampleItems} />)

    const img = screen.getByRole("img", { name: "The Shining" })
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/t/p/w92/poster.jpg")
    expect(img).toHaveAttribute("loading", "lazy")
  })

  it("renders placeholder when no image", () => {
    renderWithRouter(
      <RelatedContent
        title="Related Movies"
        items={[{ href: "/movie/alien-1979-348", title: "Alien", imageUrl: null }]}
      />
    )

    // No img element should be rendered for the null-imageUrl item
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    // The item itself should still render
    expect(screen.getByText("Alien")).toBeInTheDocument()
  })

  it("renders subtitle when provided", () => {
    renderWithRouter(<RelatedContent title="Related Movies" items={sampleItems} />)

    expect(screen.getByText("1980")).toBeInTheDocument()
    // Alien has no subtitle, so only one subtitle paragraph should exist
    const subtitles = screen.getAllByText(/^\d{4}$/)
    expect(subtitles).toHaveLength(1)
  })

  it("links to correct href", () => {
    renderWithRouter(<RelatedContent title="Related Movies" items={sampleItems} />)

    const shiningLink = screen.getByRole("link", { name: /The Shining/ })
    expect(shiningLink).toHaveAttribute("href", "/movie/the-shining-1980-694")

    const alienLink = screen.getByRole("link", { name: /Alien/ })
    expect(alienLink).toHaveAttribute("href", "/movie/alien-1979-348")
  })
})
