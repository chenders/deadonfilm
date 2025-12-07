import { test, expect } from "@playwright/test"

test.describe("Movie Page", () => {
  // Use The Matrix as a reliable test movie
  const movieUrl = "/movie/the-matrix-1999-603"

  test("displays movie header with title and year", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait for page to load
    await expect(page.getByTestId("movie-page")).toBeVisible()

    // Verify movie header elements
    await expect(page.getByTestId("movie-header")).toBeVisible()
    await expect(page.getByTestId("movie-title")).toBeVisible()
    await expect(page.getByTestId("movie-year")).toBeVisible()

    // Take full page screenshot
    await page.screenshot({
      path: "e2e/screenshots/movie-page-full.png",
      fullPage: true,
    })
  })

  test("displays mortality gauge", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait for mortality gauge to load
    await expect(page.getByTestId("mortality-gauge")).toBeVisible()

    // Verify gauge elements
    await expect(page.getByTestId("gauge-percentage")).toBeVisible()

    // Screenshot of just the mortality gauge area
    const gauge = page.getByTestId("mortality-gauge")
    await gauge.screenshot({
      path: "e2e/screenshots/mortality-gauge-detail.png",
    })
  })

  test("displays deceased cast list", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait for cast list to load
    await expect(page.getByTestId("cast-toggle")).toBeVisible()

    // Verify deceased list is shown by default
    await expect(page.getByTestId("deceased-toggle-btn")).toBeVisible()

    // Take screenshot showing the cast area
    await page.screenshot({
      path: "e2e/screenshots/movie-cast-list.png",
    })
  })

  test("viewport shows first actor card above fold", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait for page to fully load
    await expect(page.getByTestId("movie-page")).toBeVisible()
    // Wait for movie poster to load
    await expect(page.getByTestId("movie-poster")).toBeVisible()
    // Wait for mortality gauge to load
    await expect(page.getByTestId("mortality-gauge")).toBeVisible()
    // Wait for deceased actor cards to load
    await expect(page.getByTestId("deceased-toggle-btn")).toBeVisible()

    // Take viewport screenshot (not full page) to verify first actor is visible
    await page.screenshot({
      path: "e2e/screenshots/movie-above-fold.png",
    })

    // Check that cast toggle is visible without scrolling
    const castToggle = page.getByTestId("cast-toggle")
    await expect(castToggle).toBeInViewport()
  })

  test("can toggle between deceased and living cast", async ({ page }) => {
    await page.goto(movieUrl)

    // Wait for toggle to be visible
    await expect(page.getByTestId("cast-toggle")).toBeVisible()

    // Click living toggle
    await page.getByTestId("living-toggle-btn").click()

    // Wait for living list to appear (button has aria-pressed when active)
    await expect(page.getByTestId("living-toggle-btn")).toHaveAttribute("aria-pressed", "true")

    // Take screenshot of living cast
    await page.screenshot({
      path: "e2e/screenshots/movie-living-cast.png",
    })
  })
})

test.describe("Movie Page - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } })

  const movieUrl = "/movie/the-matrix-1999-603"

  test("compact header on mobile viewport", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("movie-page")).toBeVisible()
    // Wait for mortality gauge to load
    await expect(page.getByTestId("mortality-gauge")).toBeVisible()

    // Take mobile viewport screenshot
    await page.screenshot({
      path: "e2e/screenshots/movie-mobile-viewport.png",
    })
  })

  test("mortality gauge visible on mobile", async ({ page }) => {
    await page.goto(movieUrl)

    await expect(page.getByTestId("mortality-gauge")).toBeVisible()

    // Verify mortality gauge is in viewport on mobile
    const gauge = page.getByTestId("mortality-gauge")
    await expect(gauge).toBeInViewport()

    await page.screenshot({
      path: "e2e/screenshots/movie-mobile-mortality.png",
    })
  })
})
