import { Routes, Route } from "react-router-dom"
import Layout from "./components/layout/Layout"
import HomePage from "./pages/HomePage"
import MoviePage from "./pages/MoviePage"
import RandomPage from "./pages/RandomPage"
import CursedMoviesPage from "./pages/CursedMoviesPage"
import { useGoogleAnalytics } from "./hooks/useGoogleAnalytics"
import { useNewRelicBrowser } from "./hooks/useNewRelicBrowser"

function App() {
  useGoogleAnalytics()
  useNewRelicBrowser()

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/movie/:slug" element={<MoviePage />} />
        <Route path="/random" element={<RandomPage />} />
        <Route path="/cursed-movies" element={<CursedMoviesPage />} />
      </Routes>
    </Layout>
  )
}

export default App
