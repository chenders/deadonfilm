import { ReactNode } from "react"
import Header from "./Header"
import Footer from "./Footer"
import { GlobalSearchProvider } from "@/components/search/GlobalSearchProvider"
import { ThemeProvider } from "@/contexts/ThemeContext"

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <ThemeProvider>
      <GlobalSearchProvider>
        <div className="flex min-h-screen flex-col">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brown-dark focus:px-4 focus:py-2 focus:text-cream focus:shadow-lg"
          >
            Skip to main content
          </a>
          <Header />
          <main id="main-content" className="flex-1 px-4 pb-8">
            {children}
          </main>
          <Footer />
        </div>
      </GlobalSearchProvider>
    </ThemeProvider>
  )
}
