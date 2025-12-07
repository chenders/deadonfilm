import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import LoadingSpinner from "./LoadingSpinner"

describe("LoadingSpinner", () => {
  it("displays default loading message", () => {
    render(<LoadingSpinner />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("displays custom loading message", () => {
    render(<LoadingSpinner message="Fetching movie data..." />)

    expect(screen.getByText("Fetching movie data...")).toBeInTheDocument()
  })

  it("renders the spinner element", () => {
    render(<LoadingSpinner />)

    // Find the spinner by testid
    const spinner = screen.getByTestId("spinner")
    expect(spinner).toBeInTheDocument()
  })
})
