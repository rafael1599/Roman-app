import { Page, Locator, expect } from '@playwright/test';

/**
 * BasePage provides common utilities for all page objects.
 * Centralizes wait strategies and common interactions.
 */
export abstract class BasePage {
    constructor(protected readonly page: Page) { }

    /**
     * Navigate to a URL with proper wait for network idle.
     */
    async goto(path: string = '/'): Promise<void> {
        await this.page.goto(path, { waitUntil: 'networkidle' });
    }

    /**
     * Reload with network idle wait to prevent race conditions.
     */
    async reload(): Promise<void> {
        await this.page.reload({ waitUntil: 'networkidle' });
    }

    /**
     * Wait for network to be idle (no pending requests).
     */
    /**
     * Wait for network to be idle (simulated).
     * Realtime connections prevent true networkidle, so we rely on domcontentloaded + buffer.
     */
    async waitForNetworkIdle(): Promise<void> {
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(500);
    }

    /**
     * Wait for a specific element to be visible with custom timeout.
     * Uses polling for better resilience with async data loading.
     */
    async waitForVisible(locator: Locator, timeout = 10000): Promise<void> {
        await expect(locator).toBeVisible({ timeout });
    }

    /**
     * Retry an action until it succeeds or times out.
     * Useful for operations that depend on async data loading.
     */
    async retryUntilVisible(
        locator: Locator,
        options: { timeout?: number; interval?: number; reloadBetweenRetries?: boolean } = {}
    ): Promise<void> {
        const { timeout = 20000, interval = 2000, reloadBetweenRetries = false } = options;
        const startTime = Date.now();
        let lastError: Error | null = null;

        while (Date.now() - startTime < timeout) {
            try {
                await expect(locator).toBeVisible({ timeout: interval });
                return; // Success!
            } catch (err) {
                lastError = err as Error;
                if (reloadBetweenRetries) {
                    await this.reload();
                }
                await this.page.waitForTimeout(500);
            }
        }

        throw lastError || new Error(`Element not visible after ${timeout}ms`);
    }

    /**
     * Wait for a specific element to be hidden.
     */
    async waitForHidden(locator: Locator, timeout = 10000): Promise<void> {
        await expect(locator).not.toBeVisible({ timeout });
    }

    /**
     * Fill input with debounce wait for reactive UIs.
     */
    async fillWithDebounce(locator: Locator, value: string, debounceMs = 300): Promise<void> {
        await locator.fill(value);
        await this.page.waitForTimeout(debounceMs);
    }

    /**
     * Click with wait for network settle.
     */
    async clickAndWait(locator: Locator): Promise<void> {
        await locator.click();
        await this.waitForNetworkIdle();
    }

    /**
     * Generate unique test identifier.
     */
    static generateTestId(prefix: string): string {
        return `${prefix}-${Date.now()}`;
    }

    /**
     * Standard generator for test SKUs.
     */
    static generateSKU(prefix: string = 'TEST'): string {
        return this.generateTestId(prefix);
    }

    /**
     * Standard generator for test customers.
     */
    static generateCustomer(prefix: string = 'CUSTOMER'): string {
        return this.generateTestId(prefix);
    }
}
