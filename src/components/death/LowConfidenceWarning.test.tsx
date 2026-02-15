import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import LowConfidenceWarning from "./LowConfidenceWarning"

describe("LowConfidenceWarning", () => {
  it("renders nothing for null level", () => {
    const { container } = render(<LowConfidenceWarning level={null} />)
    expect(container.innerHTML).toBe("")
  })

  it("renders nothing for high confidence", () => {
    const { container } = render(<LowConfidenceWarning level="high" />)
    expect(container.innerHTML).toBe("")
  })

  it("renders nothing for medium confidence", () => {
    const { container } = render(<LowConfidenceWarning level="medium" />)
    expect(container.innerHTML).toBe("")
  })

  it("renders unverified warning for low confidence", () => {
    render(<LowConfidenceWarning level="low" />)
    expect(screen.getByText("Unverified Information")).toBeInTheDocument()
    expect(screen.getByText(/could not be fully verified/)).toBeInTheDocument()
    expect(screen.getByTestId("low-confidence-warning")).toBeInTheDocument()
  })

  it("renders disputed warning for disputed confidence", () => {
    render(<LowConfidenceWarning level="disputed" />)
    expect(screen.getByText("Information Disputed")).toBeInTheDocument()
    expect(screen.getByText(/Multiple conflicting accounts/)).toBeInTheDocument()
  })
})
