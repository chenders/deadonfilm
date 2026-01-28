import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ParagraphText } from "./ParagraphText"

describe("ParagraphText", () => {
  it("renders single paragraph as a p element", () => {
    render(<ParagraphText text="Single paragraph text" />)
    const paragraph = screen.getByText("Single paragraph text")
    expect(paragraph.tagName).toBe("P")
    // Single paragraphs should not have the space-y-4 wrapper
    expect(paragraph.parentElement).not.toHaveClass("space-y-4")
  })

  it("renders multiple paragraphs as separate p elements", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    render(<ParagraphText text={text} />)

    expect(screen.getByText("First paragraph.")).toBeInTheDocument()
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument()
    expect(screen.getByText("Third paragraph.")).toBeInTheDocument()

    // All should be in separate p elements
    const paragraphs = document.querySelectorAll("p")
    expect(paragraphs).toHaveLength(3)
  })

  it("applies className to all paragraphs", () => {
    const text = "First paragraph.\n\nSecond paragraph."
    render(<ParagraphText text={text} className="text-red-500" />)

    const paragraphs = document.querySelectorAll("p")
    paragraphs.forEach((p) => {
      expect(p.className).toBe("text-red-500")
    })
  })

  it("applies className to single paragraph", () => {
    render(<ParagraphText text="Single paragraph" className="text-blue-500" />)
    const paragraph = screen.getByText("Single paragraph")
    expect(paragraph.className).toBe("text-blue-500")
  })

  it("filters out empty paragraphs", () => {
    const text = "First paragraph.\n\n\n\n\n\nSecond paragraph."
    render(<ParagraphText text={text} />)

    const paragraphs = document.querySelectorAll("p")
    expect(paragraphs).toHaveLength(2)
  })

  it("trims whitespace from paragraphs", () => {
    const text = "  First paragraph.  \n\n  Second paragraph.  "
    render(<ParagraphText text={text} />)

    expect(screen.getByText("First paragraph.")).toBeInTheDocument()
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument()
  })

  it("handles newlines with extra whitespace between paragraphs", () => {
    const text = "First paragraph.\n   \n   \nSecond paragraph."
    render(<ParagraphText text={text} />)

    const paragraphs = document.querySelectorAll("p")
    expect(paragraphs).toHaveLength(2)
  })

  it("treats single newlines as part of the same paragraph (split only on double newlines)", () => {
    const text = "Line one\nLine two still same paragraph.\n\nNew paragraph."
    render(<ParagraphText text={text} />)

    // Single newline is treated as part of the same paragraph
    // The paragraph text will contain the newline character
    const firstParagraph = screen.getByText(/Line one/)
    expect(firstParagraph.textContent).toContain("Line two still same paragraph")
    expect(screen.getByText("New paragraph.")).toBeInTheDocument()

    // Should have exactly 2 paragraphs
    const paragraphs = document.querySelectorAll("p")
    expect(paragraphs).toHaveLength(2)
  })

  it("handles leading double newlines", () => {
    const text = "\n\nFirst paragraph.\n\nSecond paragraph."
    render(<ParagraphText text={text} />)

    const paragraphs = document.querySelectorAll("p")
    expect(paragraphs).toHaveLength(2)
  })

  it("handles trailing double newlines", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\n"
    render(<ParagraphText text={text} />)

    const paragraphs = document.querySelectorAll("p")
    expect(paragraphs).toHaveLength(2)
  })

  it("wraps multiple paragraphs in a div with space-y-4", () => {
    const text = "First paragraph.\n\nSecond paragraph."
    const { container } = render(<ParagraphText text={text} />)

    const wrapper = container.firstChild
    expect(wrapper).toHaveClass("space-y-4")
  })

  it("handles empty string", () => {
    const { container } = render(<ParagraphText text="" />)
    // Empty string results in single empty paragraph being filtered
    // The component will render nothing meaningful
    expect(container.textContent).toBe("")
  })
})
