import { test, expect, Page } from "@playwright/test"
import {
  setupBaseMocks,
  loginToAdmin,
  mockDataQualityOverview,
  mockFutureDeaths,
  mockUncertainDeaths,
  mockCleanupResult,
  mockResetEnrichmentResult,
} from "./fixtures/admin-mocks"

// Set shorter timeouts for faster failure detection
test.setTimeout(15000)

// Use desktop viewport for all tests
test.use({ viewport: { width: 1280, height: 800 } })

// Setup mock routes specific to data quality page
async function setupDataQualityMocks(page: Page) {
  await setupBaseMocks(page)

  // Mock data quality overview
  await page.route("**/admin/api/data-quality/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDataQualityOverview),
    })
  })

  // Mock future deaths
  await page.route("**/admin/api/data-quality/future-deaths*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockFutureDeaths),
    })
  })

  // Mock cleanup future deaths
  await page.route("**/admin/api/data-quality/cleanup-future-deaths", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCleanupResult),
    })
  })

  // Mock uncertain deaths
  await page.route("**/admin/api/data-quality/uncertain-deaths*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUncertainDeaths),
    })
  })

  // Mock reset enrichment
  await page.route("**/admin/api/data-quality/reset-enrichment", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockResetEnrichmentResult),
    })
  })
}

test.describe("Admin Data Quality Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupDataQualityMocks(page)
    await loginToAdmin(page)
  })

  test("displays overview tab with stat cards", async ({ page }) => {
    await page.goto("/admin/data-quality")
    await page.waitForLoadState("networkidle")

    // Wait for overview to load
    await page.waitForSelector("text=Data Quality", { timeout: 5000 })

    // Verify stat cards are visible
    await expect(page.getByText("Future/Invalid Death Dates")).toBeVisible()
    await expect(page.getByText("15")).toBeVisible() // futureDeathsCount
    await expect(page.getByText("Uncertain Death Records")).toBeVisible()
    await expect(page.getByText("42")).toBeVisible() // uncertainDeathsCount
    await expect(page.getByText("Actors With Enrichment History")).toBeVisible()
    await expect(page.getByText("125")).toBeVisible() // pendingResetCount

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-data-quality-overview.png",
    })
  })

  test("navigates to future deaths tab and displays table", async ({ page }) => {
    await page.goto("/admin/data-quality")
    await page.waitForLoadState("networkidle")

    // Click on Future Deaths tab
    const futureDeathsTab = page.locator('[data-testid="data-quality-future-deaths-tab"]')
    await futureDeathsTab.click()
    await page.waitForTimeout(500)

    // Verify table is visible
    const table = page.locator('[data-testid="future-deaths-table"]')
    await expect(table).toBeVisible()

    // Verify actor data is displayed (scope to table to avoid matching mobile cards)
    const futureDeathsDesktop = table.locator("table")
    await expect(futureDeathsDesktop.getByText("Test Actor One")).toBeVisible()
    await expect(futureDeathsDesktop.getByText("2030-01-01")).toBeVisible()
    await expect(futureDeathsDesktop.getByText("Future Date")).toBeVisible()

    await expect(futureDeathsDesktop.getByText("Test Actor Two")).toBeVisible()
    await expect(futureDeathsDesktop.getByText("Death Before Birth")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-data-quality-future-deaths.png",
    })
  })

  test("cleanup button triggers cleanup action", async ({ page }) => {
    await page.goto("/admin/data-quality")
    await page.waitForLoadState("networkidle")

    // Click on Future Deaths tab
    const futureDeathsTab = page.locator('[data-testid="data-quality-future-deaths-tab"]')
    await futureDeathsTab.click()
    await page.waitForTimeout(500)

    // Click cleanup button
    const cleanupButton = page.locator('[data-testid="cleanup-future-deaths-button"]')
    await cleanupButton.click()

    // Wait for success message
    await page.waitForTimeout(1000)
    await expect(page.getByText("Cleanup Complete")).toBeVisible()
    await expect(page.getByText("Cleaned 15 actors")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-data-quality-cleanup-result.png",
    })
  })

  test("navigates to uncertain deaths tab", async ({ page }) => {
    await page.goto("/admin/data-quality")
    await page.waitForLoadState("networkidle")

    // Click on Uncertain Deaths tab
    const uncertainTab = page.locator('[data-testid="data-quality-uncertain-tab"]')
    await uncertainTab.click()
    await page.waitForTimeout(500)

    // Verify uncertain deaths content (scope to table to avoid matching mobile cards)
    await expect(page.getByText("Uncertain Death Records")).toBeVisible()
    const uncertainDesktop = page.locator(".hidden.md\\:block table")
    await expect(uncertainDesktop.getByText("Uncertain Actor One")).toBeVisible()
    await expect(uncertainDesktop.getByText("1985-03-15")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-data-quality-uncertain-deaths.png",
    })
  })

  test("reset enrichment form works", async ({ page }) => {
    await page.goto("/admin/data-quality")
    await page.waitForLoadState("networkidle")

    // Click on Reset Enrichment tab
    const resetTab = page.locator('[data-testid="data-quality-reset-tab"]')
    await resetTab.click()
    await page.waitForTimeout(500)

    // Verify form is visible
    const resetForm = page.locator('[data-testid="reset-enrichment-form"]')
    await expect(resetForm).toBeVisible()

    // Fill in actor ID
    const actorIdInput = page.locator("#resetActorId")
    await actorIdInput.fill("1001")

    // Click reset button (within the form, not the tab)
    const resetButton = page.locator('[data-testid="reset-enrichment-form"]').getByRole("button", { name: "Reset Enrichment" })
    await resetButton.click()

    // Wait for success message
    await page.waitForTimeout(1000)
    await expect(page.getByText("Reset Complete")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-data-quality-reset-result.png",
    })
  })

  test("dry run toggle affects behavior", async ({ page }) => {
    await page.goto("/admin/data-quality")
    await page.waitForLoadState("networkidle")

    // Click on Reset Enrichment tab
    const resetTab = page.locator('[data-testid="data-quality-reset-tab"]')
    await resetTab.click()
    await page.waitForTimeout(500)

    // Verify dry run toggle is visible
    const dryRunToggle = page.locator('[data-testid="dry-run-toggle"]')
    await expect(dryRunToggle).toBeVisible()

    // Check dry run checkbox
    const dryRunCheckbox = page.locator("#resetDryRun")
    await dryRunCheckbox.check()

    // Verify it's checked
    await expect(dryRunCheckbox).toBeChecked()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-data-quality-dry-run.png",
    })
  })
})
