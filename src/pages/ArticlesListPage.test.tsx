import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import ArticlesListPage from "./ArticlesListPage"

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={["/articles"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ArticlesListPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("ArticlesListPage", () => {
  it("renders with correct data-testid", () => {
    renderPage()
    expect(screen.getByTestId("articles-list-page")).toBeInTheDocument()
  })

  it("renders h1 heading", () => {
    renderPage()
    expect(screen.getByRole("heading", { level: 1, name: "Articles" })).toBeInTheDocument()
  })

  it("renders article cards", () => {
    renderPage()
    expect(screen.getByTestId("article-card-deadliest-horror-franchises")).toBeInTheDocument()
  })

  it("renders article title in card", () => {
    renderPage()
    expect(
      screen.getByRole("heading", {
        name: /deadliest horror franchises/i,
      })
    ).toBeInTheDocument()
  })
})
