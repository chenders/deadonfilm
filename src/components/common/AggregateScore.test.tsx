import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import AggregateScore from "./AggregateScore"

describe("AggregateScore", () => {
  it("renders nothing when score is null", () => {
    const { container } = render(<AggregateScore score={null} confidence={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when score is undefined", () => {
    const { container } = render(<AggregateScore score={undefined} confidence={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders score with correct formatting", () => {
    render(<AggregateScore score={8.45} confidence={0.75} />)

    expect(screen.getByTestId("aggregate-score")).toBeInTheDocument()
    // 8.45 rounds to 8.4 due to floating-point representation (8.45 is stored as 8.4499999...)
    expect(screen.getByTestId("aggregate-score-value")).toHaveTextContent("8.4")
  })

  it("renders DOF Score label", () => {
    render(<AggregateScore score={7.0} confidence={0.5} />)

    expect(screen.getByText("DOF Score")).toBeInTheDocument()
  })

  it("applies size variant classes", () => {
    const { rerender } = render(<AggregateScore score={8.0} confidence={0.8} size="sm" />)
    expect(screen.getByTestId("aggregate-score-value")).toHaveClass("text-lg")

    rerender(<AggregateScore score={8.0} confidence={0.8} size="md" />)
    expect(screen.getByTestId("aggregate-score-value")).toHaveClass("text-2xl")

    rerender(<AggregateScore score={8.0} confidence={0.8} size="lg" />)
    expect(screen.getByTestId("aggregate-score-value")).toHaveClass("text-3xl")
  })

  it("applies custom className", () => {
    render(<AggregateScore score={8.0} confidence={0.5} className="custom-class" />)

    expect(screen.getByTestId("aggregate-score")).toHaveClass("custom-class")
  })

  it("formats score to one decimal place", () => {
    render(<AggregateScore score={7.123} confidence={0.5} />)
    expect(screen.getByTestId("aggregate-score-value")).toHaveTextContent("7.1")
  })

  it("handles integer scores correctly", () => {
    render(<AggregateScore score={9} confidence={0.9} />)
    expect(screen.getByTestId("aggregate-score-value")).toHaveTextContent("9.0")
  })

  it("handles string scores from PostgreSQL NUMERIC type", () => {
    // PostgreSQL NUMERIC type may return as string
    render(<AggregateScore score={"8.45" as unknown as number} confidence={0.75} />)

    expect(screen.getByTestId("aggregate-score")).toBeInTheDocument()
    expect(screen.getByTestId("aggregate-score-value")).toHaveTextContent("8.4")
  })

  it("renders nothing when score is unparseable string (NaN)", () => {
    const { container } = render(
      <AggregateScore score={"not-a-number" as unknown as number} confidence={0.5} />
    )
    expect(container.firstChild).toBeNull()
  })
})
