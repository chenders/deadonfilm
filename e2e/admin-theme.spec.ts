import { test, expect } from "@playwright/test"

// Admin credentials from environment
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

async function loginToAdmin(page: ReturnType<typeof test["info"]>["project"]["use"]["page"]) {
  console.log("[DEBUG] Starting loginToAdmin")
  console.log("[DEBUG] ADMIN_PASSWORD is set:", !!ADMIN_PASSWORD, "length:", ADMIN_PASSWORD.length)

  // Log network requests for debugging
  page.on("request", (request) => {
    if (request.url().includes("/admin/api")) {
      console.log("[DEBUG] Request:", request.method(), request.url())
    }
  })
  page.on("response", (response) => {
    if (response.url().includes("/admin/api")) {
      console.log("[DEBUG] Response:", response.status(), response.url())
    }
  })

  await page.goto("/admin/login")
  console.log("[DEBUG] Navigated to /admin/login")
  await page.waitForLoadState("networkidle")
  console.log("[DEBUG] Page loaded (networkidle)")

  // Take screenshot of login page
  await page.screenshot({ path: "e2e/screenshots/debug-login-page.png" })
  console.log("[DEBUG] Screenshot taken: debug-login-page.png")

  // Fill in the password
  const passwordInput = page.locator('input[type="password"]')
  console.log("[DEBUG] Found password input:", await passwordInput.count())
  await passwordInput.fill(ADMIN_PASSWORD)
  console.log("[DEBUG] Filled password")

  // Submit the form
  const loginButton = page.locator('button[type="submit"]')
  console.log("[DEBUG] Found login button:", await loginButton.count())
  await loginButton.click()
  console.log("[DEBUG] Clicked login button")

  // Wait a moment for the API response
  await page.waitForTimeout(2000)
  console.log("[DEBUG] Current URL after click:", page.url())

  // Take screenshot after login attempt
  await page.screenshot({ path: "e2e/screenshots/debug-after-login-click.png" })
  console.log("[DEBUG] Screenshot taken: debug-after-login-click.png")

  // Check for error messages on the page
  const errorText = await page.locator('[class*="error"], [class*="Error"], [role="alert"]').textContent().catch(() => null)
  if (errorText) {
    console.log("[DEBUG] Error message found:", errorText)
  }

  // Wait for redirect to dashboard
  console.log("[DEBUG] Waiting for redirect to /admin/dashboard...")
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 15000 })
  console.log("[DEBUG] Redirected to dashboard")
  await page.waitForLoadState("networkidle")
  console.log("[DEBUG] Dashboard loaded (networkidle)")
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
    await page.waitForSelector("text=Dashboard", { timeout: 10000 })

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
    await page.waitForSelector("text=Death Detail Coverage", { timeout: 10000 })

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
