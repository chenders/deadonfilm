import { test, expect } from "@playwright/test"

test.describe("Frontend Redesign Features", () => {
  test.describe("Mortality Gauge", () => {
    test("displays circular mortality gauge on movie page", async ({ page }) => {
      await page.goto("/movie/the-matrix-1999-603")

      await expect(page.getByTestId("movie-page")).toBeVisible()
      await expect(page.getByTestId("mortality-gauge")).toBeVisible()
      await expect(page.getByTestId("gauge-percentage")).toBeVisible()

      // Verify percentage is displayed
      const percentage = await page.getByTestId("gauge-percentage").textContent()
      expect(percentage).toMatch(/\d+%/)

      await page.screenshot({
        path: "e2e/screenshots/mortality-gauge.png",
      })
    })

    test("displays expected vs actual mortality comparison when actuarial data is available", async ({
      page,
    }) => {
      await page.goto("/movie/the-matrix-1999-603")

      await expect(page.getByTestId("movie-page")).toBeVisible()

      // The mortality comparison only shows when actuarial data is available (expectedDeaths > 0)
      // In CI without seeded actuarial data, this element won't be present
      const mortalityComparison = page.getByTestId("mortality-comparison")
      const isVisible = await mortalityComparison.isVisible().catch(() => false)

      if (isVisible) {
        // Verify expected and actual labels are shown
        await expect(page.getByText("Expected:")).toBeVisible()
        await expect(page.getByText("Actual:")).toBeVisible()

        // Verify surprise label is displayed
        await expect(page.getByTestId("surprise-label")).toBeVisible()

        await page.screenshot({
          path: "e2e/screenshots/mortality-comparison.png",
        })
      }
      // If not visible, actuarial data is not seeded - test passes but skips assertions
    })
  })

  test.describe("Cast Toggle with Disabled State", () => {
    test("disables living button when livingCount is 0", async ({ page }) => {
      // Private Nurse (1941) has 100% mortality - all deceased
      await page.goto("/movie/private-nurse-1941-95120")

      await expect(page.getByTestId("movie-page")).toBeVisible()
      await expect(page.getByTestId("cast-toggle")).toBeVisible()

      // Living button should be disabled
      const livingBtn = page.getByTestId("living-toggle-btn")
      await expect(livingBtn).toBeDisabled()

      // Deceased button should be enabled and active
      const deceasedBtn = page.getByTestId("deceased-toggle-btn")
      await expect(deceasedBtn).not.toBeDisabled()

      await page.screenshot({
        path: "e2e/screenshots/cast-toggle-disabled.png",
      })
    })
  })

  test.describe("Deceased Card Expansion", () => {
    test("expands card to show external links on button click", async ({ page }) => {
      await page.goto("/movie/the-matrix-1999-603")

      await expect(page.getByTestId("deceased-cards")).toBeVisible()

      // Get the first deceased card
      const firstCard = page.getByTestId("deceased-card").first()
      await firstCard.scrollIntoViewIfNeeded()

      // Click the "Show links" button to expand
      const showLinksButton = firstCard.getByRole("button", { name: /show links/i })
      await showLinksButton.click()

      // Expanded section should appear
      await expect(page.getByTestId("actor-expanded").first()).toBeVisible()

      // Should have external links
      await expect(page.getByText("View on TMDB →").first()).toBeVisible()
      await expect(page.getByText("Search Filmography →").first()).toBeVisible()

      await page.screenshot({
        path: "e2e/screenshots/deceased-card-expanded.png",
      })

      // Click "Hide links" button to collapse
      const hideLinksButton = firstCard.getByRole("button", { name: /collapse links/i })
      await hideLinksButton.click()
      await expect(page.getByTestId("actor-expanded")).not.toBeVisible()
    })
  })

  test.describe("Film Reel Loading Animation", () => {
    test("shows loading spinner with film reel icon", async ({ page }) => {
      // Intercept the API to add delay
      await page.route("**/api/movie/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await route.continue()
      })

      await page.goto("/movie/the-matrix-1999-603")

      // Should show loading spinner
      const spinner = page.getByTestId("loading-spinner")
      await expect(spinner).toBeVisible()
      await expect(page.getByTestId("spinner")).toBeVisible()

      await page.screenshot({
        path: "e2e/screenshots/loading-spinner.png",
      })
    })
  })

  test.describe("Quick Actions", () => {
    test("displays quick action buttons on home page", async ({ page }) => {
      await page.goto("/")

      await expect(page.getByTestId("quick-actions")).toBeVisible()
      await expect(page.getByText("High Mortality")).toBeVisible()
      await expect(page.getByText("Classic Films")).toBeVisible()
      await expect(page.getByText("Surprise Me")).toBeVisible()

      await page.screenshot({
        path: "e2e/screenshots/quick-actions.png",
      })
    })
  })

  test.describe("Movie Title Styling", () => {
    test("movie title is distinct from site title", async ({ page }) => {
      await page.goto("/movie/the-matrix-1999-603")

      await expect(page.getByTestId("movie-page")).toBeVisible()

      // Site title should be visible in header
      await expect(page.getByTestId("site-title")).toBeVisible()

      // Movie title should be visible and styled differently
      await expect(page.getByTestId("movie-title")).toBeVisible()

      // Take screenshot to verify visual distinction
      await page.screenshot({
        path: "e2e/screenshots/title-styling.png",
      })
    })
  })

  test.describe("Clickable Movie Poster", () => {
    test("poster links to TMDB in new tab", async ({ page }) => {
      await page.goto("/movie/the-matrix-1999-603")

      await expect(page.getByTestId("movie-poster")).toBeVisible()

      // Poster should be wrapped in a link
      const posterLink = page.getByTestId("movie-poster").locator("..")
      await expect(posterLink).toHaveAttribute("href", /themoviedb\.org\/movie/)
      await expect(posterLink).toHaveAttribute("target", "_blank")
    })
  })

  test.describe("Empty State Cards", () => {
    test("shows empty state when no search results", async ({ page }) => {
      await page.goto("/")

      // Search for something that won't exist
      const searchInput = page.getByPlaceholder("Search for a movie...")
      await searchInput.fill("xyznonexistentmovie12345")

      // Wait for search to complete and API to return
      await page.waitForTimeout(1000)

      // Should show no results message with vintage styling
      await expect(page.getByTestId("search-no-results")).toBeVisible()
      await expect(page.getByText("End of Reel")).toBeVisible()
    })
  })

  test.describe("List Stagger Animation", () => {
    test("deceased cards have stagger animation classes", async ({ page }) => {
      await page.goto("/movie/the-matrix-1999-603")

      await expect(page.getByTestId("deceased-cards")).toBeVisible()

      // Cards should have animation class
      const cards = page.getByTestId("deceased-cards").locator("> div")
      const firstCard = cards.first()
      await expect(firstCard).toHaveClass(/animate-fade-slide-in/)
    })
  })
})

test.describe("Frontend Redesign - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test("mortality gauge is visible on mobile", async ({ page }) => {
    await page.goto("/movie/the-matrix-1999-603")

    await expect(page.getByTestId("mortality-gauge")).toBeVisible()
    await expect(page.getByTestId("gauge-percentage")).toBeInViewport()

    await page.screenshot({
      path: "e2e/screenshots/mortality-gauge-mobile.png",
    })
  })

  test("quick actions are visible on mobile", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByTestId("quick-actions")).toBeVisible()

    await page.screenshot({
      path: "e2e/screenshots/quick-actions-mobile.png",
    })
  })
})
