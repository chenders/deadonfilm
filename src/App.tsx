import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import Layout from "./components/layout/Layout"
import HomePage from "./pages/HomePage"
import LoadingSpinner from "./components/common/LoadingSpinner"
import { useGoogleAnalytics } from "./hooks/useGoogleAnalytics"
import { useNewRelicBrowser } from "./hooks/useNewRelicBrowser"

// Lazy load pages that aren't the landing page
const MoviePage = lazy(() => import("./pages/MoviePage"))
const ActorPage = lazy(() => import("./pages/ActorPage"))
const CursedMoviesPage = lazy(() => import("./pages/CursedMoviesPage"))
const CursedActorsPage = lazy(() => import("./pages/CursedActorsPage"))
const ForeverYoungPage = lazy(() => import("./pages/ForeverYoungPage"))
const CovidDeathsPage = lazy(() => import("./pages/CovidDeathsPage"))
const ViolentDeathsPage = lazy(() => import("./pages/ViolentDeathsPage"))
const DeathWatchPage = lazy(() => import("./pages/DeathWatchPage"))
const CausesIndexPage = lazy(() => import("./pages/CausesIndexPage"))
const DeathsByCausePage = lazy(() => import("./pages/DeathsByCausePage"))
const DecadesIndexPage = lazy(() => import("./pages/DecadesIndexPage"))
const AllDeathsPage = lazy(() => import("./pages/AllDeathsPage"))
const DeathsByDecadePage = lazy(() => import("./pages/DeathsByDecadePage"))
const GenresIndexPage = lazy(() => import("./pages/GenresIndexPage"))
const GenreMoviesPage = lazy(() => import("./pages/GenreMoviesPage"))

function App() {
  useGoogleAnalytics()
  useNewRelicBrowser()

  return (
    <Layout>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/movie/:slug" element={<MoviePage />} />
          <Route path="/actor/:slug" element={<ActorPage />} />
          <Route path="/cursed-movies" element={<CursedMoviesPage />} />
          <Route path="/cursed-actors" element={<CursedActorsPage />} />
          <Route path="/forever-young" element={<ForeverYoungPage />} />
          <Route path="/covid-deaths" element={<CovidDeathsPage />} />
          <Route path="/violent-deaths" element={<ViolentDeathsPage />} />
          <Route path="/death-watch" element={<DeathWatchPage />} />
          <Route path="/deaths" element={<CausesIndexPage />} />
          <Route path="/deaths/all" element={<AllDeathsPage />} />
          <Route path="/deaths/decades" element={<DecadesIndexPage />} />
          <Route path="/deaths/decade/:decade" element={<DeathsByDecadePage />} />
          <Route path="/deaths/:cause" element={<DeathsByCausePage />} />
          <Route path="/movies/genres" element={<GenresIndexPage />} />
          <Route path="/movies/genre/:genre" element={<GenreMoviesPage />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
