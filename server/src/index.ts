// New Relic must be initialized FIRST, before any other imports
import { initNewRelic } from "./lib/newrelic.js"
initNewRelic()

import "dotenv/config"
import express from "express"
import cors from "cors"
import compression from "compression"
import rateLimit from "express-rate-limit"
import { logger } from "./lib/logger.js"
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
} from "./routes/sitemap.js"
import {
  getCauseCategoriesHandler,
  getDeathsByCauseHandler,
  getDecadeCategoriesHandler,
  getDeathsByDecadeHandler,
  getAllDeathsHandler,
} from "./routes/deaths.js"
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

const app = express()
const PORT = process.env.PORT || 8080

// Trust first proxy (for running behind Docker/nginx reverse proxy)
// Required for express-rate-limit to correctly identify client IPs
app.set("trust proxy", 1)

// Middleware
app.use(compression()) // Gzip responses (~70% size reduction)
app.use(cors())
app.use(express.json())

// Rate limiting to protect against abuse
// General API rate limit: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later" } },
})

// Stricter rate limit for heavy endpoints (sitemap, etc): 10 requests per minute
const heavyEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10,
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
  res.json({ status: "ok" })
})

// External health check endpoint (routed via /api/* ingress rule)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" })
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
app.get("/api/death-watch", getDeathWatchHandler)
app.get("/api/deaths/causes", getCauseCategoriesHandler)
app.get("/api/deaths/cause/:cause", getDeathsByCauseHandler)
app.get("/api/deaths/decades", getDecadeCategoriesHandler)
app.get("/api/deaths/decade/:decade", getDeathsByDecadeHandler)
app.get("/api/deaths/all", getAllDeathsHandler)
app.get("/api/movies/genres", getGenreCategoriesHandler)
app.get("/api/movies/genre/:genre", getMoviesByGenreHandler)

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

    // Start accepting requests
    app.listen(PORT, () => {
      logger.info(
        {
          port: PORT,
          tmdbConfigured: !!process.env.TMDB_API_TOKEN,
          newRelicConfigured: !!process.env.NEW_RELIC_LICENSE_KEY,
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
