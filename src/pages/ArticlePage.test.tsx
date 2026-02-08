import { describe, it, expect } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import { Routes, Route } from "react-router-dom"
import ArticlePage from "./ArticlePage"

function renderPage(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={[`/articles/${slug}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/articles/:slug" element={<ArticlePage />} />
          <Route path="/articles" element={<div data-testid="articles-list">Articles list</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("ArticlePage", () => {
  it("renders article content for valid slug", async () => {
    renderPage("deadliest-horror-franchises")
    await waitFor(() => {
      expect(screen.getByTestId("article-page")).toBeInTheDocument()
    })
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /deadliest horror franchises/i,
      })
    ).toBeInTheDocument()
  })

  it("redirects to /articles for unknown slug", () => {
    renderPage("nonexistent-article")
    expect(screen.getByTestId("articles-list")).toBeInTheDocument()
  })
})
