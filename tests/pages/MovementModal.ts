import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * MovementModal handles the stock relocation modal interactions.
 */
export class MovementModal extends BasePage {
    private get modalTitle(): Locator {
        return this.page.getByText('Relocate Stock');
    }

    private get targetLocationInput(): Locator {
        // The MovementModal uses AutocompleteInput with id="inventory_location"
        // But since InventoryModal (which also uses this ID) is closed at this point,
        // we scope to the visible modal overlay.
        return this.page.locator('.fixed.inset-0').locator('#inventory_location');
    }

    private get confirmButton(): Locator {
        return this.page.getByRole('button', { name: /Confirm Move/i });
    }

    /**
     * Wait for movement modal to be visible.
     */
    async waitForOpen(): Promise<void> {
        await this.waitForVisible(this.modalTitle);
    }

    /**
     * Wait for movement modal to close.
     */
    async waitForClose(): Promise<void> {
        await this.waitForHidden(this.modalTitle);
    }

    /**
     * Fill target location and confirm move.
     */
    async moveToLocation(targetLocation: string): Promise<void> {
        await this.waitForOpen();

        // Use fill() to reliably set the value (pressSequentially can drop chars)
        await this.targetLocationInput.fill(targetLocation);

        // Dismiss any autocomplete dropdown
        await this.targetLocationInput.press('Escape');
        await this.page.waitForTimeout(200);

        // Click the modal title to trigger input blur — this is what makes
        // the AutocompleteInput propagate its internal state to React and
        // run the blur handler (which may auto-correct the location).
        await this.page.locator('text=Relocate Stock').click();

        // Let blur handler + React state + validation fully settle
        await this.page.waitForTimeout(800);

        // Wait for button to become enabled (validation)
        await expect(this.confirmButton).toBeEnabled({ timeout: 10000 });
        await this.confirmButton.click();

        await this.waitForClose();
        await this.waitForNetworkIdle();
    }

    /**
     * Check if confirm button is enabled.
     */
    async isConfirmEnabled(): Promise<boolean> {
        return await this.confirmButton.isEnabled();
    }
}
