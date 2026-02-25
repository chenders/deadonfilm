import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, act } from "@testing-library/react"
import { MemoryRouter, Routes, Route, Link } from "react-router-dom"
import Layout from "./Layout"

const futureFlags = { v7_startTransition: true, v7_relativeSplatPath: true }

// Mock heavy children to avoid needing QueryClientProvider etc.
vi.mock("./Header", () => ({ default: () => <header data-testid="header">Header</header> }))
vi.mock("./Footer", () => ({ default: () => <footer data-testid="footer">Footer</footer> }))
vi.mock("@/components/search/GlobalSearchProvider", () => ({
  GlobalSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function PageA() {
  return (
    <div>
      <p>Page A</p>
      <Link to="/b">Go to B</Link>
    </div>
  )
}
function PageB() {
  return <p>Page B</p>
}

function renderWithRoutes(initialPath = "/a") {
  return render(
    <MemoryRouter future={futureFlags} initialEntries={[initialPath]}>
      <Layout>
        <Routes>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB />} />
        </Routes>
      </Layout>
    </MemoryRouter>
  )
}

describe("Layout ScrollToTop", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  })

  it("scrolls to top on initial render", () => {
    renderWithRoutes("/a")
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it("scrolls to top when pathname changes", async () => {
    const { getByText } = renderWithRoutes("/a")

    vi.mocked(window.scrollTo).mockClear()

    await act(async () => {
      getByText("Go to B").click()
    })

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })
})
