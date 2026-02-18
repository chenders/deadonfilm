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

  it("applies death variant styling by default", () => {
    render(<FactorBadge factor="cancer" />)
    const badge = screen.getByTestId("factor-badge")
    expect(badge.className).toContain("bg-deceased-bg")
    expect(badge.className).toContain("text-deceased-badge-text")
  })

  it("applies life variant styling when specified", () => {
    render(<FactorBadge factor="military_service" variant="life" />)
    const badge = screen.getByTestId("factor-badge")
    expect(badge.className).toContain("bg-life-factor-bg")
    expect(badge.className).toContain("text-life-factor-text")
  })
})
