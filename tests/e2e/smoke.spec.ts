import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
