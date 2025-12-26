import { test, expect } from '@playwright/test';

test('login and check dashboard', async ({ page }) => {
  await page.goto('http://localhost:8080/');

  // Wait for the password input to be visible
  await page.waitForSelector('input[type="password"]');

  // Fill in the password
  await page.fill('input[type="password"]', 'Gabriel17');

  // Click the login button
  await page.click('button[type="submit"]');

  // Wait for the main content to be visible
  await page.waitForSelector('main');

  // Expect the main content to be visible
  expect(await page.isVisible('main')).toBe(true);

  // Take a screenshot of the dashboard
  await page.screenshot({ path: 'e2e/screenshot.png' });
});
