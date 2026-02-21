/**
 * Server-Side Rendering middleware.
 *
 * Renders React components on the server for all non-API, non-static requests.
 * Falls back to the SPA shell on any error (graceful degradation).
 *
 * Flow:
 *   1. Check Redis for cached SSR HTML
 *   2. If miss, render React via entry-server.tsx
 *   3. Inject Helmet head tags and dehydrated React Query state
 *   4. Cache result in Redis
 *   5. On any error, serve the SPA shell (index.html without SSR content)
 */

import type { Request, Response, NextFunction } from "express"
import { PassThrough } from "node:stream"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
/** Minimal Helmet server state type — avoids react-helmet-async peer dep conflict with React 19 */
interface HelmetServerState {
  title: { toString(): string }
  meta: { toString(): string }
  link: { toString(): string }
  script: { toString(): string }
}
import { getCached, setCached, buildCacheKey, CACHE_TTL } from "../lib/cache.js"
import { logger } from "../lib/logger.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Cache key prefix for SSR rendered HTML */
const SSR_CACHE_PREFIX = "ssr"

/** Paths that should NOT be SSR-rendered */
const SKIP_PREFIXES = [
  "/api/",
  "/admin",
  "/health",
  "/sitemap",
  "/nr-browser.js",
  "/assets/",
  "/og/",
]

/** Paths with frequently changing content — shorter cache TTL */
const DYNAMIC_PREFIXES = ["/death-watch", "/deaths", "/covid-deaths", "/unnatural-deaths"]

/** SSR render timeout in milliseconds */
const SSR_TIMEOUT_MS = 5000

// Resolve paths relative to the project root (server/dist/src/middleware/ → project root)
const PROJECT_ROOT = path.resolve(__dirname, "../../../../")
const CLIENT_DIST = path.join(PROJECT_ROOT, "frontend/dist/client")
const SERVER_DIST = path.join(PROJECT_ROOT, "frontend/dist/server")

// In development, the paths are different
const DEV_CLIENT_DIST = path.join(PROJECT_ROOT, "dist/client")
const DEV_SERVER_DIST = path.join(PROJECT_ROOT, "dist/server")

function resolveDistPaths(): { clientDist: string; serverDist: string } {
  // Production (Docker): /app/frontend/dist/client and /app/frontend/dist/server
  if (fs.existsSync(path.join(CLIENT_DIST, "index.html"))) {
    return { clientDist: CLIENT_DIST, serverDist: SERVER_DIST }
  }
  // Development: <project>/dist/client and <project>/dist/server
  if (fs.existsSync(path.join(DEV_CLIENT_DIST, "index.html"))) {
    return { clientDist: DEV_CLIENT_DIST, serverDist: DEV_SERVER_DIST }
  }
  throw new Error(`SSR: Could not find client dist. Tried:\n  ${CLIENT_DIST}\n  ${DEV_CLIENT_DIST}`)
}

interface PrefetchSpec {
  queryKey: readonly unknown[]
  queryFn: () => Promise<unknown>
}

interface SSRModule {
  render: (
    url: string,
    queryClient: unknown,
    streamOptions?: unknown
  ) => {
    stream: { pipe: (dest: NodeJS.WritableStream) => void; abort: () => void }
    helmetContext: { helmet?: HelmetServerState }
    getDehydratedState: () => unknown
  }
  createQueryClient: () => {
    prefetchQuery: (opts: {
      queryKey: readonly unknown[]
      queryFn: () => Promise<unknown>
    }) => Promise<void>
  }
  matchRouteLoaders: (url: string) => ((fetchBase: string) => PrefetchSpec[]) | null
}

let cachedTemplate: string | null = null
let ssrModule: SSRModule | null = null
let distPaths: { clientDist: string; serverDist: string } | null = null

function getDistPaths() {
  if (!distPaths) {
    distPaths = resolveDistPaths()
  }
  return distPaths
}

function getTemplate(): string {
  if (cachedTemplate) return cachedTemplate
  const { clientDist } = getDistPaths()
  const templatePath = path.join(clientDist, "index.html")
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted build output path
  cachedTemplate = fs.readFileSync(templatePath, "utf-8")
  return cachedTemplate
}

async function getSSRModule(): Promise<SSRModule> {
  if (ssrModule) return ssrModule
  const { serverDist } = getDistPaths()
  const entryPath = path.join(serverDist, "entry-server.js")
  ssrModule = (await import(entryPath)) as SSRModule
  return ssrModule
}

function shouldSkip(urlPath: string): boolean {
  return SKIP_PREFIXES.some((prefix) => urlPath.startsWith(prefix))
}

function getCacheTtl(urlPath: string): number {
  if (urlPath === "/") return CACHE_TTL.PRERENDER_DYNAMIC // 1 hour for home page
  if (DYNAMIC_PREFIXES.some((prefix) => urlPath.startsWith(prefix))) {
    return CACHE_TTL.PRERENDER_DYNAMIC // 1 hour
  }
  return CACHE_TTL.PRERENDER // 24 hours
}

function buildSSRCacheKey(urlPath: string): string {
  return buildCacheKey(SSR_CACHE_PREFIX, { path: urlPath })
}

/**
 * Extract helmet tags as an HTML string for injection into <head>.
 */
