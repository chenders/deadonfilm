import { test, expect, Page } from "@playwright/test"
import {
  setupBaseMocks,
  loginToAdmin,
  mockCacheStats,
  mockInvalidateResult,
  mockRebuildResult,
} from "./fixtures/admin-mocks"

// Set shorter timeouts for faster failure detection
test.setTimeout(15000)

// Use desktop viewport for all tests
test.use({ viewport: { width: 1280, height: 800 } })

// Setup mock routes specific to cache management page
async function setupCacheMocks(page: Page) {
  await setupBaseMocks(page)

  // Mock cache stats
  await page.route("**/admin/api/cache/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCacheStats),
    })
  })

  // Mock warm cache
  await page.route("**/admin/api/cache/warm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, duration: 5000 }),
    })
  })

  // Mock invalidate death caches
  await page.route("**/admin/api/cache/invalidate-death", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockInvalidateResult),
    })
  })

  // Mock rebuild death caches
  await page.route("**/admin/api/cache/rebuild-death", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRebuildResult),
    })
  })
}

test.describe("Admin Cache Management Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupCacheMocks(page)
    await loginToAdmin(page)
  })

  test("displays cache management page with stats", async ({ page }) => {
    // /admin/cache redirects to /admin/operations?tab=cache (System Ops hub)
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Wait for System Ops page to load with Cache tab active
    await page.waitForSelector("text=System Ops", { timeout: 5000 })

    // Verify hub page title
    await expect(page.getByRole("heading", { name: "System Ops" })).toBeVisible()

    // Verify Cache tab is active
    await expect(page.getByRole("tab", { name: "Cache" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-management.png",
    })
  })

  test("displays invalidate death caches section", async ({ page }) => {
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Verify invalidate section exists (use heading role to be specific)
    await expect(page.getByRole("heading", { name: "Invalidate Death Caches" })).toBeVisible()

    // Verify actor IDs input exists
    const actorIdsInput = page.locator('[data-testid="invalidate-actor-ids-input"]')
    await expect(actorIdsInput).toBeVisible()

    // Verify "All" checkbox exists
    const allCheckbox = page.locator('[data-testid="invalidate-all-checkbox"]')
    await expect(allCheckbox).toBeVisible()

    // Verify "Also rebuild" checkbox exists
    const rebuildCheckbox = page.locator('[data-testid="invalidate-rebuild-checkbox"]')
    await expect(rebuildCheckbox).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-invalidate-section.png",
    })
  })

  test("invalidate all checkbox disables actor IDs input", async ({ page }) => {
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Check the "All" checkbox
    const allCheckbox = page.locator('[data-testid="invalidate-all-checkbox"]')
    await allCheckbox.check()

    // Verify actor IDs input is disabled
    const actorIdsInput = page.locator('[data-testid="invalidate-actor-ids-input"]')
    await expect(actorIdsInput).toBeDisabled()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-invalidate-all-checked.png",
    })
  })

  test("invalidate button triggers invalidation", async ({ page }) => {
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Check "All" checkbox
    const allCheckbox = page.locator('[data-testid="invalidate-all-checkbox"]')
    await allCheckbox.check()

    // Click invalidate button
    const invalidateButton = page.locator('[data-testid="invalidate-submit-button"]')
    await invalidateButton.click()

    // Wait for result
    await page.waitForTimeout(1000)

    // Verify result is displayed
    const resultSection = page.locator('[data-testid="cache-action-result"]')
    await expect(resultSection).toBeVisible()
    await expect(page.getByText("150")).toBeVisible() // invalidated count

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-invalidate-result.png",
    })
  })

  test("rebuild death caches button works", async ({ page }) => {
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Find and click rebuild button
    const rebuildButton = page.locator('[data-testid="rebuild-death-button"]')
    await expect(rebuildButton).toBeVisible()
    await rebuildButton.click()

    // Wait for result
    await page.waitForTimeout(1000)

    // Verify success message
    await expect(page.getByText("success")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-rebuild-result.png",
    })
  })

  test("also rebuild checkbox is checked by default", async ({ page }) => {
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Verify "Also rebuild" checkbox is checked by default
    const rebuildCheckbox = page.locator('[data-testid="invalidate-rebuild-checkbox"]')
    await expect(rebuildCheckbox).toBeChecked()

    // Uncheck and verify
    await rebuildCheckbox.uncheck()
    await expect(rebuildCheckbox).not.toBeChecked()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-rebuild-unchecked.png",
    })
  })

  test("can enter specific actor IDs to invalidate", async ({ page }) => {
    await page.goto("/admin/cache")
    await page.waitForLoadState("networkidle")

    // Enter actor IDs
    const actorIdsInput = page.locator('[data-testid="invalidate-actor-ids-input"]')
    await actorIdsInput.fill("1001, 1002, 1003")

    // Verify input value
    await expect(actorIdsInput).toHaveValue("1001, 1002, 1003")

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-cache-specific-actors.png",
    })
  })
})
