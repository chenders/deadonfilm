import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import ErrorMessage from "./ErrorMessage"

// Wrapper component for router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe("ErrorMessage", () => {
  it("displays the error message", () => {
    renderWithRouter(<ErrorMessage message="Failed to load movie" />)

    expect(screen.getByText("Failed to load movie")).toBeInTheDocument()
  })

  it("displays the error title", () => {
    renderWithRouter(<ErrorMessage message="Some error" />)

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
  })

  it("shows home link by default", () => {
    renderWithRouter(<ErrorMessage message="Error" />)

    const link = screen.getByText("Return to search")
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/")
  })

  it("hides home link when showHomeLink is false", () => {
    renderWithRouter(<ErrorMessage message="Error" showHomeLink={false} />)

    expect(screen.queryByText("Return to search")).not.toBeInTheDocument()
  })

  it("displays skull emoji", () => {
    renderWithRouter(<ErrorMessage message="Error" />)

    expect(screen.getByText("💀")).toBeInTheDocument()
  })
})
