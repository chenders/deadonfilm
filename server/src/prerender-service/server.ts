/**
 * Standalone prerender HTTP service.
 *
 * Accepts render requests from the Express prerender middleware and returns
 * fully-rendered HTML captured via headless Chromium.
 *
 * GET /render?url=<path>  — render a page
 * GET /health             — service health check
 */

import "dotenv/config"
import express from "express"
import { renderPage, closeBrowser, isBrowserHealthy } from "./renderer.js"
import pino from "pino"

const app = express()
const PORT = process.env.PRERENDER_PORT || 3001
const TARGET_HOST = process.env.PRERENDER_TARGET_HOST || "http://nginx:3000"

const log = pino({ name: "prerender-service" })

app.get("/render", async (req, res) => {
  const urlPath = req.query.url as string | undefined

  if (!urlPath || typeof urlPath !== "string") {
    res.status(400).json({ error: "Missing url parameter" })
    return
  }

  // Validate the path looks reasonable (starts with /)
  if (!urlPath.startsWith("/")) {
    res.status(400).json({ error: "URL must be an absolute path" })
    return
  }

  // Block API/admin paths from being rendered
  if (urlPath.startsWith("/api/") || urlPath.startsWith("/admin/")) {
    res.status(400).json({ error: "Cannot render API or admin paths" })
    return
  }

  const fullUrl = `${TARGET_HOST}${urlPath}`
  log.info({ urlPath, fullUrl }, "Rendering page")

  try {
    const html = await renderPage(fullUrl)
    res.set("Content-Type", "text/html")
    res.set("X-Prerender", "true")
    res.send(html)
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message, urlPath }, "Render failed")

    if (message.includes("timeout") || message.includes("Timeout")) {
      res.status(504).json({ error: "Render timeout" })
      return
    }

    res.status(500).json({ error: "Render failed" })
  }
})

app.get("/health", (_req, res) => {
  const browserOk = isBrowserHealthy()
  res.status(browserOk ? 200 : 503).json({
    status: browserOk ? "ok" : "degraded",
    browser: browserOk ? "connected" : "disconnected",
  })
})

const server = app.listen(PORT, () => {
  log.info({ port: PORT, targetHost: TARGET_HOST }, "Prerender service started")
})

// Graceful shutdown
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    log.info({ signal }, "Shutting down prerender service")
    server.close()
    await closeBrowser()
    process.exit(0)
  })
}
