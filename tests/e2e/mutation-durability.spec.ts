import { test, expect } from '../fixtures/test-base';
import { BasePage } from '../pages';

/**
 * CERTIFICATION TEST: Sync Mutation Lifecycle
 * This test verifies that mutations survive app reloads while offline.
 * This ensures the Mutation Registry and hydration logic are working correctly.
 */

const SKU = BasePage.generateSKU('DURABLE-SYNC');
const LOCATION = 'Row 1';

test.describe('Mutation Durability & Sync Lifecycle', () => {

    test.beforeEach(async ({ inventoryPage }) => {
        await inventoryPage.goto('/');

        // 1. Ensure seed item exists
        await inventoryPage.addItem({
            sku: SKU,
            quantity: 100,
            location: LOCATION
        });

        // 2. Search and verify
        await inventoryPage.reloadAndSearch(SKU);
        await inventoryPage.verifyItemExists(SKU, LOCATION);
    });

    test('should persist through reload while offline and sync when online', async ({ page, context, inventoryPage }) => {
        // Capture console logs for debugging durable mutations
        page.on('console', msg => {
            if (msg.text().includes('MutationRegistry') || msg.text().includes('FORENSIC')) {
                console.log(`[BROWSER] ${msg.text()}`);
            }
        });

        const card = inventoryPage.getCard(SKU, LOCATION);

        // --- STEP 1: SIMULATE OFFLINE (Block API) ---
        // Instead of context.setOffline(true), we block the RPC to allow the page shell to reload
        await page.route('**/rpc/adjust_inventory_quantity*', async (route) => {
            console.log('[TEST] Intercepted RPC - Simulating Connection Failure');
            await route.abort('failed');
        });
        console.log('[TEST] API Blocked');

        // --- STEP 2: TRIGGER MUTATION ---
        // Increase quantity (+1)
        await card.getByRole('button', { name: 'Increase quantity' }).click();

        // --- STEP 3: VERIFY OPTIMISTIC UI ---
        await expect(card.getByText('101', { exact: true })).toBeVisible();
        console.log('[TEST] Optimistic UI Verified (100 -> 101)');

        // Wait a bit for mutation to be persisted in IndexedDB
        // NOTE: Inventory has a 1.5s debounce. We MUST wait longer than that 
        // to ensure the mutation is actually triggered and enters the cache.
        await page.waitForTimeout(2000);

        // --- STEP 4: RELOAD WHILE "OFFLINE" ---
        console.log('[TEST] Reloading page while API is blocked...');
        await page.reload();
        await page.waitForLoadState('networkidle');

        // --- STEP 5: VERIFY PERSISTENCE IN HISTORY (Hydrated Mutation) ---
        // We check history because main inventory query will refetch from server (100)
        // while the mutation stays in the cache as 'pending'.
        await page.getByRole('button', { name: 'HISTORY' }).click();

        // Locate the hydrated mutation for debugging
        await page.evaluate(() => {
            const cache = (window as any).queryClient.getMutationCache().getAll();
            console.log(`[MutationRegistry][TEST_INSPECT] Mutations recovered: ${cache.length}`);
            cache.forEach((m: any, i: number) => {
                console.log(`[MutationRegistry][TEST_INSPECT] #${i}: key=${JSON.stringify(m.options.mutationKey)} status=${m.state.status} isPaused=${m.state.isPaused}`);
                console.log(`[MutationRegistry][TEST_INSPECT] #${i} variables:`, JSON.stringify(m.state.variables));
            });
        });

        // The mutation should be visible in history as an optimistic log
        await expect(page.locator('div.group.relative', { hasText: SKU }).first()).toBeVisible({ timeout: 15000 });
        console.log('[TEST] Durable Mutation Verified in History');

        // --- STEP 6: RESTORE NETWORK (Unblock API) ---
        await page.unroute('**/rpc/adjust_inventory_quantity*');
        console.log('[TEST] API Unblocked');

        // Force TanStack Query to recognize network is back
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        console.log('[TEST] Dispatched "online" event');

        // Go back to inventory to see it finish
        await page.getByRole('button', { name: 'STOCK' }).click();
        await inventoryPage.search(SKU);

        // --- STEP 7: VERIFY SUCCESSFUL SYNC ---
        // The mutation should now resume and eventually update the server
        console.log('[TEST] Waiting for sync RPC to succeed...');
        await expect(async () => {
            // Refetch or wait for realtime
            const currentQty = await card.innerText();
            if (!currentQty.includes('101')) throw new Error(`Still at ${currentQty}`);
        }).toPass({ timeout: 30000 });

        console.log('[TEST] Certification PASSED: Mutation resumed and applied.');
    });
});
