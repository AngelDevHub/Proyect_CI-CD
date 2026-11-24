import { test, expect } from '@playwright/test';

test.describe('OpsTracker E2E Suite — End-to-End Visual & Functional Flows', () => {
  const uniqueRunId = Date.now();
  const testTaskTitle = `Deploy EC2 Canary v${uniqueRunId}`;
  const testTaskDescription = `Automated runbook verification ${uniqueRunId}`;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait until the container is visible and API health shows Online
    await expect(page.getByTestId('app-container')).toBeVisible();
    await expect(page.getByTestId('app-title')).toHaveText('OpsTracker');
    await expect(page.getByTestId('health-status')).toContainText('Online');
  });

  test('1. Loads the interface and verifies visible operational components', async ({ page }) => {
    // Assert header elements
    await expect(page.getByTestId('app-title')).toBeVisible();
    await expect(page.getByTestId('health-status')).toBeVisible();
    await expect(page.getByTestId('error-test-button')).toBeVisible();

    // Assert statistics cards
    await expect(page.getByTestId('stat-total')).toBeVisible();
    await expect(page.getByTestId('stat-pending')).toBeVisible();
    await expect(page.getByTestId('stat-in-progress')).toBeVisible();
    await expect(page.getByTestId('stat-done')).toBeVisible();

    // Assert creation form and filters
    await expect(page.getByTestId('task-form')).toBeVisible();
    await expect(page.getByTestId('filter-all')).toBeVisible();
    await expect(page.getByTestId('filter-pending')).toBeVisible();
    await expect(page.getByTestId('filter-in_progress')).toBeVisible();
    await expect(page.getByTestId('filter-done')).toBeVisible();
  });

  test('2. Creates a new task and verifies persistence after page reload', async ({ page }) => {
    // Fill creation form
    await page.getByTestId('task-title-input').fill(testTaskTitle);
    await page.getByTestId('task-description-input').fill(testTaskDescription);
    await page.getByTestId('task-priority-select').selectOption('high');

    // Submit form
    await page.getByTestId('task-submit-button').click();

    // Form inputs should be reset
    await expect(page.getByTestId('task-title-input')).toHaveValue('');

    // Locate the newly created card by title
    const createdCard = page.locator('.task-card', { hasText: testTaskTitle });
    await expect(createdCard).toBeVisible();
    await expect(createdCard).toContainText(testTaskDescription);
    await expect(createdCard).toContainText('High');

    // Reload the page to confirm persistence in PostgreSQL
    await page.reload();
    await expect(page.getByTestId('app-container')).toBeVisible();
    const persistedCard = page.locator('.task-card', { hasText: testTaskTitle });
    await expect(persistedCard).toBeVisible();
    await expect(persistedCard).toContainText(testTaskDescription);
  });

  test('3. Updates task status and verifies filter reactivity', async ({ page }) => {
    // Create an isolated task for status transition test
    const statusTaskTitle = `Status Transition Task ${Date.now()}`;
    await page.getByTestId('task-title-input').fill(statusTaskTitle);
    await page.getByTestId('task-submit-button').click();

    const taskCard = page.locator('.task-card', { hasText: statusTaskTitle });
    await expect(taskCard).toBeVisible();

    // Change status from Pending to In Progress
    const statusSelect = taskCard.locator('select.status-select');
    await statusSelect.selectOption('in_progress');
    await expect(statusSelect).toHaveValue('in_progress');

    // Click filter 'In Progress' and verify the task is present
    await page.getByTestId('filter-in_progress').click();
    await expect(page.locator('.task-card', { hasText: statusTaskTitle })).toBeVisible();

    // Click filter 'Done' and verify the task is NOT visible
    await page.getByTestId('filter-done').click();
    await expect(page.locator('.task-card', { hasText: statusTaskTitle })).toHaveCount(0);

    // Reset filter to All
    await page.getByTestId('filter-all').click();
    await expect(page.locator('.task-card', { hasText: statusTaskTitle })).toBeVisible();
  });

  test('4. Deletes a task from the UI and verifies removal', async ({ page }) => {
    // Create task specifically for deletion
    const deleteTaskTitle = `Task to Delete ${Date.now()}`;
    await page.getByTestId('task-title-input').fill(deleteTaskTitle);
    await page.getByTestId('task-submit-button').click();

    const taskCard = page.locator('.task-card', { hasText: deleteTaskTitle });
    await expect(taskCard).toBeVisible();

    // Click delete button
    const deleteButton = taskCard.locator('button.btn-delete');
    await deleteButton.click();

    // Confirm the task is removed from the DOM
    await expect(page.locator('.task-card', { hasText: deleteTaskTitle })).toHaveCount(0);

    // Reload page to verify it was deleted in PostgreSQL
    await page.reload();
    await expect(page.locator('.task-card', { hasText: deleteTaskTitle })).toHaveCount(0);
  });

  test('5. Verifies error handling and simulated 500 button behavior', async ({ page }) => {
    // Click simulate 500 error button
    await page.getByTestId('error-test-button').click();

    // Error banner should appear with the simulated exception
    const errorBanner = page.getByTestId('error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Simulated internal server error');

    // Close error banner
    await page.getByTestId('error-banner-close').click();
    await expect(page.getByTestId('error-banner')).toHaveCount(0);
  });
});
