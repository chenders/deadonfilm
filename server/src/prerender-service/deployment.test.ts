/**
 * Tests to verify the prerender deployment configuration.
 *
 * These tests parse config files to ensure the template-based
 * prerender system is properly configured for production.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "../../..")

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(ROOT_DIR, relativePath), "utf-8")
}

describe("prerender deployment configuration", () => {
  describe("nginx.conf prerender routing", () => {
    const nginxContent = readProjectFile("nginx.conf")

    it("detects bot user agents", () => {
      expect(nginxContent).toContain("$is_bot")
      expect(nginxContent).toContain("googlebot")
      expect(nginxContent).toContain("bingbot")
    })

    it("routes bots to @prerender location", () => {
      expect(nginxContent).toContain("if ($is_bot)")
      expect(nginxContent).toContain("@prerender")
    })

    it("@prerender location proxies to Express with X-Prerender header", () => {
      expect(nginxContent).toContain('proxy_set_header X-Prerender "1"')
      expect(nginxContent).toContain("proxy_pass http://app:8080")
    })

    it("@prerender falls back to SPA on error", () => {
      expect(nginxContent).toContain("@spa_fallback")
      expect(nginxContent).toContain("try_files /index.html")
    })
  })

  describe("prerender middleware configuration", () => {
    const middlewareContent = readProjectFile("server/src/middleware/prerender.ts")

    it("checks for X-Prerender header from nginx", () => {
      expect(middlewareContent).toContain("x-prerender")
      expect(middlewareContent).toContain('"1"')
    })

    it("uses template-based rendering (not external service)", () => {
      expect(middlewareContent).toContain("matchUrl")
      expect(middlewareContent).toContain("fetchPageData")
      expect(middlewareContent).toContain("renderPrerenderHtml")
      expect(middlewareContent).not.toContain("PRERENDER_SERVICE_URL")
    })

    it("has error fallback with generic site metadata", () => {
      expect(middlewareContent).toContain("renderFallbackHtml")
      expect(middlewareContent).toContain("ERROR-FALLBACK")
    })
  })
})
