import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

  it("shows all sources when 3 or fewer", () => {
    const sources: SourceEntry[] = [
      { url: "https://a.com", archiveUrl: null, description: "Source A" },
      { url: null, archiveUrl: null, description: "Source B" },
      { url: "https://c.com", archiveUrl: null, description: "Source C" },
    ]
    render(<SourceList sources={sources} title="References" />)

    expect(screen.getByText(/Source A/)).toBeInTheDocument()
    expect(screen.getByText("Source B")).toBeInTheDocument()
    expect(screen.getByText(/Source C/)).toBeInTheDocument()
    expect(screen.queryByTestId("sources-toggle")).not.toBeInTheDocument()
  })

  it("truncates to 3 sources with toggle when more than 3", () => {
    const sources: SourceEntry[] = [
      { url: "https://a.com", archiveUrl: null, description: "Source A" },
      { url: "https://b.com", archiveUrl: null, description: "Source B" },
      { url: "https://c.com", archiveUrl: null, description: "Source C" },
      { url: "https://d.com", archiveUrl: null, description: "Source D" },
      { url: "https://e.com", archiveUrl: null, description: "Source E" },
    ]
    render(<SourceList sources={sources} title="Sources" />)

    expect(screen.getByText(/Source A/)).toBeInTheDocument()
    expect(screen.getByText(/Source B/)).toBeInTheDocument()
    expect(screen.getByText(/Source C/)).toBeInTheDocument()
    expect(screen.queryByText(/Source D/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Source E/)).not.toBeInTheDocument()
    expect(screen.getByTestId("sources-toggle")).toHaveTextContent("+ 2 more")
  })

  it("renders sources as a vertical list", () => {
    const sources: SourceEntry[] = [
      { url: "https://a.com", archiveUrl: null, description: "Source A" },
      { url: "https://b.com", archiveUrl: null, description: "Source B" },
      { url: "https://c.com", archiveUrl: null, description: "Source C" },
    ]
    render(<SourceList sources={sources} title="Sources" />)

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(3)
  })

  it("uses semantic list markup", () => {
    const sources: SourceEntry[] = [
      { url: "https://a.com", archiveUrl: null, description: "Source A" },
    ]
    render(<SourceList sources={sources} title="Sources" />)

    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("expands and collapses sources on toggle click", async () => {
    const user = userEvent.setup()
    const sources: SourceEntry[] = [
      { url: "https://a.com", archiveUrl: null, description: "Source A" },
      { url: "https://b.com", archiveUrl: null, description: "Source B" },
      { url: "https://c.com", archiveUrl: null, description: "Source C" },
      { url: "https://d.com", archiveUrl: null, description: "Source D" },
    ]
    render(<SourceList sources={sources} title="Sources" />)

    // Initially hidden
    expect(screen.queryByText(/Source D/)).not.toBeInTheDocument()

    // Expand
    await user.click(screen.getByTestId("sources-toggle"))
    expect(screen.getByText(/Source D/)).toBeInTheDocument()
    expect(screen.getByTestId("sources-toggle")).toHaveTextContent("show less")

    // Collapse
    await user.click(screen.getByTestId("sources-toggle"))
    expect(screen.queryByText(/Source D/)).not.toBeInTheDocument()
    expect(screen.getByTestId("sources-toggle")).toHaveTextContent("+ 1 more")
  })
})
