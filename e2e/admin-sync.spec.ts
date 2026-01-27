import { test, expect, Page } from "@playwright/test"
import {
  setupBaseMocks,
  loginToAdmin,
  mockSyncStatus,
  mockSyncRunning,
  mockSyncHistory,
  mockTriggerSyncResult,
} from "./fixtures/admin-mocks"

// Set shorter timeouts for faster failure detection
test.setTimeout(15000)

// Use desktop viewport for all tests
test.use({ viewport: { width: 1280, height: 800 } })

// Setup mock routes specific to sync page
async function setupSyncMocks(page: Page, isRunning = false) {
  await setupBaseMocks(page)

  // Mock sync status
  await page.route("**/admin/api/sync/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isRunning ? mockSyncRunning : mockSyncStatus),
    })
  })

  // Mock sync history
  await page.route("**/admin/api/sync/history*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSyncHistory),
    })
  })

  // Mock trigger sync
  await page.route("**/admin/api/sync/tmdb", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTriggerSyncResult),
    })
  })
}

test.describe("Admin TMDB Sync Page", () => {
  test("displays sync status card with ready state", async ({ page }) => {
    await setupSyncMocks(page)
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Wait for page to load
    await page.waitForSelector("text=TMDB Sync", { timeout: 5000 })

    // Verify status card shows ready
    const statusCard = page.locator('[data-testid="sync-status-card"]')
    await expect(statusCard).toBeVisible()
    await expect(page.getByText("Ready")).toBeVisible()

    // Verify last sync info is displayed (scope to status card to avoid matching history)
    await expect(statusCard.getByText("Last Completed Sync")).toBeVisible()
    await expect(statusCard.getByText("tmdb-people")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-status-ready.png",
    })
  })

  test("displays sync status with running indicator", async ({ page }) => {
    await setupSyncMocks(page, true) // Pass isRunning = true
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Verify running indicator (scope to status card to avoid matching button)
    const statusCard = page.locator('[data-testid="sync-status-card"]')
    await expect(statusCard.getByText("Sync in progress")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-status-running.png",
    })
  })

  test("displays trigger sync form with default values", async ({ page }) => {
    await setupSyncMocks(page)
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Verify trigger form is visible
    const triggerForm = page.locator('[data-testid="sync-trigger-form"]')
    await expect(triggerForm).toBeVisible()

    // Verify days input defaults to 1
    const daysInput = page.locator('[data-testid="sync-days-input"]')
    await expect(daysInput).toHaveValue("1")

    // Verify type checkboxes are all checked by default
    const peopleCheckbox = page.locator('[data-testid="sync-type-people-checkbox"]')
    const moviesCheckbox = page.locator('[data-testid="sync-type-movies-checkbox"]')
    const showsCheckbox = page.locator('[data-testid="sync-type-shows-checkbox"]')

    await expect(peopleCheckbox).toBeChecked()
    await expect(moviesCheckbox).toBeChecked()
    await expect(showsCheckbox).toBeChecked()

    // Verify dry run is not checked by default
    const dryRunToggle = page.locator('[data-testid="sync-dry-run-toggle"] input')
    await expect(dryRunToggle).not.toBeChecked()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-trigger-form.png",
    })
  })

  test("can modify sync form inputs", async ({ page }) => {
    await setupSyncMocks(page)
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Change days to 7
    const daysInput = page.locator('[data-testid="sync-days-input"]')
    await daysInput.fill("7")
    await expect(daysInput).toHaveValue("7")

    // Uncheck Movies
    const moviesCheckbox = page.locator('[data-testid="sync-type-movies-checkbox"]')
    await moviesCheckbox.uncheck()
    await expect(moviesCheckbox).not.toBeChecked()

    // Check dry run
    const dryRunCheckbox = page.locator('[data-testid="sync-dry-run-toggle"] input')
    await dryRunCheckbox.check()
    await expect(dryRunCheckbox).toBeChecked()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-form-modified.png",
    })
  })

  test("trigger sync button works", async ({ page }) => {
    await setupSyncMocks(page)
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Click submit button
    const submitButton = page.locator('[data-testid="sync-submit-button"]')
    await submitButton.click()

    // Wait for success message
    await page.waitForTimeout(1000)
    await expect(page.getByText("Sync Started")).toBeVisible()
    await expect(page.getByText("ID: 43")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-triggered.png",
    })
  })

  test("displays sync history table", async ({ page }) => {
    await setupSyncMocks(page)
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Verify history table is visible
    const historyTable = page.locator('[data-testid="sync-history-table"]')
    await expect(historyTable).toBeVisible()

    // Verify history entries (scope to history table to avoid matching status card)
    await expect(historyTable.getByText("tmdb-people")).toBeVisible()
    await expect(historyTable.getByText("tmdb-all")).toBeVisible()
    await expect(historyTable.getByText("tmdb-movies")).toBeVisible()

    // Verify status badges
    await expect(page.getByText("completed").first()).toBeVisible()
    await expect(page.getByText("failed")).toBeVisible()

    // Verify triggered by column
    await expect(page.getByText("admin").first()).toBeVisible()
    await expect(page.getByText("cron")).toBeVisible()

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-history.png",
    })
  })

  test("submit button is disabled when sync is running", async ({ page }) => {
    await setupSyncMocks(page, true) // isRunning = true
    await loginToAdmin(page)

    await page.goto("/admin/sync")
    await page.waitForLoadState("networkidle")

    // Verify submit button shows running state and is disabled
    const submitButton = page.locator('[data-testid="sync-submit-button"]')
    await expect(submitButton).toBeDisabled()
    await expect(submitButton).toContainText("Sync in Progress")

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-sync-button-disabled.png",
    })
  })
})
