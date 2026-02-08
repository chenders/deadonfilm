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
import { logger } from "../lib/logger.js"

const app = express()
const envPort = process.env.PRERENDER_PORT
const PORT = envPort !== undefined ? Number.parseInt(envPort, 10) : 3001

if (Number.isNaN(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PRERENDER_PORT: ${envPort}`)
}

const TARGET_HOST = process.env.PRERENDER_TARGET_HOST || "http://nginx:3000"

const log = logger.child({ name: "prerender-service" })

app.get("/render", async (req, res) => {
  const rawUrl = req.query.url

  // Handle missing, array (?url=a&url=b), or non-string values
  if (!rawUrl || typeof rawUrl !== "string") {
    res.status(400).json({ error: "Missing or invalid url parameter" })
    return
  }

  // Parse the URL to separate pathname from query string so blocklist
  // checks work even when query params are present (e.g. /admin?foo=1)
  let parsed: URL
  try {
    parsed = new URL(rawUrl, "http://localhost")
  } catch {
    res.status(400).json({ error: "Invalid URL" })
    return
  }

  const pathname = parsed.pathname

  // Validate the path looks reasonable (starts with /)
  if (!pathname.startsWith("/")) {
    res.status(400).json({ error: "URL must be an absolute path" })
    return
  }

  // Reject paths with dot-segments to prevent traversal bypasses
  // (e.g. /../admin or /api/../admin would bypass the blocklist below)
  if (pathname.includes("/..")) {
    res.status(400).json({ error: "Path traversal not allowed" })
    return
  }

  // Block API/admin paths from being rendered (exact match and subpaths)
  if (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    res.status(400).json({ error: "Cannot render API or admin paths" })
    return
  }

  // Reconstruct the full URL preserving any query parameters
  const fullUrl = `${TARGET_HOST}${pathname}${parsed.search}`
  log.info({ url: rawUrl, fullUrl }, "Rendering page")

  try {
    const html = await renderPage(fullUrl)
    res.set("Content-Type", "text/html")
    res.set("X-Prerender", "true")
    res.send(html)
  } catch (err) {
    log.error({ err, url: rawUrl }, "Render failed")

    // Playwright throws TimeoutError; AbortSignal.timeout throws with name "TimeoutError"
    const error = err as Error
    if (error.name === "TimeoutError") {
      res.status(504).json({ error: "Render timeout" })
      return
    }

    res.status(500).json({ error: "Render failed" })
  }
})

app.get("/health", (_req, res) => {
  // Browser launches lazily on first render request.
  // "not yet started" is healthy — the service is ready to launch on demand.
  const browserOk = isBrowserHealthy()
  res.json({
    status: "ok",
    browser: browserOk ? "connected" : "idle",
  })
})

const server = app.listen(PORT, () => {
  log.info({ port: PORT, targetHost: TARGET_HOST }, "Prerender service started")
})

// Graceful shutdown — await server.close so in-flight requests can finish,
// then close the browser. No process.exit() so Node exits naturally.
// Using process.once to prevent double shutdown from repeated signals.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    log.info({ signal }, "Shutting down prerender service")
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await closeBrowser()
    log.info("Prerender service stopped")
  })
}
