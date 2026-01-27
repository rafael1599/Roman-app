import { test, expect } from '@playwright/test';

const SKU = 'TEST-SYNC-' + Date.now();
const WAREHOUSE = 'LUDLOW';
const LOCATION = 'Row 1';

test.describe('Offline Sync (Happy Path)', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Implicitly waits for login via global setup
        await expect(page.getByRole('heading', { level: 1 })).toContainText('ROMAN INV');

        // Ensure item exists
        await page.getByRole('button', { name: 'Add New SKU' }).click();
        await page.getByLabel('SKU', { exact: true }).fill(SKU);
        await page.getByLabel('Location', { exact: true }).fill(LOCATION);
        await page.getByLabel('Quantity', { exact: true }).fill('50');
        await page.getByRole('button', { name: 'Save' }).click();

        await expect(page.getByText(`${SKU}`)).toBeVisible();
    });

    test('should sync offline changes when network restores', async ({ page, context }) => {
        const row = page.locator('div.bg-card', { hasText: SKU });

        // 1. Go OFFLINE
        await context.setOffline(true);
        console.log('Went Offline');

        // 2. Perform Action (Pick -1)
        // Assuming UI has a minus button or similar
        await row.getByRole('button', { name: 'Decrease quantity' }).click();

        // 3. Verify Optimistic Update (50 -> 49)
        await expect(row.getByText('49', { exact: true })).toBeVisible();

        // 4. Go ONLINE
        await context.setOffline(false);
        console.log('Went Online');

        // 5. Verify Persistence
        // Wait for potential sync requests to complete
        // Supabase Patch to inventory
        await page.waitForResponse(resp =>
            resp.url().includes('/rest/v1/inventory') &&
            (resp.request().method() === 'PATCH' || resp.request().method() === 'POST')
            , { timeout: 10000 }).catch(() => console.log('No sync request detected, maybe already synced or failed'));

        // Reload page to fetch from server and ensure change stuck
        await page.reload();

        // Use polling assert to be robust against data loading lag
        await expect(async () => {
            await expect(row.getByText('49', { exact: true })).toBeVisible();
        }).toPass({ timeout: 10000 });
    });
});
