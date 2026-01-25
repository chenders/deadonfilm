import { Suspense } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/layout/Layout"
import HomePage from "./pages/HomePage"
import LoadingSpinner from "./components/common/LoadingSpinner"
import { useGoogleAnalytics } from "./hooks/useGoogleAnalytics"
import { useNewRelicBrowser } from "./hooks/useNewRelicBrowser"
import { lazyWithRetry } from "./utils/lazyWithRetry"
import { AdminAuthProvider } from "./hooks/useAdminAuth"

// Lazy load pages that aren't the landing page
// Using lazyWithRetry to handle chunk loading failures after deployments
const MoviePage = lazyWithRetry(() => import("./pages/MoviePage"))
const ShowPage = lazyWithRetry(() => import("./pages/ShowPage"))
const SeasonPage = lazyWithRetry(() => import("./pages/SeasonPage"))
const EpisodePage = lazyWithRetry(() => import("./pages/EpisodePage"))
const ActorPage = lazyWithRetry(() => import("./pages/ActorPage"))
// Temporarily hidden - see plan in kind-brewing-moore.md
// const CursedMoviesPage = lazyWithRetry(() => import("./pages/CursedMoviesPage"))
// const CursedActorsPage = lazyWithRetry(() => import("./pages/CursedActorsPage"))
const ForeverYoungPage = lazyWithRetry(() => import("./pages/ForeverYoungPage"))
const CovidDeathsPage = lazyWithRetry(() => import("./pages/CovidDeathsPage"))
const UnnaturalDeathsPage = lazyWithRetry(() => import("./pages/UnnaturalDeathsPage"))
const DeathWatchPage = lazyWithRetry(() => import("./pages/DeathWatchPage"))
const CausesIndexPage = lazyWithRetry(() => import("./pages/CausesIndexPage"))
const DeathsByCausePage = lazyWithRetry(() => import("./pages/DeathsByCausePage"))
const DecadesIndexPage = lazyWithRetry(() => import("./pages/DecadesIndexPage"))
const AllDeathsPage = lazyWithRetry(() => import("./pages/AllDeathsPage"))
const DeathsByDecadePage = lazyWithRetry(() => import("./pages/DeathsByDecadePage"))
const GenresIndexPage = lazyWithRetry(() => import("./pages/GenresIndexPage"))
const GenreMoviesPage = lazyWithRetry(() => import("./pages/GenreMoviesPage"))
const CausesOfDeathPage = lazyWithRetry(() => import("./pages/CausesOfDeathPage"))
const CauseCategoryPage = lazyWithRetry(() => import("./pages/CauseCategoryPage"))
const SpecificCausePage = lazyWithRetry(() => import("./pages/SpecificCausePage"))
const ActorDeathPage = lazyWithRetry(() => import("./pages/ActorDeathPage"))
const NotableDeathsPage = lazyWithRetry(() => import("./pages/NotableDeathsPage"))

// Admin pages
const AdminLoginPage = lazyWithRetry(() => import("./pages/admin/LoginPage"))
const AdminDashboardPage = lazyWithRetry(() => import("./pages/admin/DashboardPage"))
const AdminAnalyticsPage = lazyWithRetry(() => import("./pages/admin/AnalyticsPage"))
const AdminCoverageDashboardPage = lazyWithRetry(
  () => import("./pages/admin/CoverageDashboardPage")
)
const AdminActorManagementPage = lazyWithRetry(() => import("./pages/admin/ActorManagementPage"))
const AdminPageViewsPage = lazyWithRetry(() => import("./pages/admin/PageViewsPage"))
const AdminExternalToolsPage = lazyWithRetry(() => import("./pages/admin/ExternalToolsPage"))
const AdminEnrichmentRunsPage = lazyWithRetry(() => import("./pages/admin/EnrichmentRunsPage"))
const AdminEnrichmentRunDetailsPage = lazyWithRetry(
  () => import("./pages/admin/EnrichmentRunDetailsPage")
)
const AdminStartEnrichmentPage = lazyWithRetry(() => import("./pages/admin/StartEnrichmentPage"))
const AdminEnrichmentReviewPage = lazyWithRetry(() => import("./pages/admin/EnrichmentReviewPage"))
const AdminHighPriorityActorsPage = lazyWithRetry(
  () => import("./pages/admin/HighPriorityActorsPage")
)
const AdminActorDiagnosticPage = lazyWithRetry(() => import("./pages/admin/ActorDiagnosticPage"))
const AdminCacheManagementPage = lazyWithRetry(() => import("./pages/admin/CacheManagementPage"))
const AdminSitemapManagementPage = lazyWithRetry(
  () => import("./pages/admin/SitemapManagementPage")
)

