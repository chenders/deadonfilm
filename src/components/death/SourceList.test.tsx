import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import SourceList from "./SourceList"
import type { SourceEntry } from "@/types"

describe("SourceList", () => {
  it("renders nothing for null sources", () => {
    const { container } = render(<SourceList sources={null} title="Test" />)
    expect(container.innerHTML).toBe("")
  })

  it("renders nothing for empty sources", () => {
    const { container } = render(<SourceList sources={[]} title="Test" />)
    expect(container.innerHTML).toBe("")
  })

  it("renders sources with links", () => {
    const sources: SourceEntry[] = [
      { url: "https://example.com/article", archiveUrl: null, description: "Example Article" },
    ]
    render(<SourceList sources={sources} title="Cause of Death" />)

    expect(screen.getByText("Cause of Death:")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: /Example Article/ })
    expect(link).toHaveAttribute("href", "https://example.com/article")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("prefers archive URL over original URL", () => {
    const sources: SourceEntry[] = [
      {
        url: "https://original.com/article",
        archiveUrl: "https://web.archive.org/web/2024/https://original.com/article",
        description: "Archived Article",
      },
    ]
    render(<SourceList sources={sources} title="Sources" />)

    const link = screen.getByRole("link", { name: /Archived Article/ })
    expect(link).toHaveAttribute("href", expect.stringContaining("web.archive.org"))
  })

  it("renders plain text for sources without URLs", () => {
    const sources: SourceEntry[] = [{ url: null, archiveUrl: null, description: "Oral account" }]
    render(<SourceList sources={sources} title="Sources" />)

    expect(screen.getByText("Oral account")).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("renders multiple sources", () => {
    const sources: SourceEntry[] = [
      { url: "https://a.com", archiveUrl: null, description: "Source A" },
      { url: null, archiveUrl: null, description: "Source B" },
    ]
    render(<SourceList sources={sources} title="References" />)

    expect(screen.getByText(/Source A/)).toBeInTheDocument()
    expect(screen.getByText("Source B")).toBeInTheDocument()
  })
})
