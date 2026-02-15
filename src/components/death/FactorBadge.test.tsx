import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import FactorBadge from "./FactorBadge"

describe("FactorBadge", () => {
  it("renders single-word factor", () => {
    render(<FactorBadge factor="accident" />)
    expect(screen.getByTestId("factor-badge")).toHaveTextContent("Accident")
  })

  it("converts snake_case to Title Case", () => {
    render(<FactorBadge factor="on_set_death" />)
    expect(screen.getByTestId("factor-badge")).toHaveTextContent("On Set Death")
  })

  it("handles already capitalized input", () => {
    render(<FactorBadge factor="Young" />)
    expect(screen.getByTestId("factor-badge")).toHaveTextContent("Young")
  })
})
