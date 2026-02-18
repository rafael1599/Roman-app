import { test, expect } from '../fixtures/test-base';

test.describe('Inventory Undo Constraints (DB Level)', () => {
    const SKU_PREFIX = 'UNDO-RPC-TEST';

    test.beforeEach(async ({ supabaseAdmin }) => {
        // Ensure SKUs exist in metadata (only 'sku' column exists in this project)
        const skus = Array.from({ length: 5 }, (_, i) => ({
            sku: `${SKU_PREFIX}-${i + 1}`,
        }));
        await supabaseAdmin.from('sku_metadata').upsert(skus, { onConflict: 'sku' });

        // Clean up previous test runs for these SKUs
        await supabaseAdmin.from('inventory_logs').delete().ilike('sku', `${SKU_PREFIX}-%`);
        await supabaseAdmin.from('inventory').delete().ilike('sku', `${SKU_PREFIX}-%`);
    });

    test('RPC: Should revive a deleted item (Undo DEDUCT)', async ({ supabaseAdmin }) => {
        const sku = `${SKU_PREFIX}-1`;
        const dummyId = 999901;
        // Simulate a log where item was removed (quantity 5 -> 0)
        // snapshot_before has the state we want to return to
        const { data: log, error } = await supabaseAdmin.from('inventory_logs').insert({
            sku,
            item_id: dummyId,
            action_type: 'DEDUCT',
            quantity_change: -5,
            from_warehouse: 'LUDLOW',
            from_location: 'A-01',
            snapshot_before: {
                id: dummyId, sku, quantity: 5, warehouse: 'LUDLOW', location: 'A-01', is_active: true
            },
            is_reversed: false
        }).select().single();
        expect(error).toBeNull();

        // Perform Undo via RPC
        const { data: res, error: rpcError } = await supabaseAdmin.rpc('undo_inventory_action', { target_log_id: log.id });
        expect(rpcError).toBeNull();
        expect(res.success, `RPC Failed: ${res?.message}`).toBe(true);

        // Verify Inventory is revived
        const { data: item } = await supabaseAdmin.from('inventory').select().eq('id', dummyId).single();
        expect(item).not.toBeNull();
        expect(item.quantity).toBe(5);
        expect(item.warehouse).toBe('LUDLOW');
    });

    test('RPC: Should adjust quantity for existing item (Undo ADD)', async ({ supabaseAdmin }) => {
        const sku = `${SKU_PREFIX}-2`;
        const dummyId = 999902;
        // 1. Setup existing item (10 units)
        await supabaseAdmin.from('inventory').insert({
            id: dummyId, sku, quantity: 10, warehouse: 'LUDLOW', location: 'A-02', is_active: true
        });

        // 2. Create log representing the ADD of 5 units (5 -> 10)
        // We want to undo this ADD, so we expect quantity to go back to 5
        const { data: log } = await supabaseAdmin.from('inventory_logs').insert({
            sku,
            item_id: dummyId,
            action_type: 'ADD',
            quantity_change: 5,
            to_warehouse: 'LUDLOW',
            to_location: 'A-02',
            snapshot_before: {
                id: dummyId, sku, quantity: 5, warehouse: 'LUDLOW', location: 'A-02', is_active: true
            },
            is_reversed: false
        }).select().single();

        // Perform Undo
        const { data: res } = await supabaseAdmin.rpc('undo_inventory_action', { target_log_id: log.id });
        expect(res.success, `RPC Failed: ${res?.message}`).toBe(true);

        // Verify Quantity Reduced
        const { data: item } = await supabaseAdmin.from('inventory').select().eq('id', dummyId).single();
        expect(item.quantity).toBe(5);
    });

    test('RPC: Should fail if already reversed', async ({ supabaseAdmin }) => {
        const sku = `${SKU_PREFIX}-3`;
        const { data: log } = await supabaseAdmin.from('inventory_logs').insert({
            sku,
            action_type: 'MOVE',
            quantity_change: 1,
            from_warehouse: 'ATS', from_location: 'LOC-1',
            to_warehouse: 'ATS', to_location: 'LOC-2',
            is_reversed: true // Already true
        }).select().single();

        const { data: res } = await supabaseAdmin.rpc('undo_inventory_action', { target_log_id: log.id });
        expect(res.success).toBe(false);
        expect(res.message).toContain('already reversed');
    });

    test('RPC: Should fail gracefully for non-existent log', async ({ supabaseAdmin }) => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const { data: res } = await supabaseAdmin.rpc('undo_inventory_action', { target_log_id: fakeId });
        expect(res.success).toBe(false);
        expect(res.message).toContain('not found');
    });
});
