import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import ArticleLayout from "./ArticleLayout"
import type { ArticleMeta } from "@/data/articles"
import { lazy } from "react"

const stubComponent = lazy(() => Promise.resolve({ default: () => <div>Stub</div> }))

const baseArticle: ArticleMeta = {
  slug: "test-article",
  title: "Test Article Title",
  description: "A test article description",
  category: "analysis",
  publishedDate: "2026-01-15",
  author: "Dead on Film",
  tags: ["test"],
  relatedSlugs: [],
  component: stubComponent,
  wordCount: 1200,
}

function renderLayout(article: ArticleMeta = baseArticle, children = <p>Body content</p>) {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={[`/articles/${article.slug}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ArticleLayout article={article}>{children}</ArticleLayout>
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("ArticleLayout", () => {
  it("renders h1 title", () => {
    renderLayout()
    expect(
      screen.getByRole("heading", { level: 1, name: "Test Article Title" })
    ).toBeInTheDocument()
  })

  it("renders category badge", () => {
    renderLayout()
    expect(screen.getByText("Analysis")).toBeInTheDocument()
  })

  it("renders reading time", () => {
    renderLayout()
    expect(screen.getByLabelText("reading time")).toHaveTextContent("6 min read")
  })

  it("renders published date", () => {
    renderLayout()
    expect(screen.getByText("January 15, 2026")).toBeInTheDocument()
  })

  it("renders updated date when provided", () => {
    renderLayout({ ...baseArticle, updatedDate: "2026-02-01" })
    expect(screen.getByTestId("updated-date")).toHaveTextContent("Updated February 1, 2026")
  })

  it("does not render updated date when not provided", () => {
    renderLayout()
    expect(screen.queryByTestId("updated-date")).not.toBeInTheDocument()
  })

  it("renders All Articles back link", () => {
    renderLayout()
    const link = screen.getByRole("link", { name: /← all articles/i })
    expect(link).toHaveAttribute("href", "/articles")
  })

  it("renders children content", () => {
    renderLayout(baseArticle, <p>Custom body content</p>)
    expect(screen.getByText("Custom body content")).toBeInTheDocument()
  })

  it("renders BlogPosting JSON-LD", () => {
    const { container } = renderLayout()
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    const jsonLdTexts = Array.from(scripts).map((s) => s.innerHTML)
    const blogPosting = jsonLdTexts.find((t) => t.includes("BlogPosting"))
    expect(blogPosting).toBeDefined()
    expect(blogPosting).toContain("Test Article Title")
  })

  it("renders breadcrumb JSON-LD", () => {
    const { container } = renderLayout()
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    const jsonLdTexts = Array.from(scripts).map((s) => s.innerHTML)
    const breadcrumb = jsonLdTexts.find((t) => t.includes("BreadcrumbList"))
    expect(breadcrumb).toBeDefined()
    expect(breadcrumb).toContain("Articles")
  })

  it("renders Browse all articles link at the bottom", () => {
    renderLayout()
    const links = screen.getAllByRole("link", { name: /articles/i })
    const browseLink = links.find((l) => l.textContent === "Browse all articles")
    expect(browseLink).toHaveAttribute("href", "/articles")
  })

  it("does not render related articles section when none exist", () => {
    renderLayout()
    expect(screen.queryByTestId("related-articles")).not.toBeInTheDocument()
  })
})
