import { test, expect } from '@playwright/test';

test('take PR screenshots', async ({ page }) => {
  test.setTimeout(120000);
  
  // 1. Home page with media type toggle
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('media-type-toggle')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/home-media-toggle.png' });
  
  // 2. Search with mixed results (movies and TV)
  await page.fill('[data-testid="search-input"]', 'breaking');
  await expect(page.getByTestId('search-dropdown')).toBeVisible();
  await expect(page.getByTestId('search-dropdown').locator('li').first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/search-tv-results.png' });
  
  // 3. TV only filter - click TV button and wait for results
  await page.click('[data-testid="media-type-toggle"] button:nth-child(3)');
  await page.waitForTimeout(1000);
  // Re-trigger search after changing filter
  await page.fill('[data-testid="search-input"]', '');
  await page.fill('[data-testid="search-input"]', 'breaking');
  await expect(page.getByTestId('search-dropdown')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screenshots/search-tv-only.png' });
  
  // 4. Show page - wait for actual content
  await page.goto('/show/seinfeld-1989-1400');
  await expect(page.getByTestId('show-header')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Seinfeld')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screenshots/show-page-seinfeld.png' });
  
  // 5. Episode page - wait for actual content
  await page.goto('/episode/seinfeld-the-chinese-restaurant-s02e06-1400');
  await expect(page.getByTestId('episode-header')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screenshots/episode-page.png' });
});
