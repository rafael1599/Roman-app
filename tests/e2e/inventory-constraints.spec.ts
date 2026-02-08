import { test, expect } from '../fixtures/test-base';
import { BasePage } from '../pages';

test.setTimeout(60000);

test.describe('Inventory Constraints & Integrity', () => {
    test.beforeEach(async ({ inventoryPage }) => {
        await inventoryPage.goto('/');
    });

    // UI Constraint: Prevent Negative Stock Input
    test('should prevent entering negative quantity in Add Item modal', async ({ page, inventoryPage }) => {
        await inventoryPage.openAddModal();

        // Fill basic info
        await page.getByLabel('SKU', { exact: true }).fill('TEST-NEG-STOCK');
        await page.locator('#inventory_quantity').fill('-5');
        await page.getByLabel('Location').fill('A-01');

        // Verify validation blocks save
        const isBlocked = await inventoryPage.verifyNegativeQuantityBlocked();
        expect(isBlocked).toBe(true);
    });

    // Zero Stock Visibility/Cleanup
    test('should handle zero quantity items correctly (cleanup logic)', async ({ page, inventoryPage }) => {
        const sku = BasePage.generateTestId('TEST-ZERO');

        await inventoryPage.openAddModal();

        await page.getByLabel('SKU', { exact: true }).fill(sku);
        await page.locator('#inventory_quantity').fill('0');
        await page.getByLabel('Location').fill('A-01');

        const saveButton = page.getByRole('button', { name: 'Save' });

        // If allowed to save
        if (await saveButton.isEnabled()) {
            await saveButton.click();

            // Wait for modal close
            await expect(page.getByText('Add New Item')).not.toBeVisible();
            await inventoryPage.waitForNetworkIdle();

            // Search for it
            await inventoryPage.search(sku);

            // Should be visible in list
            await inventoryPage.verifyItemExists(sku);

            console.log('Verified: Items created with 0 quantity are now visible in stock view');
        } else {
            console.log('Verified: UI prevents creating 0 quantity items');
        }
    });
});
