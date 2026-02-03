import { Suspense } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/layout/Layout"
import HomePage from "./pages/HomePage"
import LoadingSpinner from "./components/common/LoadingSpinner"
import { useGoogleAnalytics } from "./hooks/useGoogleAnalytics"
import { useNewRelicBrowser } from "./hooks/useNewRelicBrowser"
import { lazyWithRetry } from "./utils/lazyWithRetry"
import { AdminAuthProvider } from "./hooks/useAdminAuth"
import { AdminThemeProvider } from "./contexts/AdminThemeContext"
import { ToastProvider } from "./contexts/ToastContext"
import ToastContainer from "./components/common/ToastContainer"

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
const AdminActorEditorPage = lazyWithRetry(() => import("./pages/admin/ActorEditorPage"))
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
const AdminABTestsIndexPage = lazyWithRetry(() => import("./pages/admin/ABTestsIndexPage"))
const AdminABTestSourceRequirementPage = lazyWithRetry(
  () => import("./pages/admin/ABTestSourceRequirementPage")
)
const AdminABTestProviderComparisonPage = lazyWithRetry(
  () => import("./pages/admin/ABTestProviderComparisonPage")
)
const AdminABTestComprehensiveIndexPage = lazyWithRetry(
  () => import("./pages/admin/ABTestComprehensiveIndexPage")
)
const AdminABTestComprehensiveDetailPage = lazyWithRetry(
  () => import("./pages/admin/ABTestComprehensiveDetailPage")
)
const AdminDataQualityPage = lazyWithRetry(() => import("./pages/admin/DataQualityPage"))
const AdminPopularityPage = lazyWithRetry(() => import("./pages/admin/PopularityPage"))
const AdminSyncPage = lazyWithRetry(() => import("./pages/admin/SyncPage"))
const AdminJobQueuesPage = lazyWithRetry(() => import("./pages/admin/JobQueuesPage"))
const AdminJobRunsPage = lazyWithRetry(() => import("./pages/admin/JobRunsPage"))
const AdminJobDetailsPage = lazyWithRetry(() => import("./pages/admin/JobDetailsPage"))
const AdminDeadLetterQueuePage = lazyWithRetry(() => import("./pages/admin/DeadLetterQueuePage"))
const AdminLogsPage = lazyWithRetry(() => import("./pages/admin/LogsPage"))
const AdminBiographyManagementPage = lazyWithRetry(
  () => import("./pages/admin/BiographyManagementPage")
)

function App() {
  useGoogleAnalytics()
  useNewRelicBrowser()

  return (
    <ToastProvider>
      <ToastContainer />
      <AdminAuthProvider>
        <Routes>
          {/* Admin routes (no Layout wrapper, wrapped with AdminThemeProvider) */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/admin/login"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminLoginPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminDashboardPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminAnalyticsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/enrichment/runs"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminEnrichmentRunsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/enrichment/runs/:id"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminEnrichmentRunDetailsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/enrichment/start"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminStartEnrichmentPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/enrichment/review"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminEnrichmentReviewPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/enrichment/high-priority"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminHighPriorityActorsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/coverage"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminCoverageDashboardPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/actors"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminActorManagementPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/actors/:id"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminActorEditorPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/page-views"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminPageViewsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/tools"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminExternalToolsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/actor-diagnostic"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminActorDiagnosticPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/cache"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminCacheManagementPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/sitemap"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminSitemapManagementPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/data-quality"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminDataQualityPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/popularity"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminPopularityPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/sync"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminSyncPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/ab-tests"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminABTestsIndexPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/ab-tests/source-requirement"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminABTestSourceRequirementPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/ab-tests/provider-comparison"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminABTestProviderComparisonPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/ab-tests/comprehensive"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminABTestComprehensiveIndexPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/ab-tests/comprehensive/:runId"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminABTestComprehensiveDetailPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/jobs"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminJobQueuesPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/jobs/runs"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminJobRunsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/jobs/runs/:id"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminJobDetailsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/jobs/dead-letter"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminDeadLetterQueuePage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminLogsPage />
                </Suspense>
              </AdminThemeProvider>
            }
          />
          <Route
            path="/admin/biographies"
            element={
              <AdminThemeProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminBiographyManagementPage />
                </Suspense>
              </AdminThemeProvider>
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
    </ToastProvider>
  )
}

export default App
