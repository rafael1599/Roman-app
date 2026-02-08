import { test as base, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { InventoryPage, MovementModal } from '../pages';
import 'dotenv/config';

type MyFixtures = {
    inventoryPage: InventoryPage;
    movementModal: MovementModal;
    dbCleanup: void;
};

export const test = base.extend<MyFixtures>({
    // Automatic database cleanup before each test
    dbCleanup: [async ({ }, use) => {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && serviceRoleKey) {
            const supabase = createClient(supabaseUrl, serviceRoleKey);

            // Clean up tables in order of dependency to avoid foreign key violations
            // inventory_logs -> inventory
            // picking_notes -> picking_lists

            // We use .neq('id', -1) or similar to target all rows without needing a specific ID
            try {
                // Delete logs first as they reference inventory/lists
                await supabase.from('inventory_logs').delete().neq('id', 0);
                await supabase.from('picking_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                await supabase.from('picking_lists').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                await supabase.from('inventory').delete().neq('id', 0);

                // Optional: Clean up test customers if any are created during tests
                // await supabase.from('customers').delete().ilike('name', 'TEST-%');

                console.log('✅ [Fixture] Database cleaned up');
            } catch (err) {
                console.error('❌ [Fixture] Database cleanup failed:', err);
            }
        } else {
            console.warn('⚠️ [Fixture] Database cleanup skipped: Supabase URL/Key missing');
        }

        await use();
    }, { auto: true }],

    inventoryPage: async ({ page }, use) => {
        const inventoryPage = new InventoryPage(page);
        await use(inventoryPage);
    },

    movementModal: async ({ page }, use) => {
        const movementModal = new MovementModal(page);
        await use(movementModal);
    },
});

export { expect };
