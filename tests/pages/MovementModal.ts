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
        return this.page.getByLabel('Target Location');
    }

    private get confirmButton(): Locator {
        return this.page.getByRole('button', { name: /(Confirm Move|Create & Move)/ });
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
        await this.targetLocationInput.fill(targetLocation);

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
