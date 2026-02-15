import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import ProjectLink from "./ProjectLink"
import type { ProjectInfo } from "@/types"

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

describe("ProjectLink", () => {
  it("renders internal link for movie with tmdb_id", () => {
    const project: ProjectInfo = {
      title: "The Shootist",
      year: 1976,
      tmdb_id: 11575,
      imdb_id: "tt0075213",
      type: "movie",
    }
    renderWithRouter(<ProjectLink project={project} />)

    const link = screen.getByRole("link", { name: "The Shootist (1976)" })
    expect(link).toHaveAttribute("href", expect.stringContaining("/movie/"))
  })

  it("renders internal link for show with tmdb_id", () => {
    const project: ProjectInfo = {
      title: "Gunsmoke",
      year: 1955,
      tmdb_id: 1234,
      imdb_id: null,
      type: "show",
    }
    renderWithRouter(<ProjectLink project={project} />)

    const link = screen.getByRole("link", { name: "Gunsmoke (1955)" })
    expect(link).toHaveAttribute("href", expect.stringContaining("/show/"))
  })

  it("renders external IMDb link when no tmdb_id", () => {
    const project: ProjectInfo = {
      title: "Old Movie",
      year: 1940,
      tmdb_id: null,
      imdb_id: "tt0099999",
      type: "movie",
    }
    renderWithRouter(<ProjectLink project={project} />)

    const link = screen.getByRole("link", { name: /Old Movie \(1940\)/ })
    expect(link).toHaveAttribute("href", "https://www.imdb.com/title/tt0099999")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("renders plain text when no links available", () => {
    const project: ProjectInfo = {
      title: "Unknown Film",
      year: null,
      tmdb_id: null,
      imdb_id: null,
      type: "unknown",
    }
    renderWithRouter(<ProjectLink project={project} />)

    expect(screen.getByText("Unknown Film")).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("omits year when null", () => {
    const project: ProjectInfo = {
      title: "Mystery Project",
      year: null,
      tmdb_id: null,
      imdb_id: null,
      type: "movie",
    }
    renderWithRouter(<ProjectLink project={project} />)

    expect(screen.getByText("Mystery Project")).toBeInTheDocument()
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument()
  })
})
