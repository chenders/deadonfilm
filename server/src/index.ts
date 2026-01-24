// New Relic is loaded via --import newrelic/esm-loader.mjs (see package.json start script)
import newrelic from "newrelic"
import "dotenv/config"
import express from "express"
import cors from "cors"
import compression from "compression"
import rateLimit from "express-rate-limit"
import cookieParser from "cookie-parser"
import { logger } from "./lib/logger.js"
import { initRedis, isRedisAvailable } from "./lib/redis.js"
import { searchMovies } from "./routes/search.js"
import { getMovie } from "./routes/movie.js"
import { getOnThisDay } from "./routes/on-this-day.js"
import { getDeathInfoRoute } from "./routes/death-info.js"
import {
  getDiscoverMovie,
  getCursedMovies,
  getCursedMoviesFilters,
  getForeverYoungMoviesHandler,
} from "./routes/discover.js"
import {
  getStats,
  getRecentDeathsHandler,
  getCovidDeathsHandler,
  getUnnaturalDeathsHandler,
  getFeaturedMovieHandler,
  getTriviaHandler,
  getThisWeekDeathsHandler,
  getPopularMoviesHandler,
} from "./routes/stats.js"
import { getCursedActorsRoute } from "./routes/actors.js"
import { getActor } from "./routes/actor.js"
import { getDeathWatchHandler } from "./routes/death-watch.js"
import {
  getSitemapIndex,
  getStaticSitemap,
  getMoviesSitemap,
  getActorsSitemap,
  getShowsSitemap,
  getDeathDetailsSitemap,
} from "./routes/sitemap.js"
import {
  getCauseCategoriesHandler,
  getDeathsByCauseHandler,
  getDecadeCategoriesHandler,
  getDeathsByDecadeHandler,
  getAllDeathsHandler,
} from "./routes/deaths.js"
import { getActorDeathDetails, getNotableDeaths } from "./routes/death-details.js"
import {
  getCauseCategoryIndexHandler,
  getCauseCategoryHandler,
  getSpecificCauseHandler,
} from "./routes/causes.js"
import { getGenreCategoriesHandler, getMoviesByGenreHandler } from "./routes/movies.js"
import {
  getShow,
  searchShows,
  getShowSeasons,
  getEpisode,
  getSeasonEpisodes,
  getSeason,
} from "./routes/shows.js"
import { initializeDatabase } from "./lib/startup.js"
import { adminAuthMiddleware, optionalAdminAuth } from "./middleware/admin-auth.js"
import { pageVisitTracker } from "./middleware/page-visit-tracker.js"
import { loginHandler, logoutHandler, statusHandler } from "./routes/admin/auth.js"
import { getDashboardStats } from "./routes/admin/dashboard.js"
import enrichmentRoutes from "./routes/admin/enrichment.js"
import analyticsRoutes from "./routes/admin/analytics.js"
import coverageRoutes from "./routes/admin/coverage.js"
import pageViewsRoutes, { trackPageViewHandler } from "./routes/admin/page-views.js"
import cronjobsRoutes from "./routes/admin/cronjobs.js"

const app = express()
const PORT = process.env.PORT || 8080

// Trust first proxy (for running behind Docker/nginx reverse proxy)
// Required for express-rate-limit to correctly identify client IPs
app.set("trust proxy", 1)

// Middleware
app.use(compression()) // Gzip responses (~70% size reduction)
app.use(cors())
app.use(express.json())
app.use(cookieParser()) // Parse cookies for admin authentication

// Check for admin authentication (optional - doesn't block requests)
// This sets req.isAdmin flag for rate limit bypass
// codeql[js/missing-rate-limiting] - This middleware only sets a flag; actual rate limiting applied per-route
app.use(optionalAdminAuth)

// Page visit tracking for analytics (async, non-blocking)
// codeql[js/missing-rate-limiting] - Analytics tracking with async DB writes; non-blocking, path-filtered, not security-critical
app.use(pageVisitTracker)

// Rate limiting configuration constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const API_RATE_LIMIT = 100 // General API requests per minute
const HEAVY_ENDPOINT_LIMIT = 10 // Heavy endpoints (sitemap, etc) per minute
const ADMIN_LOGIN_LIMIT = 5 // Login attempts per minute
const ADMIN_ROUTES_LIMIT = 200 // Admin routes requests per minute
const PAGE_VIEW_TRACKING_LIMIT = 20 // Page view tracking per minute per IP

