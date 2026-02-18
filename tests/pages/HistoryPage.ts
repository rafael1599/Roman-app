import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * HistoryPage encapsulates interactions with the activity logs / history screen.
 */
export class HistoryPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await super.goto('/history');
    }

    /**
     * Select a date filter (today, yesterday, week, month, all).
     */
    async selectDateFilter(filter: 'today' | 'yesterday' | 'week' | 'month' | 'all'): Promise<void> {
        // Target the specific date filter button. They are lowercase in the UI.
        const button = this.page.getByRole('button', { name: filter, exact: true });
        await this.waitForVisible(button);
        await button.click();

        // Wait for selection state (bg-accent)
        await expect(button).toHaveClass(/bg-accent/, { timeout: 10000 });

        // Wait for loading to finish
        const loader = this.page.getByText(/Scanning blockchain/i);
        try {
            if (await loader.isVisible()) {
                await expect(loader).not.toBeVisible({ timeout: 15000 });
            }
        } catch (e) { }

        await this.waitForNetworkIdle();
    }

    /**
     * Search for a SKU or location.
     */
    async search(query: string): Promise<void> {
        const input = this.page.getByPlaceholder(/Search SKU or Location/i);
        await input.fill(query);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(1000);
        await this.waitForNetworkIdle();
    }

    /**
     * Get a log entry by SKU or other unique text.
     */
    getLogEntry(sku: string): Locator {
        return this.page.locator('.group.relative').filter({ has: this.page.getByText(sku, { exact: true }) }).first();
    }

    /**
     * Get the undo button for a specific log entry.
     */
    getUndoButton(sku: string): Locator {
        // The button has a title attribute like "Undo Action" or "This record is over 48h old..."
        return this.getLogEntry(sku).locator('button');
    }

    /**
     * Click undo and confirm.
     */
    async undoAction(sku: string): Promise<void> {
        const button = this.getUndoButton(sku);
        await this.waitForVisible(button);
        // Wait for the button to be enabled - this implies data (inventoryData) has loaded
        await expect(button).toBeEnabled({ timeout: 10000 });
        await button.click({ force: true });

        // Wait for confirmation modal
        const modalButton = this.page.getByRole('button', { name: 'Undo', exact: true });
        await expect(modalButton).toBeVisible({ timeout: 5000 });
        await modalButton.click({ force: true });
        await this.waitForNetworkIdle();
    }

    /**
     * Verify a log is marked as reversed.
     */
    async verifyLogReversed(sku: string): Promise<void> {
        const log = this.getLogEntry(sku);
        await expect(log.getByText('Reversed')).toBeVisible();
    }

    /**
     * Verify the stale warning message is visible for a log.
     */
    async verifyStaleWarning(sku: string): Promise<void> {
        const log = this.getLogEntry(sku);
        await expect(log.getByText(/Manual Restock Required/i)).toBeVisible();
        await expect(log.getByText(/over 48 hours ago/i)).toBeVisible();
    }

    /**
     * Verify the undo button is disabled for a stale record.
     */
    async verifyUndoDisabled(sku: string): Promise<void> {
        const button = this.getUndoButton(sku);
        await expect(button).toBeDisabled();
    }
}
