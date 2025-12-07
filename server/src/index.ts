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
import { getRandomMovie } from "./routes/random.js"
import { getDiscoverMovie } from "./routes/discover.js"
import { initDatabase } from "./lib/db.js"

const app = express()
const PORT = process.env.PORT || 8080

// Initialize database
if (process.env.DATABASE_URL) {
  initDatabase().catch((err) => {
    console.error("Failed to initialize database:", err)
  })
} else {
  console.log("DATABASE_URL not set - running without persistent storage")
}

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint for GKE
app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

// API routes
app.get("/api/search", searchMovies)
app.get("/api/movie/:id", getMovie)
app.get("/api/movie/:id/death-info", getDeathInfoRoute)
app.get("/api/on-this-day", getOnThisDay)
app.get("/api/random", getRandomMovie)
app.get("/api/discover", getDiscoverMovie)

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(
    `TMDB token configured: ${process.env.TMDB_API_TOKEN ? "yes" : "NO - check .env file!"}`
  )
  console.log(
    `New Relic APM configured: ${process.env.NEW_RELIC_LICENSE_KEY ? "yes" : "no (optional)"}`
  )
})
