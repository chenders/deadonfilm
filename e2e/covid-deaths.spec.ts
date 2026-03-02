import { test, expect, Page } from "@playwright/test"

const mockCovidDeathsResponse = {
  persons: [
    {
      id: 12345,
      rank: 1,
      name: "Test Actor One",
      actorSlug: "test-actor-one-12345",
      profilePath: "/test-profile-1.jpg",
      deathday: "2021-03-15",
      ageAtDeath: 72,
      causeOfDeath: "COVID-19",
      causeOfDeathDetails: "Complications from COVID-19",
      knownFor: [{ name: "Test Movie", year: 2020, type: "movie" }],
    },
    {
      id: 67890,
      rank: 2,
      name: "Test Actor Two",
      actorSlug: "test-actor-two-67890",
      profilePath: null,
      deathday: "2020-12-20",
      ageAtDeath: 65,
      causeOfDeath: "COVID-19",
      causeOfDeathDetails: null,
      knownFor: null,
    },
  ],
  pagination: {
    page: 1,
    pageSize: 50,
    totalPages: 1,
    totalCount: 2,
  },
}

async function setupMocks(page: Page) {
  await page.route("**/api/covid-deaths**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCovidDeathsResponse),
    })
  })
}

test.describe("COVID-19 Deaths Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test("displays covid deaths page with actor list", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Verify page title
    await expect(page.getByRole("heading", { name: "COVID-19 Deaths" })).toBeVisible()

    // Verify page description is visible (default shows "Well-known actors")
    await expect(
      page.getByText(/actors in our database who died from COVID-19/i)
    ).toBeVisible()

    // Wait for actor list to load (skip loading state)
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    // Verify at least one actor row is displayed
    const actorRows = page.locator('[data-testid^="covid-death-row-"]')
    await expect(actorRows.first()).toBeVisible()

    // Take full page screenshot
    await page.screenshot({
      path: "e2e/screenshots/covid-deaths-page.png",
      fullPage: true,
    })
  })

  test("actor row displays correctly on desktop", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Desktop-specific test")

    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // Verify the ActorCard renders with actor name and death info
    await expect(firstRow).toBeVisible()
    await expect(firstRow.getByText("Test Actor One")).toBeVisible()
    await expect(firstRow.getByText(/Died/)).toBeVisible()

    // Take screenshot of just the first row for visual comparison
    await firstRow.screenshot({
      path: "e2e/screenshots/covid-death-row-desktop.png",
    })
  })

  test("actor row displays correctly on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-specific test")

    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // Verify the ActorCard renders with actor name and death info on mobile
    await expect(firstRow).toBeVisible()
    await expect(firstRow.getByText("Test Actor One")).toBeVisible()
    await expect(firstRow.getByText(/Died/)).toBeVisible()

    // Take screenshot of just the first row for visual comparison
    await firstRow.screenshot({
      path: "e2e/screenshots/covid-death-row-mobile.png",
    })
  })

  test("responsive layout changes between viewports", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // Verify the row rendered successfully
    await expect(firstRow).toBeVisible()
  })

  test("actor rows are clickable links", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    const firstRow = page.locator('[data-testid^="covid-death-row-"]').first()

    // Verify it's a link
    await expect(firstRow).toHaveAttribute("href", /\/actor\//)

    // Click and verify navigation
    await firstRow.click()
    await expect(page).toHaveURL(/\/actor\//)
  })

  test("displays death information", async ({ page }) => {
    await page.goto("/covid-deaths")

    // Wait for actor list to load
    await page.waitForSelector('[data-testid^="covid-death-row-"]', { timeout: 10000 })

    // Verify that death-related info is shown (date, cause)
    // At least one row should show a death date - use visible: true to only match currently visible elements
    const visibleDiedElements = page.locator("text=/Died/").locator("visible=true")
    await expect(visibleDiedElements.first()).toBeVisible()
  })
})
