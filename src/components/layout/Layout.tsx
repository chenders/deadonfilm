import { ReactNode } from "react"
import Header from "./Header"
import Footer from "./Footer"
import { GlobalSearchProvider } from "@/components/search/GlobalSearchProvider"

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <GlobalSearchProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-4 pb-8">{children}</main>
        <Footer />
      </div>
    </GlobalSearchProvider>
  )
}
