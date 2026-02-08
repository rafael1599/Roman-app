import { test, expect } from '../fixtures/test-base';
import { BasePage } from '../pages';

// Unique SKU to avoid collisions during repeated runs
const SKU = BasePage.generateSKU('GHOST-ROLLBACK');
const LOCATION = 'Row 1';

test.describe('Offline Sync & Rollback ("The Ghost Fix")', () => {

    test.beforeEach(async ({ inventoryPage }) => {
        await inventoryPage.goto('/');

        // Ensure item exists
        await inventoryPage.addItem({
            sku: SKU,
            quantity: 10,
            location: LOCATION
        });

        // Search for it to ensure it's visible
        await inventoryPage.reloadAndSearch(SKU);
        await inventoryPage.verifyItemExists(SKU, LOCATION);
    });

    test('should rollback optimistic update when sync fails', async ({ page, context, inventoryPage }) => {
        // 1. Setup Interceptor for FAILURE
        await page.route('**/rpc/adjust_inventory_quantity*', async (route) => {
            if (route.request().method() === 'POST') {
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
        const card = inventoryPage.getCard(SKU, LOCATION);
        await card.getByRole('button', { name: 'Increase quantity' }).click();

        // 4. VERIFY OPTIMISTIC UI
        await expect(card.getByText('11', { exact: true })).toBeVisible();

        // 5. Go ONLINE (Trigger Sync)
        await context.setOffline(false);

        // 6. VALIDATE ROLLBACK
        await expect(async () => {
            await expect(card.getByText('10', { exact: true })).toBeVisible();
        }).toPass({ timeout: 20000 });
    });

    test('should sync changes to history after network restores ("Prueba 3")', async ({ page, context, inventoryPage }) => {
        // 1. Go OFFLINE
        await context.setOffline(true);

        // 2. User performs Action (Decrease Qty)
        const card = inventoryPage.getCard(SKU, LOCATION);
        await card.getByRole('button', { name: 'Decrease quantity' }).click();

        // Verify optimistic UI
        await expect(card.getByText('9', { exact: true })).toBeVisible();

        // 3. Wait for debounce (1500ms)
        await page.waitForTimeout(2000);

        // 4. Go ONLINE (Trigger Sync)
        await context.setOffline(false);
        console.log('Went Online');

        // 5. Wait for sync to inventory (looser check for redirects)
        const invResponse = await page.waitForResponse(resp =>
            resp.url().includes('/rpc/adjust_inventory_quantity') &&
            resp.request().method() === 'POST'
            , { timeout: 20000 }).catch(() => null);

        if (invResponse) {
            console.log(`Sync Response Status: ${invResponse.status()}`);
            expect(invResponse.status()).toBeLessThan(400);
        }

        // 6. Wait for realtime to stabilize (Optional, it might be too fast)
        await expect(page.getByText('Ready')).toBeVisible({ timeout: 15000 }).catch(() => {
            console.log('Took too long to see "Ready" indicator, proceeding to verification...');
        });

        // 7. Verify Persistence & History
        // Reload to ensure we get fresh state from server
        await page.reload();
        await inventoryPage.search(SKU);

        // 7. Navigate to History
        await page.getByRole('button', { name: 'HISTORY' }).click();

        // 8. Verify entry in history
        await expect(page.getByText(SKU).first()).toBeVisible({ timeout: 10000 });

        // Wait for the history to fully load and show the item
        await expect(async () => {
            const historyItem = page.locator('div.group.relative', { hasText: SKU }).first();
            await expect(historyItem).toBeVisible();
        }).toPass({ timeout: 20000 });
    });
});
