// New Relic must be initialized FIRST, before any other imports
import { initNewRelic } from "./lib/newrelic.js"
initNewRelic()

import "dotenv/config"
import express from "express"
import cors from "cors"
import { searchMovies } from "./routes/search.js"
import { getMovie } from "./routes/movie.js"
import { getOnThisDay } from "./routes/on-this-day.js"
import { getDeathInfoRoute } from "./routes/death-info.js"
import { getDiscoverMovie, getCursedMovies, getCursedMoviesFilters } from "./routes/discover.js"
import {
  getStats,
  getRecentDeathsHandler,
  getCovidDeathsHandler,
  getViolentDeathsHandler,
} from "./routes/stats.js"
import { getCursedActorsRoute } from "./routes/actors.js"
import { getActor } from "./routes/actor.js"
import { getDeathWatchHandler } from "./routes/death-watch.js"
import { getSitemap } from "./routes/sitemap.js"
import { initializeDatabase } from "./lib/startup.js"

const app = express()
const PORT = process.env.PORT || 8080

// Middleware
app.use(cors())
app.use(express.json())

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

// Health check endpoint for GKE
app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

// SEO endpoints (not under /api since they're for crawlers)
app.get("/sitemap.xml", getSitemap)

// API routes
app.get("/api/search", searchMovies)
app.get("/api/movie/:id", getMovie)
app.get("/api/movie/:id/death-info", getDeathInfoRoute)
app.get("/api/on-this-day", getOnThisDay)
app.get("/api/discover/:type", getDiscoverMovie)
app.get("/api/cursed-movies", getCursedMovies)
app.get("/api/cursed-movies/filters", getCursedMoviesFilters)
app.get("/api/stats", getStats)
app.get("/api/recent-deaths", getRecentDeathsHandler)
app.get("/api/covid-deaths", getCovidDeathsHandler)
app.get("/api/violent-deaths", getViolentDeathsHandler)
app.get("/api/cursed-actors", getCursedActorsRoute)
app.get("/api/actor/:id", getActor)
app.get("/api/death-watch", getDeathWatchHandler)

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database (runs migrations and seeds required data)
    await initializeDatabase()

    // Start accepting requests
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(
        `TMDB token configured: ${process.env.TMDB_API_TOKEN ? "yes" : "NO - check .env file!"}`
      )
      console.log(
        `New Relic APM configured: ${process.env.NEW_RELIC_LICENSE_KEY ? "yes" : "no (optional)"}`
      )
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

startServer()
