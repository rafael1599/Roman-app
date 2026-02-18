import { test, expect } from '../fixtures/test-base';
import { BasePage } from '../pages';

test.setTimeout(60000);

test('DEBUG: smart merge move v3', async ({ inventoryPage, movementModal, page }) => {
    const sku = BasePage.generateTestId('TEST-DBGM3');
    const locA = 'LOC-A';
    const locB = 'LOC-B';

    await inventoryPage.goto('/');
    await inventoryPage.addItem({ sku, quantity: 10, location: locA });
    await inventoryPage.addItem({ sku, quantity: 5, location: locB });
    await inventoryPage.reloadAndSearch(sku);

    await inventoryPage.clickMoveOnCard(sku, locB);
    await expect(page.getByText('Relocate Stock')).toBeVisible({ timeout: 5000 });

    // Inspect initial quantity
    const initialQty = await page.locator('input[type="number"]').inputValue();
    console.log(`DEBUG: Initial Qty in modal: "${initialQty}"`);

    // Target location
    const input = page.locator('.fixed.inset-0').locator('#inventory_location');
    await input.fill(locA);
    
    // Trigger blur
    await page.locator('text=Relocate Stock').click();
    await page.waitForTimeout(1000);

    // Deep inspection of the DOM for hidden errors or state
    const finalInspection = await page.evaluate(() => {
        const modal = document.querySelector('.fixed.inset-0');
        if (!modal) return 'MODAL_NOT_FOUND';

        const qtyInput = modal.querySelector('input[type="number"]') as HTMLInputElement;
        const locInput = modal.querySelector('#inventory_location') as HTMLInputElement;
        const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent?.includes('Confirm Move'));
        
        // Look for any text that looks like an error message (usually red)
        const allElements = Array.from(modal.querySelectorAll('*'));
        const redTexts = allElements
            .filter(el => {
                const style = window.getComputedStyle(el);
                return style.color === 'rgb(239, 68, 68)' || style.color === 'rgb(220, 38, 38)' || el.classList.contains('text-red-500');
            })
            .map(el => el.textContent?.trim())
            .filter(t => t && t.length > 0);

        return {
            qty: qtyInput?.value,
            loc: locInput?.value,
            btnDisabled: confirmBtn?.disabled,
            btnClasses: confirmBtn?.className,
            potentialErrors: redTexts,
            allText: modal.textContent?.slice(0, 500)
        };
    });

    console.log(`DEBUG: Final Inspection: ${JSON.stringify(finalInspection)}`);
});
