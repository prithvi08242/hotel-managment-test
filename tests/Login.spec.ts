import { test, expect } from '@playwright/test';

test('successful login with valid guest credentials', async ({ page }) => {
  await page.goto('/login');

  await page.getByTestId('email-input').fill('guest@w.com');
  await page.getByTestId('password-input').fill('guest');
  await page.getByTestId('login-button').click();

  await expect(page).toHaveURL(/\/rooms/);
  await expect(page.getByTestId('room-list-page')).toBeVisible();
});

test('shows error on wrong password', async ({ page }) => {
  await page.goto('/login');

  await page.getByTestId('email-input').fill('guest@w.com');
  await page.getByTestId('password-input').fill('wrongpass');
  await page.getByTestId('login-button').click();

  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});