function getHelmetHeadTags(helmet: HelmetServerState | undefined): string {
  if (!helmet) return ""
  const parts: string[] = []
  if (helmet.title) parts.push(helmet.title.toString())
  if (helmet.meta) parts.push(helmet.meta.toString())
  if (helmet.link) parts.push(helmet.link.toString())
  if (helmet.script) parts.push(helmet.script.toString())
  return parts.filter(Boolean).join("\n    ")
}

/**
 * Render the React app to a string (non-streaming for cacheability).
 * Prefetches data via route loaders, then renders using renderToPipeableStream
 * and collects the output into a string.
 */
async function renderToString(
  url: string,
  mod: SSRModule,
  fetchBase: string
): Promise<{ html: string; headTags: string; dehydratedState: unknown }> {
  const queryClient = mod.createQueryClient()

  // Prefetch data for the matched route before rendering
  const getLoaders = mod.matchRouteLoaders(url)
  if (getLoaders) {
    const specs = getLoaders(fetchBase)
    await Promise.allSettled(
      specs.map((spec) =>
        queryClient.prefetchQuery({
          queryKey: spec.queryKey,
          queryFn: spec.queryFn,
        })
      )
    )
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      result.stream.abort()
      reject(new Error(`SSR render timed out after ${SSR_TIMEOUT_MS}ms for ${url}`))
    }, SSR_TIMEOUT_MS)

    const result = mod.render(url, queryClient, {
      onAllReady() {
        clearTimeout(timeout)
        const chunks: Buffer[] = []
        const passThrough = new PassThrough()

        passThrough.on("data", (chunk: Buffer) => chunks.push(chunk))
        passThrough.on("end", () => {
          const appHtml = Buffer.concat(chunks).toString("utf-8")
          const headTags = getHelmetHeadTags(result.helmetContext.helmet)
          const dehydratedState = result.getDehydratedState()
          resolve({ html: appHtml, headTags, dehydratedState })
        })
        passThrough.on("error", (err) => {
          clearTimeout(timeout)
          reject(err)
        })

        result.stream.pipe(passThrough)
      },
      onError(err: unknown) {
        clearTimeout(timeout)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    })
  })
}

/**
 * Assemble the final HTML by injecting SSR content into the template.
 */
function assembleHtml(
  template: string,
  appHtml: string,
  headTags: string,
  dehydratedState: unknown
): string {
  let html = template

  // Inject head tags from Helmet
  if (headTags) {
    html = html.replace("<!--app-head-->", headTags)
  }

  // Inject rendered app HTML
  html = html.replace("<!--app-html-->", appHtml)

  // Inject dehydrated React Query state before the closing </body>
  const stateScript = `<script>window.__REACT_QUERY_STATE__=${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")}</script>`
  html = html.replace("</body>", `${stateScript}\n</body>`)

  return html
}

/**
 * Serve the SPA shell (index.html without SSR content) as a fallback.
 */
function serveSpaFallback(res: Response): void {
  try {
    const template = getTemplate()
    // Strip SSR placeholders — client will do a full render
    const fallback = template.replace("<!--app-head-->", "").replace("<!--app-html-->", "")
    res.set("Content-Type", "text/html")
    res.set("X-SSR", "fallback")
    res.send(fallback)
  } catch {
    // If even the template can't be read, return 503
    res.status(503).send("Service temporarily unavailable")
  }
}

/**
 * Express middleware that SSR-renders React for non-API requests.
 */
export async function ssrMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only handle GET requests
  if (req.method !== "GET") {
    next()
    return
  }

  // Skip paths that shouldn't be SSR-rendered
  if (shouldSkip(req.path)) {
    next()
    return
  }

  // Skip requests for files with extensions (static assets that slipped through)
  if (req.path.includes(".") && !req.path.endsWith("/")) {
    next()
    return
  }

  const normalizedPath = req.path.replace(/\/$/, "") || "/"
  const cacheKey = buildSSRCacheKey(normalizedPath)

  try {
    // Check Redis cache first
    const cached = await getCached<string>(cacheKey)
    if (cached) {
      res.set("Content-Type", "text/html")
      res.set("X-SSR", "hit")
      res.send(cached)
      return
    }

    // Load SSR module and template
    const mod = await getSSRModule()
    const template = getTemplate()

    // Build the internal API base URL for prefetching.
    // Use localhost to call ourselves directly (avoids nginx loop, avoids SSR re-entry).
    // The SSR middleware skips /api/ paths, so these fetches go straight to API handlers.
    const urlWithQuery = req.originalUrl
    const localPort = req.socket.localPort || process.env.PORT || 8080
    const fetchBase = `http://127.0.0.1:${localPort}`

    // Render the app (prefetches data, then streams React to string)
    const {
      html: appHtml,
      headTags,
      dehydratedState,
    } = await renderToString(urlWithQuery, mod, fetchBase)

    // Assemble the full HTML document
    const fullHtml = assembleHtml(template, appHtml, headTags, dehydratedState)

    // Cache the result (fire-and-forget)
    const ttl = getCacheTtl(normalizedPath)
    setCached(cacheKey, fullHtml, ttl).catch((err) => {
      logger.warn(
        { err: (err as Error).message, url: req.originalUrl },
        "Failed to cache SSR result"
      )
    })

    // Send the response
    res.set("Content-Type", "text/html")
    res.set("X-SSR", "miss")
    res.send(fullHtml)
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, url: req.originalUrl },
      "SSR render failed, serving SPA fallback"
    )
    serveSpaFallback(res)
  }
}
