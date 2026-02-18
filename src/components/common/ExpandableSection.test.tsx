import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import ExpandableSection from "./ExpandableSection"

describe("ExpandableSection", () => {
  it("renders title, chevron, and + indicator when collapsed", () => {
    render(
      <ExpandableSection title="Test Section" isExpanded={false} onToggle={() => {}}>
        <p>Content here</p>
      </ExpandableSection>
    )

    expect(screen.getByText("Test Section")).toBeInTheDocument()
    expect(screen.getByText("+")).toBeInTheDocument()
    expect(screen.getByText("Content here")).toBeInTheDocument()
  })

  it("shows minus indicator when expanded", () => {
    render(
      <ExpandableSection title="Test Section" isExpanded={true} onToggle={() => {}}>
        <p>Content here</p>
      </ExpandableSection>
    )

    expect(screen.getByText("\u2212")).toBeInTheDocument()
  })

  it("calls onToggle when header is clicked", () => {
    const onToggle = vi.fn()
    render(
      <ExpandableSection title="Test Section" isExpanded={false} onToggle={onToggle}>
        <p>Content</p>
      </ExpandableSection>
    )

    fireEvent.click(screen.getByTestId("expandable-section-toggle"))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it("sets aria-expanded correctly", () => {
    const { rerender } = render(
      <ExpandableSection title="Test Section" isExpanded={false} onToggle={() => {}}>
        <p>Content</p>
      </ExpandableSection>
    )

    const toggle = screen.getByTestId("expandable-section-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    rerender(
      <ExpandableSection title="Test Section" isExpanded={true} onToggle={() => {}}>
        <p>Content</p>
      </ExpandableSection>
    )
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("gradient is opaque when collapsed", () => {
    render(
      <ExpandableSection title="Test Section" isExpanded={false} onToggle={() => {}}>
        <p>Content</p>
      </ExpandableSection>
    )

    const gradient = screen.getByTestId("expandable-section-gradient")
    expect(gradient).toHaveClass("opacity-100")
  })

  it("gradient is transparent when expanded", () => {
    render(
      <ExpandableSection title="Test Section" isExpanded={true} onToggle={() => {}}>
        <p>Content</p>
      </ExpandableSection>
    )

    const gradient = screen.getByTestId("expandable-section-gradient")
    expect(gradient).toHaveClass("opacity-0")
  })

  it("applies max-height when collapsed", () => {
    render(
      <ExpandableSection
        title="Test Section"
        isExpanded={false}
        onToggle={() => {}}
        collapsedMaxHeight="8rem"
      >
        <p>Content</p>
      </ExpandableSection>
    )

    const content = screen.getByTestId("expandable-section-content")
    expect(content.style.maxHeight).toBe("8rem")
  })

  it("has no max-height constraint when initially expanded", () => {
    render(
      <ExpandableSection
        title="Test Section"
        isExpanded={true}
        onToggle={() => {}}
        collapsedMaxHeight="8rem"
      >
        <p>Content</p>
      </ExpandableSection>
    )

    const content = screen.getByTestId("expandable-section-content")
    expect(content.style.maxHeight).toBe("")
  })

  it("applies custom className", () => {
    render(
      <ExpandableSection title="Test" isExpanded={false} onToggle={() => {}} className="mt-4">
        <p>Content</p>
      </ExpandableSection>
    )

    expect(screen.getByTestId("expandable-section")).toHaveClass("mt-4")
  })
})
