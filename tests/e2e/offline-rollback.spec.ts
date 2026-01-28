import { test, expect } from '@playwright/test';

// Unique SKU to avoid collisions during repeated runs
const SKU = 'TEST-GHOST-' + Date.now();
const WAREHOUSE = 'LUDLOW';
const LOCATION = 'Row 1';

test.describe('Offline Sync & Rollback ("The Ghost Fix")', () => {

    test.beforeEach(async ({ page }) => {
        // SEED DATA: Ensure item exists
        // We can use UI to create it or API. UI is better for E2E but slower.
        // Let's assume we land on Inventory Screen and create/ensure it exists.
        await page.goto('/');

        // Check if we need to login (if global setup failed or verification needed)
        // Assuming global setup works, we should be logged in. 
        // Wait for inventory table
        await expect(page.getByRole('heading', { level: 1 })).toContainText('ROMAN INV');

        // Create Test Item
        await page.getByRole('button', { name: 'Add New SKU' }).click();
        await page.getByLabel('SKU', { exact: true }).fill(SKU);
        await page.getByLabel('Location', { exact: true }).fill(LOCATION);
        await page.getByLabel('Quantity', { exact: true }).fill('10');

        // Select Warehouse (might be select or radio) assuming Select/Option
        // If it's a custom Select component, we might need specific locator
        // Let's try filling standard form first.
        // Actually, let's use the Search to see if it exists to be robust?
        // No, creating fresh unique SKU is safer.

        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText(`${SKU}`)).toBeVisible();
        await expect(page.getByText('10', { exact: true }).first()).toBeVisible();
    });

    test('should rollback optimistic update when sync fails', async ({ page, context }) => {
        // 1. Setup Interceptor for FAILURE
        await page.route('**/rest/v1/inventory*', async (route) => {
            if (route.request().method() === 'PATCH' || route.request().method() === 'POST') {
                await route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: "Simulated Server Explosion" })
                });
            } else {
                await route.continue();
            }
        });

        // 2. Go OFFLINE
        await context.setOffline(true);

        // 3. User performs Action
        const row = page.locator('div.bg-card', { hasText: SKU });
        const plusBtn = row.getByRole('button', { name: 'Increase quantity' });
        await plusBtn.click();

        // 4. VERIFY OPTIMISTIC UI
        await expect(row.getByText('11', { exact: true })).toBeVisible();

        // 5. Go ONLINE (Trigger Sync)
        await context.setOffline(false);

        // 6. VALIDATE ROLLBACK
        await expect(async () => {
            await expect(row.getByText('10', { exact: true })).toBeVisible();
        }).toPass({ timeout: 15000 });
    });

    test('should sync changes to history after network restores ("Prueba 3")', async ({ page, context }) => {
        // 1. Go OFFLINE
        await context.setOffline(true);

        // 2. User performs Action (Decrease Qty)
        const row = page.locator('div.bg-card', { hasText: SKU });
        await row.getByRole('button', { name: 'Decrease quantity' }).click();

        // Verify optimistic UI
        await expect(row.getByText('9', { exact: true })).toBeVisible();

        // 3. Go ONLINE (Trigger Sync)
        await context.setOffline(false);

        // 4. Wait for sync to inventory and logs
        // Wait for BOTH the inventory update and the log insertion/update (could be PATCH due to coalescing)
        const [invResponse] = await Promise.all([
            page.waitForResponse(resp =>
                resp.url().includes('/rest/v1/inventory') &&
                resp.request().method() === 'PATCH'
                , { timeout: 20000 }),
            page.waitForResponse(resp =>
                resp.url().includes('/rest/v1/inventory_logs') &&
                (resp.request().method() === 'POST' || resp.request().method() === 'PATCH')
                , { timeout: 20000 })
        ]);

        expect(invResponse.status()).toBe(204); // Supabase PATCH typically returns 204

        // 5. Navigate to History
        await page.getByRole('button', { name: 'HISTORY' }).click();

        // 6. Verify entry in history
        // The log should contain the SKU and the delta (1)
        await expect(page.getByText(SKU).first()).toBeVisible();

        // Wait for the history to fully load and show the item
        await expect(async () => {
            const historyItem = page.locator('div.group.relative', { hasText: SKU }).first();
            await expect(historyItem).toBeVisible();
            await expect(historyItem.getByText('1', { exact: true })).toBeVisible();
        }).toPass({ timeout: 10000 });
    });
});
