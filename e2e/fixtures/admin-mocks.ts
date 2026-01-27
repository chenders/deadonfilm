/**
 * Shared mock data and utilities for admin E2E tests.
 */

import { Page } from "@playwright/test"

// Admin credentials from environment
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

// ============================================================================
// Mock Data - Dashboard
// ============================================================================

export const mockDashboardStats = {
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
    totalRuns: 25,
    recentRunsCount: 5,
  },
  costStats: {
    totalCost: 125.5,
    lastMonthCost: 45.25,
  },
}

// ============================================================================
// Mock Data - Cache Management
// ============================================================================

export const mockCacheStats = {
  lastWarmed: "2026-01-26T12:00:00Z",
  actorsWarmed: 1000,
  hitRate24h: 0.85,
  missRate24h: 0.15,
  totalKeys: 1500,
}

export const mockInvalidateResult = {
  invalidated: 150,
  rebuilt: true,
  duration: 2500,
}

export const mockRebuildResult = {
  success: true,
  duration: 3200,
}

// ============================================================================
// Mock Data - Data Quality
// ============================================================================

export const mockDataQualityOverview = {
  futureDeathsCount: 15,
  uncertainDeathsCount: 42,
  pendingResetCount: 125,
}

export const mockFutureDeaths = {
  total: 15,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  actors: [
    {
      id: 1001,
      name: "Test Actor One",
      tmdbId: 12345,
      deathDate: "2030-01-01",
      birthDate: "1950-01-01",
      popularity: 25.5,
      issueType: "future_date" as const,
    },
    {
      id: 1002,
      name: "Test Actor Two",
      tmdbId: 12346,
      deathDate: "1945-06-15",
      birthDate: "1950-01-01",
      popularity: 18.2,
      issueType: "before_birth" as const,
    },
  ],
}

export const mockUncertainDeaths = {
  total: 42,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  actors: [
    {
      id: 2001,
      name: "Uncertain Actor One",
      tmdbId: 22345,
      deathDate: "1985-03-15",
      popularity: 12.3,
      circumstancesExcerpt: "Reports suggest possible heart attack, but this is unconfirmed...",
    },
  ],
}

export const mockCleanupResult = {
  cleaned: 15,
  actorIds: [1001, 1002],
  duration: 1500,
  dryRun: false,
}

export const mockResetEnrichmentResult = {
  reset: true,
  actorId: 1001,
  name: "Test Actor",
  historyDeleted: 3,
  circumstancesDeleted: 1,
  dryRun: false,
}

// ============================================================================
// Mock Data - Sync Operations
// ============================================================================

export const mockSyncStatus = {
  lastSync: {
    type: "tmdb-people",
    completedAt: "2026-01-26T12:00:00Z",
    itemsChecked: 1000,
    itemsUpdated: 150,
    newDeathsFound: 5,
  },
  isRunning: false,
  currentSyncId: null,
  currentSyncStartedAt: null,
}

export const mockSyncRunning = {
  lastSync: {
    type: "tmdb-people",
    completedAt: "2026-01-25T12:00:00Z",
    itemsChecked: 500,
    itemsUpdated: 75,
    newDeathsFound: 2,
  },
  isRunning: true,
  currentSyncId: 42,
  currentSyncStartedAt: "2026-01-26T14:30:00Z",
}

export const mockSyncHistory = {
  history: [
    {
      id: 1,
      syncType: "tmdb-people",
      startedAt: "2026-01-26T12:00:00Z",
      completedAt: "2026-01-26T12:15:00Z",
      status: "completed" as const,
      itemsChecked: 1000,
      itemsUpdated: 150,
      newDeathsFound: 5,
      errorMessage: null,
      parameters: { days: 1 },
      triggeredBy: "admin",
    },
    {
      id: 2,
      syncType: "tmdb-all",
      startedAt: "2026-01-25T10:00:00Z",
      completedAt: "2026-01-25T10:45:00Z",
      status: "completed" as const,
      itemsChecked: 5000,
      itemsUpdated: 500,
      newDeathsFound: 12,
      errorMessage: null,
      parameters: { days: 7 },
      triggeredBy: "cron",
    },
    {
      id: 3,
      syncType: "tmdb-movies",
      startedAt: "2026-01-24T08:00:00Z",
      completedAt: "2026-01-24T08:05:00Z",
      status: "failed" as const,
      itemsChecked: 100,
      itemsUpdated: 0,
      newDeathsFound: 0,
      errorMessage: "TMDB API rate limit exceeded",
      parameters: { days: 1 },
      triggeredBy: "admin",
    },
  ],
}

export const mockTriggerSyncResult = {
  syncId: 43,
  message: "Sync started",
  syncType: "tmdb-people",
  days: 1,
  dryRun: false,
}

// ============================================================================
// Mock Data - Batch Enrichment
// ============================================================================

export const mockBatchStatus = {
  activeBatch: null,
  queueDepth: 0,
}

export const mockBatchStatusActive = {
  activeBatch: {
    id: 1,
    batchId: "batch_1234567890_abc123",
    jobType: "cause-of-death",
    status: "processing",
    createdAt: "2026-01-26T14:00:00Z",
    totalItems: 100,
    processedItems: 45,
    successfulItems: 42,
    failedItems: 3,
    progress: 45,
  },
  queueDepth: 0,
}

export const mockBatchHistory = {
  history: [
    {
      id: 1,
      batchId: "batch_1234567890_abc123",
      jobType: "cause-of-death",
      status: "completed" as const,
      createdAt: "2026-01-25T10:00:00Z",
      completedAt: "2026-01-25T10:30:00Z",
      totalItems: 100,
      processedItems: 100,
      successfulItems: 95,
      failedItems: 5,
      parameters: { limit: 100 },
      errorMessage: null,
      costUsd: 2.5,
    },
    {
      id: 2,
      batchId: "batch_1234567891_def456",
      jobType: "death-details",
      status: "completed" as const,
      createdAt: "2026-01-24T08:00:00Z",
      completedAt: "2026-01-24T08:45:00Z",
      totalItems: 50,
      processedItems: 50,
      successfulItems: 48,
      failedItems: 2,
      parameters: { limit: 50, minPopularity: 10 },
      errorMessage: null,
      costUsd: 1.25,
    },
  ],
}

export const mockBatchSubmitResult = {
  batchId: "batch_1234567892_ghi789",
  jobId: 3,
  jobType: "cause-of-death",
  actorsSubmitted: 100,
  message: "Batch job created with 100 actors",
}

// ============================================================================
// Shared Mock Setup Functions
// ============================================================================

/**
 * Setup base mock routes for admin authentication.
 * NOTE: Playwright route matching is LIFO (last in, first out)
 * Register catch-all FIRST so specific routes take priority
 */
export async function setupBaseMocks(page: Page) {
  // Catch-all for any unhandled admin API endpoints (lowest priority - registered first)
  await page.route("**/admin/api/**", async (route) => {
    console.warn(`[e2e] Unmocked admin API request: ${route.request().url()} - returning empty object`)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })

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

  // Mock dashboard stats
  await page.route("**/admin/api/dashboard/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDashboardStats),
    })
  })
}

/**
 * Login to admin panel with mocked authentication.
 */
export async function loginToAdmin(page: Page) {
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
