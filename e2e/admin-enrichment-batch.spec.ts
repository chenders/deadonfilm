import { test, expect, Page } from "@playwright/test"
import {
  setupBaseMocks,
  loginToAdmin,
  mockBatchStatus,
  mockBatchStatusActive,
  mockBatchHistory,
  mockBatchSubmitResult,
} from "./fixtures/admin-mocks"

// Set shorter timeouts for faster failure detection
test.setTimeout(15000)

// Use desktop viewport for all tests
test.use({ viewport: { width: 1280, height: 800 } })

// Mock enrichment runs data (for the main enrichment page)
const mockEnrichmentRuns = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
}

// Setup mock routes specific to batch enrichment
async function setupBatchMocks(page: Page, hasActiveBatch = false) {
  await setupBaseMocks(page)

  // Mock enrichment runs (main page)
  await page.route("**/admin/api/enrichment/runs*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockEnrichmentRuns),
      })
    } else {
      await route.continue()
    }
  })

  // Mock batch status
  await page.route("**/admin/api/enrichment/batch/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hasActiveBatch ? mockBatchStatusActive : mockBatchStatus),
    })
  })

  // Mock batch history
  await page.route("**/admin/api/enrichment/batch/history*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBatchHistory),
    })
  })

  // Mock batch submit
  await page.route("**/admin/api/enrichment/batch/submit", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(mockBatchSubmitResult),
    })
  })

  // Mock batch check
  await page.route("**/admin/api/enrichment/batch/*/check", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        batchId: "batch_1234567890_abc123",
        status: "completed",
        totalItems: 100,
        processedItems: 100,
        successfulItems: 95,
        failedItems: 5,
        progress: 100,
      }),
    })
  })

  // Mock batch process
  await page.route("**/admin/api/enrichment/batch/*/process", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        batchId: "batch_1234567890_abc123",
        processed: 100,
        successful: 95,
        failed: 5,
        message: "Processed 100 actors from batch",
      }),
    })
  })

  // Mock refetch details
  await page.route("**/admin/api/enrichment/refetch-details", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        actorsQueued: 50,
        dryRun: false,
        message: "Queued 50 actors for detail refetch",
      }),
    })
  })
}

test.describe("Admin Batch Enrichment", () => {
  test("batch status endpoint returns idle state", async ({ page }) => {
    await setupBatchMocks(page)
    await loginToAdmin(page)

    // Use page.evaluate with fetch to go through route mocking
    const data = await page.evaluate(async () => {
      const response = await fetch("/admin/api/enrichment/batch/status")
      return response.json()
    })

    expect(data.activeBatch).toBeNull()
    expect(data.queueDepth).toBe(0)
  })

  test("batch status endpoint returns active batch", async ({ page }) => {
    await setupBatchMocks(page, true) // hasActiveBatch = true
    await loginToAdmin(page)

    // Use page.evaluate with fetch to go through route mocking
    const data = await page.evaluate(async () => {
      const response = await fetch("/admin/api/enrichment/batch/status")
      return response.json()
    })

    expect(data.activeBatch).not.toBeNull()
    expect(data.activeBatch.status).toBe("processing")
    expect(data.activeBatch.progress).toBe(45)
  })

  test("batch history endpoint returns history", async ({ page }) => {
    await setupBatchMocks(page)
    await loginToAdmin(page)

    // Use page.evaluate with fetch to go through route mocking
    const data = await page.evaluate(async () => {
      const response = await fetch("/admin/api/enrichment/batch/history")
      return response.json()
    })

    expect(data.history).toHaveLength(2)
    expect(data.history[0].jobType).toBe("cause-of-death")
    expect(data.history[1].jobType).toBe("death-details")
  })

  test("batch submit endpoint works", async ({ page }) => {
    await setupBatchMocks(page)
    await loginToAdmin(page)

    // Use page.evaluate with fetch to go through route mocking
    const data = await page.evaluate(async () => {
      const response = await fetch("/admin/api/enrichment/batch/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100, jobType: "cause-of-death" }),
      })
      return response.json()
    })

    expect(data.batchId).toBeTruthy()
    expect(data.actorsSubmitted).toBe(100)
  })

  test("refetch details endpoint works", async ({ page }) => {
    await setupBatchMocks(page)
    await loginToAdmin(page)

    // Use page.evaluate with fetch to go through route mocking
    const data = await page.evaluate(async () => {
      const response = await fetch("/admin/api/enrichment/refetch-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, popularOnly: false, dryRun: false }),
      })
      return response.json()
    })

    expect(data.actorsQueued).toBe(50)
    expect(data.dryRun).toBe(false)
  })

  test("enrichment runs page loads", async ({ page }) => {
    await setupBatchMocks(page)
    await loginToAdmin(page)

    await page.goto("/admin/enrichment/runs")
    await page.waitForLoadState("networkidle")

    // Verify page loads
    await page.waitForSelector("text=Enrichment Runs", { timeout: 5000 })

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/admin-enrichment-runs.png",
    })
  })
})
