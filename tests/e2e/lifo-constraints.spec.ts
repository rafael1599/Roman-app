import { test, expect } from '../fixtures/test-base';

test.describe('LIFO Undo Constraints', () => {
    const SKU_PREFIX = 'LIFO-TEST';

    test.beforeEach(async ({ supabaseAdmin }) => {
        // Ensure SKUs exist in metadata
        const skus = Array.from({ length: 5 }, (_, i) => ({
            sku: `${SKU_PREFIX}-${i + 1}`,
        }));
        await supabaseAdmin.from('sku_metadata').upsert(skus, { onConflict: 'sku' });

        // Cleanup
        await supabaseAdmin.from('inventory_logs').delete().ilike('sku', `${SKU_PREFIX}-%`);
        await supabaseAdmin.from('inventory').delete().ilike('sku', `${SKU_PREFIX}-%`);
    });

    test('LIFO: Should block undoing an older action', async ({ supabaseAdmin }) => {
        const sku = `${SKU_PREFIX}-1`;
        const item_id = 999101;
        const warehouse = 'LUDLOW';
        const location1 = 'A-01';

        // 1. Initial State: Action 1 (Restock 10)
        // Log ID 1 (Older)
        const { data: log1 } = await supabaseAdmin.from('inventory_logs').insert({
            sku,
            item_id,
            action_type: 'ADD',
            quantity_change: 10,
            to_warehouse: warehouse,
            to_location: location1,
            created_at: new Date(Date.now() - 10000).toISOString(), // 10s ago
            snapshot_before: { id: item_id, quantity: 0, is_active: false }
        }).select().single();

        // 2. Subsequent State: Action 2 (Deduct 2)
        // Log ID 2 (Newer)
        await supabaseAdmin.from('inventory_logs').insert({
            sku,
            item_id,
            action_type: 'DEDUCT',
            quantity_change: -2,
            from_warehouse: warehouse,
            from_location: location1,
            created_at: new Date().toISOString(), // Now
            is_reversed: false
        });

        // 3. Attempt to Undo Action 1 (Should Fail because Action 2 exists)
        const { data: res } = await supabaseAdmin.rpc('undo_inventory_action', { target_log_id: log1.id });

        expect(res.success).toBe(false);
        expect(res.message).toContain('LIFO Violation');
    });

    test('LIFO: Should allow undoing the most recent action', async ({ supabaseAdmin }) => {
        const sku = `${SKU_PREFIX}-2`;
        const item_id = 999102;

        // Action 1 (Restock)
        await supabaseAdmin.from('inventory_logs').insert({
            sku,
            item_id,
            action_type: 'ADD',
            quantity_change: 10,
            created_at: new Date(Date.now() - 10000).toISOString(),
            snapshot_before: { id: item_id, quantity: 0 }
        });

        // Action 2 (Recent - To be undone)
        const { data: log2 } = await supabaseAdmin.from('inventory_logs').insert({
            sku,
            item_id,
            action_type: 'DEDUCT',
            quantity_change: -2,
            created_at: new Date().toISOString(),
            snapshot_before: { id: item_id, quantity: 10 }
        }).select().single();

        // Attempt Undo Action 2 (Should Succeed)
        const { data: res } = await supabaseAdmin.rpc('undo_inventory_action', { target_log_id: log2.id });

        expect(res.success).toBe(true);
    });
});
