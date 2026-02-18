import { test, expect } from '../fixtures/test-base';
import { BasePage } from '../pages';

const SKU = BasePage.generateSKU('TEST-SYNC');
const LOCATION = 'ROW-1-TEST';

test.describe('Offline Sync (Happy Path)', () => {

    test.beforeEach(async ({ inventoryPage }) => {
        await inventoryPage.goto('/');

        // Ensure item exists
        await inventoryPage.addItem({
            sku: SKU,
            quantity: 50,
            location: LOCATION
        });

        // Search for it to ensure it's visible
        await inventoryPage.reloadAndSearch(SKU);
        await inventoryPage.verifyItemExists(SKU, LOCATION);
    });

    test('should sync offline changes when network restores', async ({ page, context, inventoryPage }) => {
        const card = inventoryPage.getCard(SKU, LOCATION);

        // 1. Go OFFLINE
        await context.setOffline(true);
        console.log('Went Offline');

        // 2. Perform Action (Pick -1)
        await card.getByRole('button', { name: 'Decrease quantity' }).click();

        // 3. Verify Optimistic Update (50 -> 49)
        await expect(card.getByText('49', { exact: true })).toBeVisible();

        // 3.5 Wait for debounce (1500ms) to ensure it's queued/attempted
        await page.waitForTimeout(2000);

        // 4. Go ONLINE
        await context.setOffline(false);
        console.log('Went Online');

        // 5. Verify Persistence
        // RPC to adjust_inventory_quantity
        // We wait for a 2xx response, skipping any redirects (3xx)
        console.log('Waiting for successful sync response (2xx)...');
        const syncResp = await page.waitForResponse(resp =>
            resp.url().includes('/rpc/adjust_inventory_quantity') &&
            resp.request().method() === 'POST' &&
            resp.status() < 300
            , { timeout: 30000 }).catch(() => null);

        if (syncResp) {
            console.log(`Sync Final Response Status: ${syncResp.status()}`);
        } else {
            console.log('Timed out waiting for a 2xx sync response');
        }

        // 6. Verification
        // Give some extra time for DB to commit before reload
        await page.waitForTimeout(1000);
        await page.reload();

        // Refill search if cleared by reload
        await inventoryPage.search(SKU);

        // Use polling assert to be robust against data loading lag
        console.log('Starting final polling verification...');
        await expect(async () => {
            const currentQty = await card.innerText();
            console.log(`Current Card Text: ${currentQty}`);
            await expect(card.getByText('49', { exact: true })).toBeVisible();
        }).toPass({ timeout: 15000 });
    });
});