// Rate limiting to protect against abuse
// General API rate limit: 100 requests per minute per IP (skips authenticated admins)
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: API_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
  skip: (req) => req.isAdmin === true,
})

// Stricter rate limit for heavy endpoints (sitemap, etc): 10 requests per minute (skips admins)
const heavyEndpointLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: HEAVY_ENDPOINT_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
  skip: (req) => req.isAdmin === true,
})

// Admin login rate limit: 5 attempts per minute to prevent brute force
const adminLoginLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: ADMIN_LOGIN_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many login attempts, please try again later" } },
})

// General admin routes rate limit: 200 requests per minute for unauthenticated, bypass for authenticated admins
const adminRoutesLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: ADMIN_ROUTES_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
  skip: (req) => req.isAdmin === true,
})

// Page view tracking rate limit: 20 requests per minute per IP (public endpoint)
const pageViewTrackingLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: PAGE_VIEW_TRACKING_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
})

// Redirect www to apex domain for SEO
app.use((req, res, next) => {
  const host = req.get("host") || ""
  if (host.startsWith("www.")) {
    const apexHost = host.replace(/^www\./, "")
    const protocol = req.get("x-forwarded-proto") || "https"
    return res.redirect(301, `${protocol}://${apexHost}${req.originalUrl}`)
  }
  next()
})

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on("finish", () => {
    const duration = Date.now() - start
    // Skip health checks to reduce log noise
    if (req.path !== "/health") {
      logger.info(
        {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get("user-agent"),
        },
        `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
      )
    }
  })
  next()
})

// Health check endpoint (internal container health checks)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    redis: isRedisAvailable() ? "connected" : "unavailable",
  })
})

// External health check endpoint (routed via /api/* ingress rule)
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    redis: isRedisAvailable() ? "connected" : "unavailable",
  })
})

// New Relic browser agent script (served by Express for server-side injection)
// This enables distributed tracing between browser and server
app.get("/nr-browser.js", (_req, res) => {
  const header = newrelic.getBrowserTimingHeader()
  if (!header) {
    // No New Relic configured - return empty script
    res.type("application/javascript").send("// New Relic not configured")
    return
  }
  // Extract the JavaScript from the script tag
  // getBrowserTimingHeader returns: <script type="text/javascript">...code...</script>
  // Using indexOf/slice instead of regex to avoid CodeQL false positive (this is trusted API output)
  const scriptStart = header.indexOf(">") + 1
  const scriptEnd = header.lastIndexOf("</script")
  const scriptContent =
    scriptStart > 0 && scriptEnd > scriptStart ? header.slice(scriptStart, scriptEnd) : ""
  // Cache for 1 hour - script content is stable but may update with SDK changes
  res
    .type("application/javascript")
    .set("Cache-Control", "public, max-age=3600")
    .send(scriptContent)
})

// SEO endpoints (not under /api since they're for crawlers)
// Sitemap index and individual sitemaps (split by content type for Google's 50k URL limit)
app.get("/sitemap.xml", heavyEndpointLimiter, getSitemapIndex)
app.get("/sitemap-static.xml", heavyEndpointLimiter, getStaticSitemap)
app.get("/sitemap-movies.xml", heavyEndpointLimiter, getMoviesSitemap)
app.get("/sitemap-movies-:page.xml", heavyEndpointLimiter, getMoviesSitemap)
app.get("/sitemap-actors.xml", heavyEndpointLimiter, getActorsSitemap)
app.get("/sitemap-actors-:page.xml", heavyEndpointLimiter, getActorsSitemap)
app.get("/sitemap-shows.xml", heavyEndpointLimiter, getShowsSitemap)
app.get("/sitemap-shows-:page.xml", heavyEndpointLimiter, getShowsSitemap)
app.get("/sitemap-death-details.xml", heavyEndpointLimiter, getDeathDetailsSitemap)
app.get("/sitemap-death-details-:page.xml", heavyEndpointLimiter, getDeathDetailsSitemap)

// API routes - apply rate limiting to all API endpoints
app.use("/api", apiLimiter)
app.get("/api/search", searchMovies)
app.get("/api/movie/:id", getMovie)
app.get("/api/movie/:id/death-info", getDeathInfoRoute)
app.get("/api/on-this-day", getOnThisDay)
app.get("/api/discover/:type", getDiscoverMovie)
app.get("/api/cursed-movies", getCursedMovies)
app.get("/api/cursed-movies/filters", getCursedMoviesFilters)
app.get("/api/forever-young", getForeverYoungMoviesHandler)
app.get("/api/stats", getStats)
app.get("/api/recent-deaths", getRecentDeathsHandler)
app.get("/api/covid-deaths", getCovidDeathsHandler)
app.get("/api/unnatural-deaths", getUnnaturalDeathsHandler)
app.get("/api/featured-movie", getFeaturedMovieHandler)
app.get("/api/trivia", getTriviaHandler)
app.get("/api/this-week", getThisWeekDeathsHandler)
app.get("/api/popular-movies", getPopularMoviesHandler)
app.get("/api/cursed-actors", getCursedActorsRoute)
app.get("/api/actor/:id", getActor)
app.get("/api/actor/:id/death", getActorDeathDetails)
app.get("/api/death-watch", getDeathWatchHandler)
app.get("/api/deaths/notable", getNotableDeaths)
app.get("/api/deaths/causes", getCauseCategoriesHandler)
app.get("/api/deaths/cause/:cause", getDeathsByCauseHandler)
app.get("/api/deaths/decades", getDecadeCategoriesHandler)
app.get("/api/deaths/decade/:decade", getDeathsByDecadeHandler)
app.get("/api/deaths/all", getAllDeathsHandler)

// Cause of death category routes (new 3-level hierarchy)
app.get("/api/causes-of-death", getCauseCategoryIndexHandler)
app.get("/api/causes-of-death/:categorySlug", getCauseCategoryHandler)
app.get("/api/causes-of-death/:categorySlug/:causeSlug", getSpecificCauseHandler)

app.get("/api/movies/genres", getGenreCategoriesHandler)
app.get("/api/movies/genre/:genre", getMoviesByGenreHandler)

// Admin routes (authentication not required for login, but required for other endpoints)
// codeql[js/missing-rate-limiting] - All admin routes have appropriate rate limiting
app.post("/admin/api/auth/login", adminLoginLimiter, loginHandler)
app.post("/admin/api/auth/logout", adminRoutesLimiter, logoutHandler)
app.get("/admin/api/auth/status", adminRoutesLimiter, optionalAdminAuth, statusHandler)
app.get("/admin/api/dashboard/stats", adminRoutesLimiter, adminAuthMiddleware, getDashboardStats)
app.use("/admin/api/enrichment", adminRoutesLimiter, adminAuthMiddleware, enrichmentRoutes)
app.use("/admin/api/analytics", adminRoutesLimiter, adminAuthMiddleware, analyticsRoutes)
app.use("/admin/api/coverage", adminRoutesLimiter, adminAuthMiddleware, coverageRoutes)
app.use("/admin/api/page-views", adminRoutesLimiter, adminAuthMiddleware, pageViewsRoutes)
app.use("/admin/api/cronjobs", adminRoutesLimiter, adminAuthMiddleware, cronjobsRoutes)

// Public page view tracking endpoint (rate limited, bot-filtered)
app.post("/api/page-views/track", pageViewTrackingLimiter, trackPageViewHandler)

// TV Show routes
app.get("/api/search/tv", searchShows)
app.get("/api/show/:id", getShow)
app.get("/api/show/:id/seasons", getShowSeasons)
app.get("/api/show/:id/season/:seasonNumber", getSeason)
app.get("/api/show/:id/season/:seasonNumber/episodes", getSeasonEpisodes)
app.get("/api/show/:showId/season/:season/episode/:episode", getEpisode)

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database (runs migrations and seeds required data)
    await initializeDatabase()

    // Initialize Redis (optional - caching disabled if not available)
    const redisAvailable = await initRedis()

    // Start accepting requests
    app.listen(PORT, () => {
      logger.info(
        {
          port: PORT,
          tmdbConfigured: !!process.env.TMDB_API_TOKEN,
          newRelicConfigured: !!process.env.NEW_RELIC_LICENSE_KEY,
          redisConfigured: redisAvailable,
        },
        `Server running on port ${PORT}`
      )
    })
  } catch (error) {
    logger.fatal({ error }, "Failed to start server")
    process.exit(1)
  }
}

startServer()
