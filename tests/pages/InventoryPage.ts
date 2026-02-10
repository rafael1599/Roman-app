import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface AddItemData {
    sku: string;
    quantity: number;
    location: string;
    warehouse?: string;
    note?: string;
}

export interface MoveItemData {
    targetLocation: string;
    quantity?: number;
}

/**
 * InventoryPage encapsulates all inventory-related interactions.
 * Provides resilient methods with proper waits.
 */
export class InventoryPage extends BasePage {
    // Locators
    private get addButton(): Locator {
        return this.page.getByTitle('Add New SKU');
    }

    private get searchInput(): Locator {
        return this.page.getByPlaceholder('Search SKU, Loc, Warehouse...');
    }

    private get skuInput(): Locator {
        return this.page.getByLabel('SKU', { exact: true });
    }

    private get quantityInput(): Locator {
        return this.page.locator('#inventory_quantity');
    }

    private get locationInput(): Locator {
        return this.page.getByLabel('Location');
    }

    private get noteInput(): Locator {
        return this.page.getByLabel('Internal Note');
    }

    private get saveButton(): Locator {
        return this.page.getByRole('button', { name: 'Save' });
    }

    private get modalTitle(): Locator {
        return this.page.getByText(/Add New Item|Edit Item/i);
    }

    // --- Core Actions ---

    /**
     * Open the Add Item modal.
     */
    async openAddModal(): Promise<void> {
        await this.addButton.click();
        await this.waitForVisible(this.modalTitle);
    }

    /**
     * Add a new inventory item with proper waits.
     */
    async addItem(data: AddItemData): Promise<void> {
        await this.openAddModal();

        await this.skuInput.fill(data.sku);
        await this.quantityInput.fill(String(data.quantity));
        await this.locationInput.fill(data.location);

        if (data.note) {
            await this.noteInput.fill(data.note);
        }

        await expect(this.saveButton).toBeEnabled();
        await this.saveButton.click();

        // Wait for modal to close
        await this.waitForHidden(this.modalTitle);
        // Force wait for DB propagation
        await this.page.waitForTimeout(2000);
        await this.waitForNetworkIdle();
    }

    /**
     * Search for items and wait for results to stabilize.
     */
    async search(query: string): Promise<void> {
        await this.fillWithDebounce(this.searchInput, query, 500);
        await this.waitForNetworkIdle();
    }

    /**
     * Reload page and search for item with proper wait for data loading.
     */
    async reloadAndSearch(query: string): Promise<void> {
        await this.reload();
        // Extra wait for React Query to fetch fresh data
        await this.page.waitForTimeout(1000);
        await this.search(query);
    }

    /**
     * Get inventory card by SKU and location.
     */
    /**
     * Get inventory card by SKU and location.
     * Strategies:
     * 1. If location is provided, find the Location Group Header first, then find the card within that group.
     * 2. If no location, find any card with the SKU.
     */
    getCard(sku: string, location?: string): Locator {
        const base = this.page.locator('.bg-card');

        if (location) {
            // HYBRID STRATEGY:
            // 1. Grouped View: Location is in h3 header, cards are siblings/descendants.
            const groupedCard = this.page.locator('h3', { hasText: location })
                .locator('xpath=ancestor::div[contains(@class, "space-y-4")]')
                .locator('.bg-card')
                .filter({ hasText: sku })
                .last();

            // 2. Search View: Card contains location text itself.
            const searchCard = base.filter({ hasText: sku }).filter({ hasText: location }).last();

            // Use OR condition or just return according to which is visible/present
            // In Playwright we can use `or` but it might be ambiguous if both exist.
            // Usually only one view is active.
            return groupedCard.or(searchCard);
        }

        // Fallback: Find any card with SKU
        return base.filter({ hasText: sku }).last();
    }

    /**
     * Verify item exists in the list with retry mechanism for async data loading.
     */
    async verifyItemExists(sku: string, location?: string): Promise<void> {
        const card = this.getCard(sku, location);
        await this.retryUntilVisible(card, { timeout: 20000, reloadBetweenRetries: true });
    }

    /**
     * Verify item does NOT exist in the list.
     */
    async verifyItemNotExists(sku: string, location?: string): Promise<void> {
        const card = this.getCard(sku, location);
        await this.waitForHidden(card);
    }

    /**
     * Verify item quantity.
     */
    async verifyQuantity(sku: string, expectedQty: number, location?: string): Promise<void> {
        const card = this.getCard(sku, location);
        await expect(card).toContainText(String(expectedQty));
    }

    /**
     * Click move button on a specific card with retry for async loading.
     */
    async clickMoveOnCard(sku: string, location: string): Promise<void> {
        const card = this.getCard(sku, location);
        await this.retryUntilVisible(card, { timeout: 20000, reloadBetweenRetries: false });
        await card.getByLabel('Move item').click();
    }

    /**
     * Click on a card to open edit modal.
     */
    async clickCard(sku: string, location?: string): Promise<void> {
        const card = this.getCard(sku, location);
        await this.waitForVisible(card);
        await card.click();
    }

    /**
     * Fill negative quantity and verify validation.
     */
    async verifyNegativeQuantityBlocked(): Promise<boolean> {
        await this.quantityInput.fill('-5');

        // Check if save is disabled or error message shown
        const isDisabled = await this.saveButton.isDisabled();
        return isDisabled;
    }
}
