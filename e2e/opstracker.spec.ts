import { test, expect, Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-container')).toBeVisible();
  await expect(page.getByTestId('app-title')).toHaveText('OpsTracker');
  await expect(page.getByTestId('health-status')).toContainText('Online');

  // If not logged in yet, sign in with default evaluation admin account
  const loginForm = page.getByTestId('login-form');
  if (await loginForm.isVisible()) {
    await page.getByTestId('login-email-input').fill('admin@opstracker.com');
    await page.getByTestId('login-password-input').fill('Admin123!');
    await page.getByTestId('login-submit-button').click();
  }

  await expect(page.getByTestId('current-user-badge')).toBeVisible();
}

test.describe('OpsTracker E2E Suite — Auth (Register/Login), CRUD Users & Tasks', () => {
  test('1. Registers a new account, logs out, and signs back in via Login', async ({ page }) => {
    const uniqueEmail = `e2e.user.${Date.now()}@opstracker.com`;

    await page.goto('/');
    await expect(page.getByTestId('app-title')).toHaveText('OpsTracker');
    await expect(page.getByTestId('health-status')).toContainText('Online');

    // Switch to Register tab and create account
    await page.getByTestId('auth-tab-register').click();
    await expect(page.getByTestId('register-form')).toBeVisible();

    await page.getByTestId('register-name-input').fill('E2E Test User');
    await page.getByTestId('register-email-input').fill(uniqueEmail);
    await page.getByTestId('register-password-input').fill('TestPass123!');
    await page.getByTestId('register-role-select').selectOption('user');
    await page.getByTestId('register-submit-button').click();

    // Verify authenticated state
    await expect(page.getByTestId('current-user-badge')).toContainText('E2E Test User');
    await expect(page.getByTestId('nav-tabs')).toBeVisible();

    // Logout
    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('login-form')).toBeVisible();

    // Sign back in with the newly registered account
    await page.getByTestId('login-email-input').fill(uniqueEmail);
    await page.getByTestId('login-password-input').fill('TestPass123!');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('current-user-badge')).toContainText('E2E Test User');
  });

  test('2. Full CRUD Users flow (Create, Persist on Reload, Update, Delete)', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to Users Management tab
    await page.getByTestId('nav-tab-users').click();
    await expect(page.getByTestId('users-section')).toBeVisible();

    const uniqueId = Date.now();
    const createdName = `SRE Engineer ${uniqueId}`;
    const updatedName = `Lead SRE ${uniqueId}`;
    const createdEmail = `sre.${uniqueId}@opstracker.com`;

    // CREATE User
    await page.getByTestId('user-name-input').fill(createdName);
    await page.getByTestId('user-email-input').fill(createdEmail);
    await page.getByTestId('user-password-input').fill('SrePass123!');
    await page.getByTestId('user-role-select').selectOption('user');
    await page.getByTestId('user-submit-button').click();

    const userCard = page.locator('.user-card', { hasText: createdEmail });
    await expect(userCard).toBeVisible();
    await expect(userCard).toContainText(createdName);

    // Reload and navigate back to Users tab to verify persistence in PostgreSQL
    await page.reload();
    await page.getByTestId('nav-tab-users').click();
    const persistedCard = page.locator('.user-card', { hasText: createdEmail });
    await expect(persistedCard).toBeVisible();

    // UPDATE User
    await persistedCard.locator('button', { hasText: 'Edit' }).click();
    await page.getByTestId('user-name-input').fill(updatedName);
    await page.getByTestId('user-role-select').selectOption('admin');
    await page.getByTestId('user-submit-button').click();

    const updatedCard = page.locator('.user-card', { hasText: createdEmail });
    await expect(updatedCard).toContainText(updatedName);
    await expect(updatedCard).toContainText('admin');

    // DELETE User
    await updatedCard.locator('button.btn-delete').click();
    await expect(page.locator('.user-card', { hasText: createdEmail })).toHaveCount(0);
  });

  test('3. Loads Tasks Board and verifies visible operational components', async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByTestId('stat-total')).toBeVisible();
    await expect(page.getByTestId('stat-pending')).toBeVisible();
    await expect(page.getByTestId('stat-in-progress')).toBeVisible();
    await expect(page.getByTestId('stat-done')).toBeVisible();

    await expect(page.getByTestId('task-form')).toBeVisible();
    await expect(page.getByTestId('filter-all')).toBeVisible();
    await expect(page.getByTestId('filter-pending')).toBeVisible();
    await expect(page.getByTestId('filter-in_progress')).toBeVisible();
    await expect(page.getByTestId('filter-done')).toBeVisible();
  });

  test('4. Creates a task, updates status, filters, and deletes it persistently', async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const uniqueRunId = Date.now();
    const taskTitle = `Deploy EC2 Canary v${uniqueRunId}`;
    const taskDesc = `Automated runbook verification ${uniqueRunId}`;

    // Create task
    await page.getByTestId('task-title-input').fill(taskTitle);
    await page.getByTestId('task-description-input').fill(taskDesc);
    await page.getByTestId('task-priority-select').selectOption('high');
    await page.getByTestId('task-submit-button').click();

    const createdCard = page.locator('.task-card', { hasText: taskTitle });
    await expect(createdCard).toBeVisible();
    await expect(createdCard).toContainText(taskDesc);

    // Reload to verify DB persistence
    await page.reload();
    const persistedCard = page.locator('.task-card', { hasText: taskTitle });
    await expect(persistedCard).toBeVisible();

    // Update status and filter
    const statusSelect = persistedCard.locator('select.status-select');
    await statusSelect.selectOption('in_progress');
    await expect(statusSelect).toHaveValue('in_progress');

    await page.getByTestId('filter-in_progress').click();
    await expect(page.locator('.task-card', { hasText: taskTitle })).toBeVisible();

    await page.getByTestId('filter-done').click();
    await expect(page.locator('.task-card', { hasText: taskTitle })).toHaveCount(0);

    await page.getByTestId('filter-all').click();

    // Delete task
    await page.locator('.task-card', { hasText: taskTitle }).locator('button.btn-delete').click();
    await expect(page.locator('.task-card', { hasText: taskTitle })).toHaveCount(0);
  });

  test('5. Verifies simulated 500 error button and error banner behavior', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByTestId('error-test-button').click();

    const errorBanner = page.getByTestId('error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Simulated internal server error');

    await page.getByTestId('error-banner-close').click();
    await expect(page.getByTestId('error-banner')).toHaveCount(0);
  });
});
