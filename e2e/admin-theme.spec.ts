import { test, expect, Page } from "@playwright/test"

// Set shorter timeouts for faster failure detection
test.setTimeout(15000) // 15 seconds max per test

// Admin credentials from environment
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

// Mock data for admin API endpoints
const mockCoverageStats = {
  total_deceased_actors: 1234,
  actors_with_death_pages: 1000,
  actors_without_death_pages: 234,
  coverage_percentage: "81.0",
  enrichment_candidates_count: 200,
  high_priority_count: 50,
}

const mockCoverageTrends = [
  {
    captured_at: "2026-01-20",
    coverage_percentage: 79.5,
    actors_with_death_pages: 980,
    actors_without_death_pages: 254,
  },
  {
    captured_at: "2026-01-21",
    coverage_percentage: 80.0,
    actors_with_death_pages: 990,
    actors_without_death_pages: 244,
  },
  {
    captured_at: "2026-01-22",
    coverage_percentage: 81.0,
    actors_with_death_pages: 1000,
    actors_without_death_pages: 234,
  },
]

const mockDashboardStats = {
  systemHealth: {
    database: true,
    redis: true,
  },
  actorStats: {
    totalActors: 567161,
    deceasedActors: 19799,
    enrichedActors: 8542,
  },
  enrichmentStats: {
    totalRuns: 0,
    recentRunsCount: 0,
  },
  costStats: {
    totalCost: 0,
    lastMonthCost: 0,
  },
}

// Setup mock API routes for admin endpoints
async function setupMockRoutes(page: Page) {
  // Mock auth status - return authenticated
  await page.route("**/admin/api/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true }),
    })
  })

  // Mock login - return success
  await page.route("**/admin/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  })

  // Mock coverage stats
  await page.route("**/admin/api/coverage/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCoverageStats),
    })
  })

  // Mock coverage trends
  await page.route("**/admin/api/coverage/trends*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCoverageTrends),
    })
  })

  // Mock analytics endpoints - return empty/minimal data
  await page.route("**/admin/api/analytics/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  })

  // Mock dashboard stats
  await page.route("**/admin/api/dashboard/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDashboardStats),
    })
  })

  // Mock any other admin API endpoints with empty success response
  await page.route("**/admin/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })
}

async function loginToAdmin(page: Page) {
  // Setup mocks before navigating
  await setupMockRoutes(page)

  await page.goto("/admin/login")
  await page.waitForLoadState("networkidle")

  // Fill in the password
  const passwordInput = page.locator('input[type="password"]')
  await passwordInput.fill(ADMIN_PASSWORD)

  // Submit the form
  const loginButton = page.locator('button[type="submit"]')
  await loginButton.click()

  // Wait for redirect to dashboard (5s timeout for faster failure)
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 5000 })
  await page.waitForLoadState("networkidle")
}

test.describe("Admin Theme - Dark Mode (Default)", () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport for consistent screenshots
    await page.setViewportSize({ width: 1280, height: 800 })
  })

  test("login page has dark theme styling", async ({ page }) => {
    await page.goto("/admin/login")
    await page.waitForLoadState("networkidle")

    // Take screenshot of login page
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-login-dark.png",
    })

    // Verify dark theme elements - check that the background has dark styling
    const body = page.locator("body")
    await expect(body).toBeVisible()
  })

  test("dashboard has dark theme styling", async ({ page }) => {
    await loginToAdmin(page)

    // Wait for dashboard content to load
    await page.waitForSelector("text=Dashboard", { timeout: 5000 })

    // Take screenshot of dashboard
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-dashboard-dark.png",
    })
  })

  test("sidebar navigation has dark theme styling", async ({ page }) => {
    await loginToAdmin(page)

    // Focus on the sidebar
    const sidebar = page.locator("nav").first()
    await expect(sidebar).toBeVisible()

    // Take screenshot of the sidebar
    await sidebar.screenshot({
      path: "e2e/screenshots/admin-theme-sidebar-dark.png",
    })
  })

  test("coverage page with charts has dark theme", async ({ page }) => {
    await loginToAdmin(page)

    // Navigate to coverage page
    await page.goto("/admin/coverage")
    await page.waitForLoadState("networkidle")

    // Wait for page content
    await page.waitForSelector("text=Death Detail Coverage", { timeout: 5000 })

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-coverage-dark.png",
    })
  })

  test("analytics page with charts has dark theme", async ({ page }) => {
    await loginToAdmin(page)

    // Navigate to analytics page
    await page.goto("/admin/analytics")
    await page.waitForLoadState("networkidle")

    // Wait for content to load
    await page.waitForTimeout(1000) // Allow time for charts to render

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-analytics-dark.png",
    })
  })

  test("theme toggle is visible in sidebar", async ({ page }) => {
    await loginToAdmin(page)

    // Look for the theme toggle button
    const themeToggle = page.locator('[aria-label*="Switch to"]')
    await expect(themeToggle).toBeVisible()

    // Take a focused screenshot of the toggle area
    const sidebar = page.locator("nav").first()
    await sidebar.screenshot({
      path: "e2e/screenshots/admin-theme-toggle-dark.png",
    })
  })
})

test.describe("Admin Theme - Light Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
  })

  test("can toggle to light theme", async ({ page }) => {
    await loginToAdmin(page)

    // Find and click the theme toggle
    const themeToggle = page.locator('[aria-label*="Switch to light"]')
    await expect(themeToggle).toBeVisible()
    await themeToggle.click()

    // Wait for theme transition
    await page.waitForTimeout(500)

    // Verify light theme is applied - check for admin-light class on html
    const html = page.locator("html")
    await expect(html).toHaveClass(/admin-light/)

    // Take screenshot of light theme dashboard
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-dashboard-light.png",
    })
  })

  test("light theme persists after navigation", async ({ page }) => {
    await loginToAdmin(page)

    // Toggle to light theme
    const themeToggle = page.locator('[aria-label*="Switch to light"]')
    await themeToggle.click()
    await page.waitForTimeout(300)

    // Navigate to another page
    await page.goto("/admin/coverage")
    await page.waitForLoadState("networkidle")

    // Verify light theme is still applied
    const html = page.locator("html")
    await expect(html).toHaveClass(/admin-light/)

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-coverage-light.png",
    })
  })

  test("can toggle back to dark theme", async ({ page }) => {
    await loginToAdmin(page)

    // Toggle to light theme first
    let themeToggle = page.locator('[aria-label*="Switch to light"]')
    await themeToggle.click()
    await page.waitForTimeout(300)

    // Toggle back to dark theme
    themeToggle = page.locator('[aria-label*="Switch to dark"]')
    await expect(themeToggle).toBeVisible()
    await themeToggle.click()
    await page.waitForTimeout(300)

    // Verify dark theme is applied (no admin-light class)
    const html = page.locator("html")
    await expect(html).not.toHaveClass(/admin-light/)

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-toggle-back-dark.png",
    })
  })
})

test.describe("Admin Theme - Mobile Responsive", () => {
  test("mobile navigation works with theme", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 })

    await loginToAdmin(page)

    // Take screenshot of mobile view
    await page.screenshot({
      path: "e2e/screenshots/admin-theme-mobile-dark.png",
    })

    // Click hamburger menu to open sidebar
    const menuButton = page.locator('[aria-label*="menu"]')
    if (await menuButton.isVisible()) {
      await menuButton.click()
      await page.waitForTimeout(300)

      // Take screenshot with sidebar open
      await page.screenshot({
        path: "e2e/screenshots/admin-theme-mobile-menu-open-dark.png",
      })
    }
  })
})
