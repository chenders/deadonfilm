/**
 * Playwright-based page renderer for prerendering SPA pages.
 *
 * Maintains a single Chromium browser instance and opens a new page per
 * render request. If the browser crashes it is automatically re-launched.
 */

import { chromium, type Browser, type Page } from "playwright-core"
import { logger } from "../lib/logger.js"

const RENDER_TIMEOUT_MS = 10_000
const VIEWPORT = { width: 1280, height: 800 }

let browser: Browser | null = null

async function ensureBrowser(): Promise<Browser> {
  if (browser?.isConnected()) {
    return browser
  }

  logger.info("Launching Chromium for prerender service")
  browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })

  browser.on("disconnected", () => {
    logger.warn("Chromium browser disconnected")
    browser = null
  })

  return browser
}

/**
 * Render a URL and return the full HTML.
 *
 * @param url - Full URL to render (e.g. http://nginx:3000/actor/john-wayne-2157)
 * @returns The rendered HTML string
 */
export async function renderPage(url: string): Promise<string> {
  const instance = await ensureBrowser()
  let page: Page | null = null

  try {
    page = await instance.newPage({ viewport: VIEWPORT })

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: RENDER_TIMEOUT_MS,
    })

    // Wait for the React app to render content into #root
    // Using string expressions so TypeScript doesn't need DOM types
    await page.waitForFunction(
      `(() => { const r = document.getElementById("root"); return r && r.children.length > 0 })()`,
      { timeout: RENDER_TIMEOUT_MS }
    )

    const html = (await page.evaluate(`document.documentElement.outerHTML`)) as string
    return `<!DOCTYPE html>${html}`
  } finally {
    if (page) {
      await page.close().catch(() => {})
    }
  }
}

/**
 * Close the browser instance. Call on shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
  }
}

/**
 * Check whether the browser is alive.
 */
export function isBrowserHealthy(): boolean {
  return browser?.isConnected() ?? false
}
