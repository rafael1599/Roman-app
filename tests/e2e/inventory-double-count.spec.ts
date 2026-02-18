import { test, expect } from '../fixtures/test-base';
import { BasePage } from '../pages';

test.setTimeout(60000);

test.describe('Inventory Double-Counting Verification', () => {
    test.beforeEach(async ({ inventoryPage }) => {
        await inventoryPage.goto('/');
    });

    test('should increment quantity exactly once after a single click and debounce', async ({ inventoryPage }) => {
        const sku = BasePage.generateTestId('FIX-DOUBLE');
        const loc = 'LOC-FIX';

        // 1. Setup: Add an item with quantity 10
        await inventoryPage.addItem({
            sku,
            quantity: 10,
            location: loc,
        });

        await inventoryPage.reloadAndSearch(sku);
        await inventoryPage.verifyQuantity(sku, 10, loc);

        // 2. Action: Click increment once
        const card = inventoryPage.getCard(sku, loc);
        await card.getByLabel('Increase quantity').click();

        // 3. Immediate check: Should be 11
        await inventoryPage.verifyQuantity(sku, 11, loc);

        // 4. Wait for debounce (1500ms) + buffer
        console.log('Waiting for debounce (2.5s)...');
        await inventoryPage.page.waitForTimeout(2500);

        // 5. Post-debounce check: Should STILL be 11 (Bug would make it 12)
        const currentQtyText = await card.locator('.text-2xl.font-black').innerText();
        console.log(`Quantity after debounce: ${currentQtyText}`);

        expect(currentQtyText).toBe('11');

        // 6. Reload and verify server truth
        await inventoryPage.reloadAndSearch(sku);
        await inventoryPage.verifyQuantity(sku, 11, loc);
    });

    test('should handle rapid clicks correctly without double-counting each click', async ({ inventoryPage }) => {
        const sku = BasePage.generateTestId('FIX-RAPID');
        const loc = 'LOC-RAPID';

        await inventoryPage.addItem({
            sku,
            quantity: 20,
            location: loc,
        });

        await inventoryPage.reloadAndSearch(sku);

        // Rapidly click 3 times
        const card = inventoryPage.getCard(sku, loc);
        const plusButton = card.getByLabel('Increase quantity');

        await plusButton.click();
        await plusButton.click();
        await plusButton.click();

        // Immediate check: Should be 23
        await inventoryPage.verifyQuantity(sku, 23, loc);

        // Wait for debounce
        await inventoryPage.page.waitForTimeout(2500);

        // Should STILL be 23
        const currentQtyText = await card.locator('.text-2xl.font-black').innerText();
        expect(currentQtyText).toBe('23');

        // Verify server truth
        await inventoryPage.reloadAndSearch(sku);
        await inventoryPage.verifyQuantity(sku, 23, loc);
    });
});
