import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import Layout from "./components/layout/Layout"
import HomePage from "./pages/HomePage"
import LoadingSpinner from "./components/common/LoadingSpinner"
import { useGoogleAnalytics } from "./hooks/useGoogleAnalytics"
import { useNewRelicBrowser } from "./hooks/useNewRelicBrowser"

// Lazy load pages that aren't the landing page
const MoviePage = lazy(() => import("./pages/MoviePage"))
const CursedMoviesPage = lazy(() => import("./pages/CursedMoviesPage"))
const CursedActorsPage = lazy(() => import("./pages/CursedActorsPage"))

function App() {
  useGoogleAnalytics()
  useNewRelicBrowser()

  return (
    <Layout>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/movie/:slug" element={<MoviePage />} />
          <Route path="/cursed-movies" element={<CursedMoviesPage />} />
          <Route path="/cursed-actors" element={<CursedActorsPage />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
