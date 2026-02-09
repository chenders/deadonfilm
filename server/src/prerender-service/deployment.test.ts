/**
 * Tests to verify the prerender SSR deployment configuration.
 *
 * These tests parse docker-compose.yml and deploy.yml to ensure
 * the prerender service is properly configured for production.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "../../..")

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(ROOT_DIR, relativePath), "utf-8")
}

describe("prerender deployment configuration", () => {
  describe("docker-compose.yml", () => {
    const composeContent = readProjectFile("docker-compose.yml")
    const compose = parseYaml(composeContent)

    it("defines a prerender service", () => {
      expect(compose.services.prerender).toBeDefined()
    })

    it("prerender service uses a registry image (not local build)", () => {
      const prerender = compose.services.prerender
      expect(prerender.image).toBeDefined()
      expect(prerender.image).toMatch(/^ghcr\.io\//)
      expect(prerender.build).toBeUndefined()
    })

    it("prerender service has no profile restriction (starts by default)", () => {
      const prerender = compose.services.prerender
      expect(prerender.profiles).toBeUndefined()
    })

    it("prerender service uses IMAGE_TAG variable for versioning", () => {
      const prerender = compose.services.prerender
      expect(prerender.image).toContain("${IMAGE_TAG:-latest}")
    })

    it("prerender service depends on nginx being healthy", () => {
      const prerender = compose.services.prerender
      expect(prerender.depends_on).toBeDefined()
      expect(prerender.depends_on.nginx).toBeDefined()
      expect(prerender.depends_on.nginx.condition).toBe("service_healthy")
    })

    it("prerender service has a health check", () => {
      const prerender = compose.services.prerender
      expect(prerender.healthcheck).toBeDefined()
      expect(prerender.healthcheck.test).toBeDefined()
    })

    it("prerender service exposes port 3001", () => {
      const prerender = compose.services.prerender
      expect(prerender.expose).toContain("3001")
    })

    it("prerender service sets NODE_ENV=production", () => {
      const prerender = compose.services.prerender
      expect(prerender.environment).toContain("NODE_ENV=production")
    })

    it("prerender service sets PRERENDER_TARGET_HOST to nginx", () => {
      const prerender = compose.services.prerender
      expect(prerender.environment).toContain("PRERENDER_TARGET_HOST=http://nginx:3000")
    })
  })

  describe("deploy.yml workflow", () => {
    const deployContent = readProjectFile(".github/workflows/deploy.yml")
    const deploy = parseYaml(deployContent)
    const job = deploy.jobs["build-and-deploy"]
    const steps = job.steps

    function findStepByName(stepName: string): Record<string, unknown> {
      const step = steps.find((s: Record<string, unknown>) => s.name === stepName)
      if (!step) {
        throw new Error(`Expected step "${stepName}" to be present in deploy.yml workflow`)
      }
      return step as Record<string, unknown>
    }

    it("has a step to build and push the prerender image", () => {
      const prerenderBuildStep = findStepByName("Build and push prerender image")
      const withBlock = prerenderBuildStep.with as Record<string, unknown>
      expect(withBlock.file).toBe("Dockerfile.prerender")
      expect(withBlock.push).toBe(true)
    })

    it("has metadata extraction for the prerender image", () => {
      const metaStep = findStepByName("Extract prerender metadata")
      const withBlock = metaStep.with as Record<string, unknown>
      expect(withBlock.images).toContain("-prerender")
    })

    it("deploy step does not use --profile prerender", () => {
      const deployStep = findStepByName("Deploy application")
      expect(deployStep.run).not.toContain("--profile prerender")
    })

    it("deploy step pulls all images including prerender", () => {
      const deployStep = findStepByName("Deploy application")
      expect(deployStep.run).toContain("docker compose pull")
    })

    it("deploy step shows prerender logs on failure", () => {
      const deployStep = findStepByName("Deploy application")
      expect(deployStep.run).toContain("logs prerender")
    })
  })

  describe("Dockerfile.prerender", () => {
    const dockerfileContent = readProjectFile("Dockerfile.prerender")

    it("uses the Playwright base image with Chromium", () => {
      expect(dockerfileContent).toContain("mcr.microsoft.com/playwright")
    })

    it("exposes port 3001", () => {
      expect(dockerfileContent).toContain("EXPOSE 3001")
    })

    it("runs the prerender service server", () => {
      expect(dockerfileContent).toContain("prerender-service/server.js")
    })

    it("runs as non-root user", () => {
      expect(dockerfileContent).toContain("USER pwuser")
    })
  })

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

    it("defaults PRERENDER_SERVICE_URL to http://prerender:3001", () => {
      expect(middlewareContent).toContain('"http://prerender:3001"')
    })

    it("checks for X-Prerender header from nginx", () => {
      expect(middlewareContent).toContain("x-prerender")
      expect(middlewareContent).toContain('"1"')
    })

    it("calls the prerender service /render endpoint", () => {
      expect(middlewareContent).toContain("/render?url=")
    })
  })
})