function App() {
  useGoogleAnalytics()
  useNewRelicBrowser()

  return (
    <AdminAuthProvider>
      <Routes>
        {/* Admin routes (no Layout wrapper) */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="/admin/login"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminLoginPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminDashboardPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminAnalyticsPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/enrichment/runs"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminEnrichmentRunsPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/enrichment/runs/:id"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminEnrichmentRunDetailsPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/enrichment/start"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminStartEnrichmentPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/enrichment/review"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminEnrichmentReviewPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/enrichment/high-priority"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminHighPriorityActorsPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/coverage"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminCoverageDashboardPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/actors"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminActorManagementPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/page-views"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminPageViewsPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/tools"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminExternalToolsPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/actor-diagnostic"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminActorDiagnosticPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/cache"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminCacheManagementPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/sitemap"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <AdminSitemapManagementPage />
            </Suspense>
          }
        />

        {/* Public routes (with Layout) */}
        <Route
          path="*"
          element={
            <Layout>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/movie/:slug" element={<MoviePage />} />
                  <Route path="/show/:slug" element={<ShowPage />} />
                  <Route path="/show/:slug/season/:seasonNumber" element={<SeasonPage />} />
                  <Route path="/episode/:slug" element={<EpisodePage />} />
                  <Route path="/actor/:slug" element={<ActorPage />} />
                  <Route path="/actor/:slug/death" element={<ActorDeathPage />} />
                  {/* Temporarily hidden - see plan in kind-brewing-moore.md */}
                  {/* <Route path="/cursed-movies" element={<CursedMoviesPage />} /> */}
                  {/* <Route path="/cursed-actors" element={<CursedActorsPage />} /> */}
                  <Route path="/forever-young" element={<ForeverYoungPage />} />
                  <Route path="/covid-deaths" element={<CovidDeathsPage />} />
                  <Route path="/unnatural-deaths" element={<UnnaturalDeathsPage />} />
                  <Route path="/death-watch" element={<DeathWatchPage />} />
                  <Route path="/deaths" element={<CausesIndexPage />} />
                  <Route path="/deaths/all" element={<AllDeathsPage />} />
                  <Route path="/deaths/notable" element={<NotableDeathsPage />} />
                  <Route path="/deaths/decades" element={<DecadesIndexPage />} />
                  <Route path="/deaths/decade/:decade" element={<DeathsByDecadePage />} />
                  <Route path="/deaths/:cause" element={<DeathsByCausePage />} />
                  <Route path="/movies/genres" element={<GenresIndexPage />} />
                  <Route path="/movies/genre/:genre" element={<GenreMoviesPage />} />
                  {/* New 3-level causes of death hierarchy */}
                  <Route path="/causes-of-death" element={<CausesOfDeathPage />} />
                  <Route path="/causes-of-death/:categorySlug" element={<CauseCategoryPage />} />
                  <Route
                    path="/causes-of-death/:categorySlug/:causeSlug"
                    element={<SpecificCausePage />}
                  />
                </Routes>
              </Suspense>
            </Layout>
          }
        />
      </Routes>
    </AdminAuthProvider>
  )
}

export default App
